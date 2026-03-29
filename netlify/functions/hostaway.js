// netlify/functions/hostaway.js
// Proxies Hostaway API calls server-side — no CORS issues, credentials never exposed in browser network tab.

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
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Auth failed (${r.status}): ${t.slice(0, 200)}`);
  }
  const d = await r.json();
  if (!d.access_token) throw new Error('No access_token returned. Check your Account ID and Secret.');
  return d.access_token;
}

async function fetchUnpaid(token) {
  let all = [], offset = 0, limit = 100;
  while (true) {
    const params = new URLSearchParams({
      isPaid: '0',
      includeResources: '1',
      limit: String(limit),
      offset: String(offset)
    });
    const r = await fetch(`${HA_BASE}/reservations?${params}`, {
      headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Reservations fetch failed (${r.status}): ${t.slice(0, 200)}`);
    }
    const d = await r.json();
    const rows = d.result || d.results || [];
    const filtered = rows.filter(b => !b.isPaid && b.status !== 'cancelled' && b.status !== 'declined');
    all = [...all, ...filtered];
    if (rows.length < limit) break;
    offset += limit;
    if (offset >= 600) break;
  }
  return all;
}

export const handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { accountId, secret } = body;
  if (!accountId || !secret) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'accountId and secret are required' })
    };
  }

  try {
    const token = await haAuth(accountId, secret);
    const bookings = await fetchUnpaid(token);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookings })
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
