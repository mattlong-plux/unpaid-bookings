// netlify/functions/hostaway.js
// CommonJS format required for Netlify Functions (not ES modules).
// Supports two actions:
//   action: 'unpaid' — fetch unpaid bookings (existing behaviour)
//   action: 'gaps'   — fetch all active reservations for gap-night analysis

const HA_BASE = 'https://api.hostaway.com/v1';

async function haAuth(accountId, secret) {
  const r = await fetch(HA_BASE + '/accessTokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: accountId,
      client_secret: secret,
      scope: 'general'
    })
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Auth failed (${r.status}): ${text.slice(0, 200)}`);
  let d;
  try { d = JSON.parse(text); } catch { throw new Error(`Auth returned invalid JSON (${r.status})`); }
  if (!d.access_token) throw new Error('No access_token returned. Check your Account ID and Secret.');
  return d.access_token;
}

async function fetchPages(token, params, maxRows = 600) {
  let all = [], offset = 0, limit = 100;
  while (true) {
    const p = new URLSearchParams({ ...params, limit: String(limit), offset: String(offset) });
    const r = await fetch(`${HA_BASE}/reservations?${p}`, {
      headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Reservations fetch failed (${r.status}): ${text.slice(0, 200)}`);
    let d;
    try { d = JSON.parse(text); } catch { throw new Error(`Reservations returned invalid JSON (${r.status})`); }
    const rows = d.result || d.results || [];
    all = [...all, ...rows];
    if (rows.length < limit) break;
    offset += limit;
    if (offset >= maxRows) break;
  }
  return all;
}

async function fetchUnpaid(token) {
  const ALLOWED = ['confirmed', 'new', 'modified', 'pending', 'awaiting payment'];
  const rows = await fetchPages(token, { includeResources: '1' }, 600);
  return rows.filter(b => {
    const status = (b.status || '').toLowerCase();
    const payStatus = (b.paymentStatus || '').toLowerCase();
    return ALLOWED.includes(status) && payStatus !== 'paid' && !b.isPaid;
  });
}

async function fetchGaps(token) {
  // Fetch active reservations from today through 90 days out
  const ACTIVE = ['confirmed', 'new', 'modified', 'pending', 'awaiting payment'];
  const today = new Date();
  const future = new Date(today);
  future.setDate(future.getDate() + 90);
  const fmt = d => d.toISOString().slice(0, 10);

  const rows = await fetchPages(token, {
    includeResources: '1',
    checkInDateFrom: fmt(today),
    checkInDateTo: fmt(future),
  }, 1200);

  return rows.filter(b => ACTIVE.includes((b.status || '').toLowerCase()));
}

// CommonJS export — required for Netlify Functions
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { accountId, secret, action = 'unpaid' } = body;
  if (!accountId || !secret) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accountId and secret are required' }) };
  }

  try {
    const token = await haAuth(accountId, secret);
    if (action === 'gaps') {
      const reservations = await fetchGaps(token);
      return { statusCode: 200, headers, body: JSON.stringify({ reservations }) };
    } else {
      const bookings = await fetchUnpaid(token);
      return { statusCode: 200, headers, body: JSON.stringify({ bookings }) };
    }
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: err.message }) };
  }
};
