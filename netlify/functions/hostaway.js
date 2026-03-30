// netlify/functions/hostaway.js
// CommonJS format required for Netlify Functions (not ES modules).
// Proxies Hostaway API calls server-side — no CORS issues, credentials stay server-side.

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
  if (!r.ok) {
    throw new Error(`Auth failed (${r.status}): ${text.slice(0, 200)}`);
  }

  let d;
  try { d = JSON.parse(text); } catch {
    throw new Error(`Auth returned invalid JSON (${r.status})`);
  }

  if (!d.access_token) {
    throw new Error('No access_token returned. Check your Account ID and Secret.');
  }
  return d.access_token;
}

async function fetchUnpaid(token) {
  let all = [], offset = 0, limit = 100;

  while (true) {
    const params = new URLSearchParams({
      includeResources: '1',
      limit: String(limit),
      offset: String(offset)
    });

    const r = await fetch(`${HA_BASE}/reservations?${params}`, {
      headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }
    });

    const text = await r.text();
    if (!r.ok) {
      throw new Error(`Reservations fetch failed (${r.status}): ${text.slice(0, 200)}`);
    }

    let d;
    try { d = JSON.parse(text); } catch {
      throw new Error(`Reservations returned invalid JSON (${r.status})`);
    }

    const rows = d.result || d.results || [];
    const ALLOWED_STATUSES = ['confirmed', 'new', 'modified', 'pending', 'awaiting payment'];
    const filtered = rows.filter(b => {
      const status = (b.status || '').toLowerCase();
      const paymentStatus = (b.paymentStatus || '').toLowerCase();
      return ALLOWED_STATUSES.includes(status) && paymentStatus !== 'paid' && !b.isPaid;
    });
    all = [...all, ...filtered];

    if (rows.length < limit) break;
    offset += limit;
    if (offset >= 600) break;
  }

  return all;
}

// CommonJS export — required for Netlify Functions
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { accountId, secret } = body;
  if (!accountId || !secret) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'accountId and secret are required' })
    };
  }

  try {
    const token = await haAuth(accountId, secret);
    const bookings = await fetchUnpaid(token);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ bookings })
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
