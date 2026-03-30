// ── Constants ──────────────────────────────────────────────────────────────────
export const SK = { inst: 'plux_inst_v4', cfg: 'plux_cfg_v4' };
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_CFG = { gClientId: '', autoRefresh: false };

// ── Storage ────────────────────────────────────────────────────────────────────
export const load = (k, d) => { try { const v = localStorage.getItem(k); return v != null ? JSON.parse(v) : d; } catch { return d; } };
export const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const uid = () => Math.random().toString(36).slice(2, 10);

// ── Formatting ─────────────────────────────────────────────────────────────────
export const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtTs = (ts) => ts ? new Date(ts).toLocaleString('en-NZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never';
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
  ['Booked On',    b => b.createdAt ?? b.insertionTime ?? ''],
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
  const meta = JSON.stringify({ name: filename, mimeType: 'text/csv' });
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
