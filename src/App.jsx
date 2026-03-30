import { useState, useEffect, useCallback, useRef } from 'react';
import { Ico } from './Icons';
import {
  load, save, uid, fmtDate, fmtTs, fmtAmt, fmtBookingDate,
  fetchUnpaidBookings, makeCSV, downloadCSV, uploadToDrive,
  SK, WEEK_MS, DEFAULT_CFG
} from './lib';

// ── Status Chip ────────────────────────────────────────────────────────────────
function StatusChip({ status }) {
  if (!status) return <span style={{ color: 'var(--tx-mu)' }}>—</span>;
  const map = {
    new: { bg: 'var(--info-bg)', c: 'var(--info)' },
    confirmed: { bg: 'var(--ok-bg)', c: 'var(--ok)' },
    modified: { bg: 'var(--warn-bg)', c: 'var(--warn)' },
    cancelled: { bg: '#F5F5F5', c: '#888' },
    pending: { bg: 'var(--warn-bg)', c: 'var(--warn)' }
  };
  const s = map[status.toLowerCase()] || { bg: 'var(--bg)', c: 'var(--tx-m)' };
  return <span className="chip" style={{ background: s.bg, color: s.c, textTransform: 'capitalize' }}>{status}</span>;
}

// ── Channel Logo ───────────────────────────────────────────────────────────────
const CHANNEL_MAP = {
  'airbnb':       { logo: 'https://a0.muscache.com/airbnb/static/icons/android-icon-192x192-c0465f9f0380893768972a31a614b670.png', label: 'Airbnb', bg: '#FF5A5F', text: '#fff' },
  'booking.com':  { logo: 'https://cf.bstatic.com/static/img/favicon/favicon-32x32.png', label: 'Booking.com', bg: '#003580', text: '#fff' },
  'booking':      { logo: 'https://cf.bstatic.com/static/img/favicon/favicon-32x32.png', label: 'Booking.com', bg: '#003580', text: '#fff' },
  'vrbo':         { logo: 'https://www.vrbo.com/favicon.ico', label: 'Vrbo', bg: '#1B5EAB', text: '#fff' },
  'homeaway':     { logo: 'https://www.vrbo.com/favicon.ico', label: 'HomeAway', bg: '#1B5EAB', text: '#fff' },
  'expedia':      { logo: 'https://www.expedia.com/favicon.ico', label: 'Expedia', bg: '#FFC72C', text: '#1A1A1A' },
  'tripadvisor':  { logo: 'https://static.tacdn.com/img2/brand_refresh/Tripadvisor_logoset_solid_green.svg', label: 'Tripadvisor', bg: '#00AA6C', text: '#fff' },
  'trip advisor': { logo: 'https://static.tacdn.com/img2/brand_refresh/Tripadvisor_logoset_solid_green.svg', label: 'Tripadvisor', bg: '#00AA6C', text: '#fff' },
  'agoda':        { logo: 'https://www.agoda.com/favicon.ico', label: 'Agoda', bg: '#E3242B', text: '#fff' },
  'google':       { logo: 'https://www.google.com/favicon.ico', label: 'Google', bg: '#4285F4', text: '#fff' },
  'direct':       { logo: null, label: 'Direct', bg: 'var(--primary-lt)', text: 'var(--primary-dk)' },
  'website':      { logo: null, label: 'Website', bg: 'var(--primary-lt)', text: 'var(--primary-dk)' },
  'owner':        { logo: null, label: 'Owner', bg: 'var(--bg)', text: 'var(--tx-m)' },
};

function ChannelLogo({ name }) {
  const key = (name || '').toLowerCase().trim();
  const match = CHANNEL_MAP[key] || Object.entries(CHANNEL_MAP).find(([k]) => key.includes(k))?.[1];

  if (!match) {
    // Unknown channel — styled text badge
    const initials = (name || '?').slice(0, 2).toUpperCase();
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--tx-m)' }}>
        <span style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--tx-mu)', flexShrink: 0 }}>{initials}</span>
        {name}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>
      {match.logo ? (
        <img
          src={match.logo}
          alt={match.label}
          width={20} height={20}
          style={{ borderRadius: 4, objectFit: 'contain', background: match.bg, padding: 2, flexShrink: 0 }}
          onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
        />
      ) : null}
      <span style={{ display: 'none', width: 20, height: 20, borderRadius: 4, background: match.bg, color: match.text, alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
        {match.label.slice(0, 2).toUpperCase()}
      </span>
      {match.label}
    </span>
  );
}

// ── Payment Chip ───────────────────────────────────────────────────────────────
function PaymentChip({ status }) {
  if (!status) return <span style={{ color: 'var(--tx-mu)', fontSize: 12 }}>—</span>;
  const s = status.toLowerCase();
  const map = {
    'paid':              { bg: 'var(--ok-bg)',   c: 'var(--ok)',   label: 'Paid' },
    'partially paid':    { bg: 'var(--warn-bg)', c: 'var(--warn)', label: 'Partial' },
    'partial':           { bg: 'var(--warn-bg)', c: 'var(--warn)', label: 'Partial' },
    'unpaid':            { bg: 'var(--err-bg)',  c: 'var(--err)',  label: 'Unpaid' },
    'not paid':          { bg: 'var(--err-bg)',  c: 'var(--err)',  label: 'Unpaid' },
    'awaiting payment':  { bg: 'var(--err-bg)',  c: 'var(--err)',  label: 'Awaiting' },
    'overdue':           { bg: '#3D0000',        c: '#FF6B6B',     label: 'Overdue' },
    'refunded':          { bg: 'var(--info-bg)', c: 'var(--info)', label: 'Refunded' },
  };
  const style = map[s] || { bg: 'var(--bg)', c: 'var(--tx-m)', label: status };
  return (
    <span className="chip" style={{ background: style.bg, color: style.c, fontSize: 11 }}>
      {style.label}
    </span>
  );
}

// ── Instance Card ──────────────────────────────────────────────────────────────
function InstCard({ inst, onClick, onFetch }) {
  const n = inst.bookings?.length || 0;
  const status = inst.loading ? 'loading' : inst.err ? 'error' : inst.fetchedAt ? 'ok' : 'idle';
  const badgeMap = {
    loading: ['badge-warn', 'Fetching…'],
    error: ['badge-err', 'Error'],
    ok: ['badge-ok', 'Up to date'],
    idle: ['badge-idle', 'Not fetched']
  };
  const [bc, bl] = badgeMap[status];
  return (
    <div className="inst-card" onClick={onClick}>
      <div className="inst-top">
        <div>
          <div className="inst-name">{inst.name}</div>
          <div className="inst-id">ID: {inst.accountId}</div>
        </div>
        <span className={`badge ${bc}`}>{bl}</span>
      </div>
      {inst.err && (
        <div style={{ fontSize: 12, color: 'var(--err)', background: 'var(--err-bg)', padding: '8px 10px', borderRadius: 'var(--r8)', marginBottom: 12, lineHeight: 1.5 }}>
          {inst.err}
        </div>
      )}
      <div className="inst-count">{n}</div>
      <div className="inst-count-lbl">unpaid booking{n !== 1 ? 's' : ''}</div>
      <div className="inst-foot">
        <span className="last-fetch">{inst.fetchedAt ? `Updated ${fmtTs(inst.fetchedAt)}` : 'Never fetched'}</span>
        <button className="btn btn-sec btn-sm" onClick={e => { e.stopPropagation(); onFetch(); }} disabled={inst.loading}>
          {inst.loading ? <><span className="spin-ring" style={{ width: 11, height: 11, borderWidth: 1.5 }} /> Fetching</> : '↺ Refresh'}
        </button>
      </div>
    </div>
  );
}

// ── Sort Header ───────────────────────────────────────────────────────────────
function SortTh({ label, field, sort, onSort }) {
  const active = sort.field === field;
  const asc = active && sort.dir === 'asc';
  return (
    <th
      onClick={() => onSort(field)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, opacity: active ? 1 : 0.3 }}>
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
            <path d="M4 0L8 5H0L4 0Z" fill={active && asc ? 'var(--primary)' : 'currentColor'} />
          </svg>
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
            <path d="M4 5L0 0H8L4 5Z" fill={active && !asc ? 'var(--primary)' : 'currentColor'} />
          </svg>
        </span>
      </span>
    </th>
  );
}

function sortBookings(bookings, sort) {
  const { field, dir } = sort;
  return [...bookings].sort((a, b) => {
    const av = (a[field === 'checkIn' ? 'checkInDate' : 'checkOutDate'] || a[field === 'checkIn' ? 'arrivalDate' : 'departureDate'] || '');
    const bv = (b[field === 'checkIn' ? 'checkInDate' : 'checkOutDate'] || b[field === 'checkIn' ? 'arrivalDate' : 'departureDate'] || '');
    return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });
}

// ── Dashboard View ─────────────────────────────────────────────────────────────
function DashboardView({ insts, totalUnpaid, totalVal, onSelect, onFetch, onAdd }) {
  const [sort, setSort] = useState({ field: 'checkIn', dir: 'asc' });
  const onSort = field => setSort(prev => ({ field, dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' }));

  const rawBookings = insts.flatMap(i => (i.bookings || []).map(b => ({ ...b, _inst: i.name, _iid: i.id })));
  const allBookings = sortBookings(rawBookings, sort);
  const lastFetch = insts.filter(i => i.fetchedAt).reduce((m, i) => Math.max(m, i.fetchedAt), 0);

  return (
    <div>
      <div className="page-hdr">
        <div>
          <div className="page-title">Unpaid Bookings</div>
          <div className="page-sub">Consolidated view across all Hostaway instances</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-lbl">Total Unpaid</div>
          <div className={`stat-val ${totalUnpaid > 0 ? 'red' : ''}`}>{totalUnpaid}</div>
          <div className="stat-note">bookings pending payment</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Outstanding Value</div>
          <div className="stat-val orange" style={{ fontSize: totalVal > 999 ? 22 : 30 }}>
            {totalVal > 0 ? new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(totalVal) : '—'}
          </div>
          <div className="stat-note">NZD across all instances</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Instances</div>
          <div className="stat-val">{insts.length}</div>
          <div className="stat-note">{insts.filter(i => i.fetchedAt).length} with data loaded</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Last Refreshed</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)', marginTop: 6 }}>{lastFetch ? fmtTs(lastFetch) : '—'}</div>
          <div className="stat-note">most recent fetch time</div>
        </div>
      </div>

      {insts.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><rect x="1.5" y="1.5" width="23" height="23" rx="4" stroke="var(--primary)" strokeWidth="1.8"/><path d="M13 7v12M7 13h12" stroke="var(--primary)" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </div>
          <div className="empty-title">No instances configured</div>
          <div className="empty-desc">Add a Hostaway API instance to start tracking unpaid bookings across your properties.</div>
          <button className="btn btn-pri" onClick={onAdd}>Add first instance</button>
        </div>
      ) : (
        <>
          <div className="inst-grid">
            {insts.map(inst => <InstCard key={inst.id} inst={inst} onClick={() => onSelect(inst.id)} onFetch={() => onFetch(inst.id)} />)}
          </div>
          {allBookings.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-mu)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 14 }}>All Unpaid Bookings</div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr>
                    <th>Instance</th><th>Guest</th><th>Property</th><th>Channel</th>
                    <SortTh label="Check-in"  field="checkIn"  sort={sort} onSort={onSort} />
                    <SortTh label="Check-out" field="checkOut" sort={sort} onSort={onSort} />
                    <th>Amount</th><th>Status</th><th>Payment</th><th></th>
                  </tr></thead>
                  <tbody>
                    {allBookings.map((b, i) => (
                      <tr key={i} style={{ cursor: 'pointer' }} onClick={() => onSelect(b._iid)}>
                        <td><span className="chip" style={{ background: 'var(--primary-lt)', color: 'var(--primary-dk)' }}>{b._inst}</span></td>
                        <td style={{ fontWeight: 500 }}>{b.guestName || '—'}</td>
                        <td style={{ color: 'var(--tx-m)' }}>{b.listingName || b.unitName || '—'}</td>
                        <td><ChannelLogo name={b.channelName || b.source} /></td>
                        <td className="num">{fmtDate(b.checkInDate || b.arrivalDate)}</td>
                        <td className="num">{fmtDate(b.checkOutDate || b.departureDate)}</td>
                        <td className="num" style={{ fontWeight: 600, color: 'var(--err)' }}>{fmtAmt(b.totalPrice || b.price, b.currency)}</td>
                        <td><StatusChip status={b.status} /></td>
                        <td><PaymentChip status={b.paymentStatus} /></td>
                        <td style={{ textAlign: 'center', width: 40 }}>
                          {(b.id || b.reservationId) && (
                            <a href={`https://dashboard.hostaway.com/reservations/${b.id || b.reservationId}/edit`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--primary)', display: 'inline-flex', padding: 4, borderRadius: 4, transition: 'background .15s' }} title="Edit in Hostaway">
                              {Ico.extLink}
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Instance Detail ────────────────────────────────────────────────────────────
function InstView({ inst, hasDrive, driveLoading, onFetch, onCSV, onDrive, onEdit, onDelete }) {
  const [sort, setSort] = useState({ field: 'checkIn', dir: 'asc' });
  const onSort = field => setSort(prev => ({ field, dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' }));

  const rawBk = inst.bookings || [];
  const bk = sortBookings(rawBk, sort);
  const totalAmt = rawBk.reduce((s, b) => s + Number(b.totalPrice || b.price || 0), 0);
  const channels = [...new Set(rawBk.map(b => b.channelName || b.source || 'Unknown'))];
  const isCorsErr = false; // API calls now go through Netlify function, no CORS issues

  return (
    <div>
      <div className="page-hdr">
        <div>
          <div className="page-title">{inst.name}</div>
          <div className="page-sub">
            Account ID: <code style={{ fontSize: 12 }}>{inst.accountId}</code>
            &nbsp;·&nbsp;
            {inst.fetchedAt ? `Last fetched ${fmtTs(inst.fetchedAt)}` : 'Not yet fetched'}
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-ghost btn-sm" onClick={onEdit}>{Ico.edit}&nbsp;Edit</button>
          <button className="btn btn-sec" onClick={onFetch} disabled={inst.loading}>
            {inst.loading ? <><span className="spin-ring" />&nbsp;Fetching…</> : <>{Ico.refresh}&nbsp;Refresh</>}
          </button>
          {bk.length > 0 && <>
            <button className="btn btn-sec" onClick={onCSV}>{Ico.download}&nbsp;Download CSV</button>
            <button className="btn btn-gdrive" onClick={onDrive} disabled={driveLoading || !hasDrive} title={!hasDrive ? 'Add Google Drive Client ID in Settings to export as Google Sheet' : ''}>
              {driveLoading ? <><span className="spin-ring" />&nbsp;Creating Sheet…</> : <>{Ico.gdrive}&nbsp;Export to Sheets</>}
            </button>
          </>}
          <button className="btn btn-err btn-sm" onClick={() => { if (window.confirm(`Delete instance "${inst.name}"?`)) onDelete(); }}>Delete</button>
        </div>
      </div>

      {!hasDrive && bk.length > 0 && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          {Ico.warn}
          <span>Google Sheets export not configured. Add your OAuth Client ID in <strong>Settings</strong> to enable one-click Google Sheets exports.</span>
        </div>
      )}

      {inst.err && (
        <div className="alert alert-err">
          {Ico.warn}
          <div>
            <strong>Fetch error:</strong> {inst.err}
            {isCorsErr && <div style={{ marginTop: 6 }}>This looks like a CORS or network error. Try enabling <strong>CORS proxy</strong> in Settings → API Proxy, then refresh.</div>}
          </div>
        </div>
      )}

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', maxWidth: 560 }}>
        <div className="stat-card">
          <div className="stat-lbl">Unpaid Bookings</div>
          <div className={`stat-val ${bk.length > 0 ? 'red' : ''}`}>{bk.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Total Owing</div>
          <div className="stat-val orange" style={{ fontSize: 22 }}>{fmtAmt(totalAmt)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Channels</div>
          <div className="stat-val">{channels.length || '—'}</div>
          <div className="stat-note">{channels.slice(0, 3).join(', ')}{channels.length > 3 ? '…' : ''}</div>
        </div>
      </div>

      {!inst.fetchedAt ? (
        <div className="empty">
          <div className="empty-ico">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><circle cx="13" cy="13" r="10.5" stroke="var(--primary)" strokeWidth="1.8"/><path d="M13 7.5v6l3.5 2.5" stroke="var(--primary)" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </div>
          <div className="empty-title">Not yet fetched</div>
          <div className="empty-desc">Click Refresh to load unpaid bookings from this Hostaway instance.</div>
          <button className="btn btn-pri" onClick={onFetch} disabled={inst.loading}>{inst.loading ? 'Fetching…' : 'Fetch now'}</button>
        </div>
      ) : bk.length === 0 ? (
        <div className="empty">
          <div className="empty-ico" style={{ color: 'var(--ok)' }}>{Ico.check}</div>
          <div className="empty-title">All clear — no unpaid bookings</div>
          <div className="empty-desc">Every booking for this instance is paid up. Great work!</div>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>Booking ID</th><th>Guest</th><th>Property</th><th>Channel</th>
              <SortTh label="Check-in"  field="checkIn"  sort={sort} onSort={onSort} />
              <SortTh label="Check-out" field="checkOut" sort={sort} onSort={onSort} />
              <th>Nights</th><th>Amount</th>
              <th>Status</th><th>Payment</th><th>Booked On</th><th></th>
            </tr></thead>
            <tbody>
              {bk.map((b, i) => (
                <tr key={i}>
                  <td className="mono" style={{ color: 'var(--tx-mu)' }}>{b.id || b.reservationId || '—'}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{b.guestName || '—'}</div>
                    {b.guestEmail && <div style={{ fontSize: 11, color: 'var(--tx-mu)' }}>{b.guestEmail}</div>}
                  </td>
                  <td style={{ color: 'var(--tx-m)' }}>{b.listingName || b.unitName || b.propertyName || '—'}</td>
                  <td><ChannelLogo name={b.channelName || b.source} /></td>
                  <td className="num">{fmtDate(b.checkInDate || b.arrivalDate)}</td>
                  <td className="num">{fmtDate(b.checkOutDate || b.departureDate)}</td>
                  <td className="num" style={{ textAlign: 'center' }}>{b.nightsCount || b.nights || '—'}</td>
                  <td className="num" style={{ fontWeight: 600, color: 'var(--err)' }}>{fmtAmt(b.totalPrice || b.price, b.currency)}</td>
                  <td><StatusChip status={b.status} /></td>
                  <td><PaymentChip status={b.paymentStatus} /></td>
                  <td className="num" style={{ fontSize: 12, color: 'var(--tx-mu)' }}>{fmtBookingDate(b.insertionTime || b.reservationDate || b.createdAt || b.bookingDate)}</td>
                  <td style={{ textAlign: 'center', width: 40 }}>
                    {(b.id || b.reservationId) && (
                      <a href={`https://dashboard.hostaway.com/reservations/${b.id || b.reservationId}/edit`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', display: 'inline-flex', padding: 4, borderRadius: 4, transition: 'background .15s' }} title="Edit in Hostaway">
                        {Ico.extLink}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Instances List ─────────────────────────────────────────────────────────────
function InstsListView({ insts, onAdd, onEdit, onDelete, onFetch, onSelect }) {
  return (
    <div>
      <div className="page-hdr">
        <div>
          <div className="page-title">Instances</div>
          <div className="page-sub">Manage your Hostaway API connections</div>
        </div>
        <button className="btn btn-pri" onClick={onAdd}>{Ico.plus}&nbsp;Add Instance</button>
      </div>
      {insts.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">{Ico.server}</div>
          <div className="empty-title">No instances yet</div>
          <div className="empty-desc">Each Hostaway account you manage becomes an instance here.</div>
          <button className="btn btn-pri" onClick={onAdd}>Add instance</button>
        </div>
      ) : (
        <div className="sg">
          {insts.map((inst, idx) => (
            <div key={inst.id} style={{ padding: '16px 20px', borderBottom: idx < insts.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {inst.name}
                  {inst.bookings?.length > 0 && <span className="chip" style={{ background: 'var(--err-bg)', color: 'var(--err)' }}>{inst.bookings.length} unpaid</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx-mu)' }}>
                  Account ID: {inst.accountId}&nbsp;·&nbsp;
                  {inst.fetchedAt ? `Updated ${fmtTs(inst.fetchedAt)}` : 'Never fetched'}
                  {inst.err && <span style={{ color: 'var(--err)', marginLeft: 8 }}>⚠ {inst.err.slice(0, 60)}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => onSelect(inst.id)}>View</button>
                <button className="btn btn-ghost btn-sm" onClick={() => onFetch(inst.id)} disabled={inst.loading}>{inst.loading ? 'Fetching…' : 'Refresh'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(inst)}>{Ico.edit}&nbsp;Edit</button>
                <button className="btn btn-err btn-sm" onClick={() => { if (window.confirm(`Delete "${inst.name}"?`)) onDelete(inst.id); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Settings View ──────────────────────────────────────────────────────────────
function SettingsView({ cfg, onChange }) {
  const [local, setLocal] = useState(cfg);
  const [saved, setSaved] = useState(false);
  const upd = (k, v) => setLocal(p => ({ ...p, [k]: v }));

  const handleSave = () => { onChange(local); setSaved(true); setTimeout(() => setSaved(false), 2500); };

  return (
    <div>
      <div className="page-hdr">
        <div><div className="page-title">Settings</div><div className="page-sub">Configure integrations and automation</div></div>
      </div>

      <div className="sg">
        <div className="sg-hdr">
          <div className="sg-title">Google Drive Integration</div>
          <div className="sg-desc">Export unpaid booking reports directly to Google Sheets with one click</div>
        </div>
        <div className="sg-row col">
          <div>
            <div className="sg-rlbl">OAuth 2.0 Client ID</div>
            <div className="sg-rdesc">Create credentials at <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>console.cloud.google.com</a> → APIs &amp; Services → Credentials</div>
          </div>
          <input type="text" value={local.gClientId} onChange={e => upd('gClientId', e.target.value)} placeholder="xxxxxx.apps.googleusercontent.com" style={{ maxWidth: 480 }} />
        </div>
        <div className="sg-row col" style={{ background: 'var(--info-bg)' }}>
          <div className="sg-rlbl" style={{ color: 'var(--info)' }}>Setup steps</div>
          <ol style={{ fontSize: 13, color: 'var(--tx-m)', paddingLeft: 18, lineHeight: 2.2 }}>
            <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Google Cloud Console</a> and create or select a project</li>
            <li>Enable the <strong>Google Drive API</strong> under APIs &amp; Services → Library</li>
            <li>Create <strong>OAuth 2.0 credentials</strong> (Application type: Web application)</li>
            <li>Under <em>Authorized JavaScript origins</em>, add your Netlify URL (e.g. <code>https://your-site.netlify.app</code>)</li>
            <li>Copy the <strong>Client ID</strong> and paste it above, then save</li>
          </ol>
        </div>
      </div>

      <div className="sg">
        <div className="sg-hdr">
          <div className="sg-title">Weekly Auto-Refresh</div>
          <div className="sg-desc">Automatically fetch unpaid bookings when the app is opened after 7+ days</div>
        </div>
        <div className="sg-row">
          <div>
            <div className="sg-rlbl">Auto-refresh on open</div>
            <div className="sg-rdesc">When enabled, all instances refresh silently on page load if the last fetch was over 7 days ago</div>
          </div>
          <div className="toggle" onClick={() => upd('autoRefresh', !local.autoRefresh)}>
            <div className={`tgl-track ${local.autoRefresh ? 'on' : ''}`}><div className="tgl-thumb" /></div>
          </div>
        </div>
      </div>

      <button className="btn btn-pri" onClick={handleSave} style={{ minWidth: 140 }}>
        {saved ? <>{Ico.check}&nbsp;Saved!</> : 'Save Settings'}
      </button>
    </div>
  );
}

// ── Add/Edit Modal ─────────────────────────────────────────────────────────────
function InstModal({ inst, onSave, onClose }) {
  const [form, setForm] = useState({ name: inst?.name || '', accountId: inst?.accountId || '', secret: '' });
  const [show, setShow] = useState(false);
  const [errs, setErrs] = useState({});

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Instance name is required';
    if (!form.accountId.trim()) e.accountId = 'Account ID is required';
    if (!inst && !form.secret.trim()) e.secret = 'API Secret is required for new instances';
    return e;
  };
  const submit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrs(e); return; }
    onSave(form);
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{inst ? 'Edit Instance' : 'Add Hostaway Instance'}</div>

        <div className="form-g">
          <label>Instance name</label>
          <input type="text" value={form.name} onChange={e => upd('name', e.target.value)} placeholder="e.g. Plux Stays Main, South Properties" autoFocus />
          {errs.name && <div className="field-err">{errs.name}</div>}
          <div className="field-hint">A friendly label to identify this Hostaway account</div>
        </div>

        <div className="form-g">
          <label>Hostaway Account ID</label>
          <input type="text" value={form.accountId} onChange={e => upd('accountId', e.target.value)} placeholder="Your numeric Account ID" />
          {errs.accountId && <div className="field-err">{errs.accountId}</div>}
          <div className="field-hint">Found in Hostaway → Settings → API Credentials</div>
        </div>

        <div className="form-g">
          <label>{inst ? 'API Secret (leave blank to keep current)' : 'API Secret'}</label>
          <div style={{ position: 'relative' }}>
            <input
              type={show ? 'text' : 'password'}
              value={form.secret}
              onChange={e => upd('secret', e.target.value)}
              placeholder={inst ? 'Leave blank to keep unchanged' : 'Your Hostaway API Secret'}
              style={{ paddingRight: 52 }}
            />
            <button onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-mu)', fontSize: 12, padding: '2px 4px' }}>
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
          {errs.secret && <div className="field-err">{errs.secret}</div>}
          <div className="field-hint">Credentials are stored only in your browser's localStorage and sent only to the Hostaway API.</div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-pri" onClick={submit}>{inst ? 'Update Instance' : 'Add Instance'}</button>
        </div>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [insts, setInsts] = useState(() => load(SK.inst, []));
  const [cfg, setCfg] = useState(() => load(SK.cfg, DEFAULT_CFG));
  const [view, setView] = useState('dashboard');
  const [selId, setSelId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editInst, setEditInst] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [dueSoon, setDueSoon] = useState([]);
  const instsRef = useRef(insts);
  const cfgRef = useRef(cfg);

  useEffect(() => { instsRef.current = insts; save(SK.inst, insts); }, [insts]);
  useEffect(() => { cfgRef.current = cfg; save(SK.cfg, cfg); }, [cfg]);

  const toast = useCallback((msg, type = 'info') => {
    const id = uid();
    setToasts(ts => [...ts, { id, msg, type }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 5000);
  }, []);

  const fetchInst = useCallback(async (id) => {
    const inst = instsRef.current.find(i => i.id === id);
    if (!inst) return;
    setInsts(prev => prev.map(i => i.id === id ? { ...i, loading: true, err: null } : i));
    try {
      const bookings = await fetchUnpaidBookings(inst.accountId, inst.secret);
      setInsts(prev => prev.map(i => i.id === id ? { ...i, loading: false, bookings, fetchedAt: Date.now(), err: null } : i));
      toast(`${inst.name}: ${bookings.length} unpaid booking${bookings.length !== 1 ? 's' : ''} found`, 'ok');
    } catch (e) {
      setInsts(prev => prev.map(i => i.id === id ? { ...i, loading: false, err: e.message } : i));
      toast(`${inst.name}: ${e.message}`, 'err');
    }
  }, [toast]);

  const fetchAll = useCallback(() => instsRef.current.forEach(i => fetchInst(i.id)), [fetchInst]);

  useEffect(() => {
    const now = Date.now();
    const due = instsRef.current.filter(i => !i.fetchedAt || i.fetchedAt < now - WEEK_MS);
    setDueSoon(due.map(i => i.id));
    if (cfgRef.current.autoRefresh && due.length > 0) due.forEach(i => fetchInst(i.id));
  }, [fetchInst]);

  const handleCSV = (inst) => {
    const csv = makeCSV(inst.bookings || []);
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `Plux-Unpaid-${inst.name.replace(/\s+/g, '-')}-${date}.csv`);
    toast(`CSV downloaded for ${inst.name}`, 'ok');
  };

  const [driveLoading, setDriveLoading] = useState({});
  const handleDrive = async (inst) => {
    if (!cfgRef.current.gClientId.trim()) { toast('Configure Google Drive Client ID in Settings first', 'err'); return; }
    setDriveLoading(prev => ({ ...prev, [inst.id]: true }));
    try {
      const csv = makeCSV(inst.bookings || []);
      const date = new Date().toISOString().slice(0, 10);
      const filename = `Plux-Unpaid-${inst.name.replace(/\s+/g, '-')}-${date}.csv`;
      const f = await uploadToDrive(csv, filename, cfgRef.current.gClientId);
      toast(`Uploaded "${f.name || filename}" as Google Sheet`, 'ok');
    } catch (e) { toast(`Google Sheets: ${e.message}`, 'err'); }
    finally { setDriveLoading(prev => ({ ...prev, [inst.id]: false })); }
  };

  const saveInst = (data) => {
    if (editInst) {
      setInsts(prev => prev.map(i => i.id === editInst.id ? { ...editInst, ...data, secret: data.secret || editInst.secret } : i));
      toast('Instance updated');
    } else {
      setInsts(prev => [...prev, { id: uid(), bookings: [], loading: false, err: null, fetchedAt: null, ...data }]);
      toast('Instance added');
    }
    setShowModal(false); setEditInst(null);
  };

  const delInst = (id) => {
    setInsts(prev => prev.filter(i => i.id !== id));
    if (selId === id) { setSelId(null); setView('dashboard'); }
    toast('Instance removed');
  };

  const selInst = insts.find(i => i.id === selId);
  const totalUnpaid = insts.reduce((s, i) => s + (i.bookings?.length || 0), 0);
  const totalVal = insts.reduce((s, i) => s + (i.bookings || []).reduce((x, b) => x + Number(b.totalPrice || b.price || 0), 0), 0);
  const anyLoading = insts.some(i => i.loading);
  const hasDrive = !!cfg.gClientId.trim();

  return (
    <div className="shell">
      <header className="app-hdr">
        <div className="logo-area">
          <div className="logo-mark">P</div>
          <div>
            <div className="logo-text">Plux <span>Stays</span></div>
            <div className="logo-sub">Unpaid Bookings Tracker</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {insts.length > 0 && (
            <button className="btn btn-sec" onClick={fetchAll} disabled={anyLoading} style={{ fontSize: 12 }}>
              {anyLoading ? <><span className="spin-ring" />&nbsp;Fetching…</> : <>{Ico.refresh}&nbsp;Refresh All</>}
            </button>
          )}
          <button className="btn btn-pri" onClick={() => { setEditInst(null); setShowModal(true); }}>
            {Ico.plus}&nbsp;Add Instance
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <button className={`nav-btn ${view === 'dashboard' && !selId ? 'active' : ''}`} onClick={() => { setView('dashboard'); setSelId(null); }}>
            {Ico.grid}&nbsp;Dashboard
            {totalUnpaid > 0 && <span className="nav-badge">{totalUnpaid}</span>}
          </button>
          <button className={`nav-btn ${view === 'instances' && !selId ? 'active' : ''}`} onClick={() => { setView('instances'); setSelId(null); }}>
            {Ico.server}&nbsp;Instances
          </button>
          <button className={`nav-btn ${view === 'settings' ? 'active' : ''}`} onClick={() => { setView('settings'); setSelId(null); }}>
            {Ico.settings}&nbsp;Settings
          </button>
          {insts.length > 0 && <>
            <div className="sb-sep">Instances</div>
            {insts.map(i => (
              <button key={i.id} className={`inst-nav ${selId === i.id ? 'active' : ''}`} onClick={() => { setSelId(i.id); setView('inst'); }}>
                <span className={`dot ${i.loading ? 'spin-dot' : i.err ? 'dead' : i.bookings?.length > 0 ? 'live' : ''}`} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</span>
                {i.bookings?.length > 0 && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>{i.bookings.length}</span>}
              </button>
            ))}
          </>}
        </aside>

        <main className="main">
          {dueSoon.length > 0 && !cfg.autoRefresh && (
            <div className="alert alert-warn">
              {Ico.clock}
              <span>
                <strong>{dueSoon.length}</strong> instance{dueSoon.length !== 1 ? 's' : ''} haven't been refreshed in 7+ days.&nbsp;
                <button className="btn btn-xs btn-sec" style={{ marginLeft: 6 }} onClick={fetchAll}>Refresh now</button>
              </span>
            </div>
          )}

          {view === 'dashboard' && (
            <DashboardView insts={insts} totalUnpaid={totalUnpaid} totalVal={totalVal}
              onSelect={id => { setSelId(id); setView('inst'); }} onFetch={fetchInst}
              onAdd={() => { setEditInst(null); setShowModal(true); }} />
          )}
          {view === 'inst' && selInst && (
            <InstView inst={selInst} hasDrive={hasDrive} driveLoading={!!driveLoading[selInst.id]}
              onFetch={() => fetchInst(selInst.id)} onCSV={() => handleCSV(selInst)}
              onDrive={() => handleDrive(selInst)} onEdit={() => { setEditInst(selInst); setShowModal(true); }}
              onDelete={() => delInst(selInst.id)} />
          )}
          {view === 'instances' && (
            <InstsListView insts={insts} onAdd={() => { setEditInst(null); setShowModal(true); }}
              onEdit={i => { setEditInst(i); setShowModal(true); }} onDelete={delInst}
              onFetch={fetchInst} onSelect={id => { setSelId(id); setView('inst'); }} />
          )}
          {view === 'settings' && <SettingsView cfg={cfg} onChange={setCfg} />}
        </main>
      </div>

      {showModal && <InstModal inst={editInst} onSave={saveInst} onClose={() => { setShowModal(false); setEditInst(null); }} />}

      <div className="toast-area">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'ok' && Ico.check}
            {t.type === 'err' && Ico.cross}
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
