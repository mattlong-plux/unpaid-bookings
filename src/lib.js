// ── Constants ──────────────────────────────────────────────────────────────────
export const SK = { inst: 'plux_inst_v4', cfg: 'plux_cfg_v4' };
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_CFG = { gClientId: '', autoRefresh: false };

// ── Storage ────────────────────────────────────────────────────────────────────
export const load = (k, d) => { try { const v = localStorage.getItem(k); return v != null ? JSON.parse(v) : d; } catch { return d; } };
export const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const uid = () => Math.random().toString(36).slice(2, 10);

// ── Formatting ─────────────────────────────────────────────────────────────────
// Formats a date string like "2026-02-18" → "18 Feb 2026"
export const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const date = new Date(String(d).length === 10 ? d + 'T12:00:00' : d);
    if (isNaN(date)) return '—';
    return date.toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

// Formats a Unix timestamp (seconds or ms) or ISO string → "18 Feb, 02:30"
export const fmtTs = (ts) => {
  if (!ts) return 'Never';
  try {
    // Hostaway returns Unix seconds (10 digits); JS needs milliseconds (13 digits)
    const ms = String(ts).length <= 10 ? Number(ts) * 1000 : Number(ts);
    const date = new Date(ms);
    if (isNaN(date)) return 'Never';
    return date.toLocaleString('en-NZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return 'Never'; }
};

// Formats a booking date — handles Unix timestamps (seconds), ISO strings, or YYYY-MM-DD
export const fmtBookingDate = (val) => {
  if (!val) return '—';
  const n = Number(val);
  if (!isNaN(n) && n > 1000000000) {
    // Unix timestamp — convert seconds → ms if needed
    const ms = String(val).length <= 10 ? n * 1000 : n;
    try {
      const date = new Date(ms);
      if (isNaN(date)) return '—';
      return date.toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return '—'; }
  }
  return fmtDate(val);
};
export const fmtAmt = (n, cur = 'NZD') => {
  if (n == null || n === '') return '—';
  try { return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: cur || 'NZD', minimumFractionDigits: 2 }).format(Number(n)); }
  catch { return `${cur} ${Number(n).toFixed(2)}`; }
};

// ── Hostaway API (via Netlify serverless proxy) ────────────────────────────────
export async function fetchUnpaidBookings(accountId, secret) {
  let r;
  try {
    r = await fetch('/.netlify/functions/hostaway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, secret })
    });
  } catch (e) {
    throw new Error(`Network error — could not reach the server: ${e.message}`);
  }

  const text = await r.text();
  if (!text) {
    throw new Error(`Empty response (${r.status}). Check Netlify → Functions tab to confirm the function deployed.`);
  }

  let d;
  try { d = JSON.parse(text); } catch {
    throw new Error(`Unexpected server response (${r.status}): ${text.slice(0, 120)}`);
  }

  if (!r.ok) throw new Error(d.error || `Server error (${r.status})`);
  return d.bookings || [];
}

// ── CSV ────────────────────────────────────────────────────────────────────────
const CSV_COLS = [
  ['Booking ID',   b => b.id ?? b.reservationId ?? ''],
  ['Guest Name',   b => b.guestName ?? ''],
  ['Guest Email',  b => b.guestEmail ?? ''],
  ['Property',     b => b.listingName ?? b.unitName ?? b.propertyName ?? ''],
  ['Channel',      b => b.channelName ?? b.source ?? ''],
  ['Check-in',     b => b.checkInDate ?? b.arrivalDate ?? ''],
  ['Check-out',    b => b.checkOutDate ?? b.departureDate ?? ''],
  ['Nights',       b => b.nightsCount ?? b.nights ?? ''],
  ['Guests',       b => b.guestCount ?? b.numberOfGuests ?? ''],
  ['Total Amount', b => b.totalPrice ?? b.price ?? ''],
  ['Currency',     b => b.currency ?? 'NZD'],
  ['Status',       b => b.status ?? ''],
  ['Payment Status', b => b.paymentStatus ?? ''],
  ['Booked On',    b => { const v = b.insertionTime || b.reservationDate || b.createdAt || b.bookingDate; if (!v) return ''; const n = Number(v); if (!isNaN(n) && n > 1000000000) { return new Date(String(v).length <= 10 ? n*1000 : n).toISOString().slice(0,10); } return String(v); }],
];

const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function makeCSV(bookings) {
  const hdr = CSV_COLS.map(([h]) => esc(h)).join(',');
  const rows = bookings.map(b => CSV_COLS.map(([, fn]) => esc(fn(b))).join(','));
  return '\uFEFF' + [hdr, ...rows].join('\n');
}

export function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Google Drive ───────────────────────────────────────────────────────────────
let _tokenClient = null;

function getGoogleToken(clientId) {
  return new Promise((res, rej) => {
    if (!window.google?.accounts?.oauth2) { rej(new Error('Google Identity Services not loaded. Reload the page.')); return; }
    if (!_tokenClient || _tokenClient._clientId !== clientId) {
      _tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: () => {},
      });
      _tokenClient._clientId = clientId;
    }
    _tokenClient.callback = r => r.error ? rej(new Error(r.error_description || r.error)) : res(r.access_token);
    _tokenClient.requestAccessToken({ prompt: '' });
  });
}

export async function uploadToDrive(csv, filename, clientId) {
  const token = await getGoogleToken(clientId);
  // Setting mimeType to Google Sheets causes Drive to auto-convert the CSV into a native Sheet
  const sheetName = filename.replace(/\.csv$/i, '');
  const meta = JSON.stringify({
    name: sheetName,
    mimeType: 'application/vnd.google-apps.spreadsheet'
  });
  const bnd = 'plux_bnd_xk7';
  const body = `--${bnd}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${bnd}\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${bnd}--`;
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${bnd}` },
    body
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`Drive upload failed (${r.status}): ${t.slice(0, 150)}`); }
  return r.json();
}

// ── Gap Night Detection ────────────────────────────────────────────────────────
export async function fetchGapReservations(accountId, secret) {
  let r;
  try {
    r = await fetch('/.netlify/functions/hostaway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, secret, action: 'gaps' })
    });
  } catch (e) {
    throw new Error(`Network error: ${e.message}`);
  }
  const text = await r.text();
  if (!text) throw new Error(`Empty response (${r.status}). Check Netlify → Functions tab.`);
  let d;
  try { d = JSON.parse(text); } catch { throw new Error(`Unexpected response (${r.status}): ${text.slice(0, 120)}`); }
  if (!r.ok) throw new Error(d.error || `Server error (${r.status})`);

  return d.reservations || [];
}

// Find 1-night gaps between consecutive bookings at the same listing.
// Returns array of gap objects, each with the departing and arriving reservation.
export function findGaps(reservations) {
  // Group by listing
  const byListing = {};
  for (const res of reservations) {
    const key = res.listingId || res.listingMapId || res.unitId || res.listingName || 'unknown';
    if (!byListing[key]) byListing[key] = { name: res.listingName || res.unitName || `Listing ${key}`, reservations: [] };
    byListing[key].reservations.push(res);
  }

  const gaps = [];
  for (const { name: listingName, reservations: resList } of Object.values(byListing)) {
    // Sort by check-in date
    const sorted = [...resList].sort((a, b) => {
      const ad = a.checkInDate || a.arrivalDate || '';
      const bd = b.checkInDate || b.arrivalDate || '';
      return ad.localeCompare(bd);
    });

    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      const checkout = curr.checkOutDate || curr.departureDate;
      const checkin  = next.checkInDate  || next.arrivalDate;
      if (!checkout || !checkin) continue;

      // Calculate gap in nights
      const checkoutMs = new Date(checkout + 'T12:00:00').getTime();
      const checkinMs  = new Date(checkin  + 'T12:00:00').getTime();
      const nights = Math.round((checkinMs - checkoutMs) / 86400000);

      if (nights === 1) {
        gaps.push({
          listingName,
          gapNight: checkout,            // the available night
          departing: curr,               // guest checking out before the gap
          arriving:  next,               // guest checking in after the gap
        });
      }
    }
  }

  // Sort gaps by gap night date
  return gaps.sort((a, b) => a.gapNight.localeCompare(b.gapNight));
}

// CSV for gap nights export
export function makeGapsCSV(gaps) {
  const cols = [
    ['Listing',              g => g.listingName],
    ['Gap Night',            g => g.gapNight],
    ['Departing Guest',      g => g.departing.guestName || ''],
    ['Departing Channel',    g => g.departing.channelName || g.departing.source || ''],
    ['Departing Checkout',   g => g.departing.checkOutDate || g.departing.departureDate || ''],
    ['Departing Message URL',g => { const cid = g.departing.conversationId||g.departing.guestConversationId||g.departing.conversation_id||g.departing.messageThreadId||g.departing.threadId||null; return cid ? `https://dashboard.hostaway.com/messages/inbox/${cid}` : ''; }],
    ['Arriving Guest',       g => g.arriving.guestName || ''],
    ['Arriving Channel',     g => g.arriving.channelName || g.arriving.source || ''],
    ['Arriving Checkin',     g => g.arriving.checkInDate || g.arriving.arrivalDate || ''],
    ['Arriving Message URL', g => { const cid = g.arriving.conversationId||g.arriving.guestConversationId||g.arriving.conversation_id||g.arriving.messageThreadId||g.arriving.threadId||null; return cid ? `https://dashboard.hostaway.com/messages/inbox/${cid}` : ''; }],
  ];
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const hdr = cols.map(([h]) => esc(h)).join(',');
  const rows = gaps.map(g => cols.map(([, fn]) => esc(fn(g))).join(','));
  return '\uFEFF' + [hdr, ...rows].join('\n');
}
