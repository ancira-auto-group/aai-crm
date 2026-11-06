'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/* ---------- helpers ---------- */

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

const money = (n) => `$${Number(n || 0).toFixed(n > 0 && n < 1 ? 4 : 2)}`;
const count = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
const rooftopList = (names) => (names && names.length ? names.join(', ') : 'Unassigned');
const when = (d) => (d ? new Date(d).toLocaleString() : 'Never');

function localDay(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function presetRange(preset) {
  const now = new Date();
  if (preset === 'last-month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: localDay(first), to: localDay(last) };
  }
  if (preset === 'last-30') {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { from: localDay(start), to: localDay(now) };
  }
  return { from: localDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: localDay(now) };
}

function downloadCsv(filename, rows, columns) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => escape(c.label)).join(',')]
    .concat(rows.map((row) => columns.map((c) => escape(c.value(row))).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Notice({ notice, onClose }) {
  if (!notice) {
    return null;
  }
  return (
    <div className={`notice ${notice.type || ''}`} role={notice.type === 'error' ? 'alert' : 'status'}>
      {notice.text}
      {notice.secret && (
        <div style={{ marginTop: 6 }}>
          <span className="secret">{notice.secret}</span>{' '}
          <button className="btn small" onClick={() => navigator.clipboard?.writeText(notice.secret)}>Copy</button>
        </div>
      )}
      {onClose && <> <button className="link" onClick={onClose}>Dismiss</button></>}
    </div>
  );
}

/* ---------- sign in / password ---------- */

function SignIn({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/login', { method: 'POST', body: { email, password, client: 'web' } });
      onSignedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>AAI for CRM admin</h2>
      {error && <div className="notice error" role="alert">{error}</div>}
      <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
      <div style={{ height: 10 }} />
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <div style={{ height: 14 }} />
      <button className="btn primary" disabled={busy} style={{ width: '100%' }}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}

function ChangePassword({ onDone, onSignOut }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) {
      setError('The new passwords don\'t match');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>Choose a new password</h2>
      <p className="muted">You signed in with a temporary password. Pick a new one (at least 10 characters).</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      <label>Temporary password<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus /></label>
      <div style={{ height: 10 }} />
      <label>New password<input type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required /></label>
      <div style={{ height: 10 }} />
      <label>Confirm new password<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>
      <div style={{ height: 14 }} />
      <div className="row">
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        <button type="button" className="btn" onClick={onSignOut}>Sign out</button>
      </div>
    </form>
  );
}

/* ---------- usage ---------- */

function UsageTab() {
  const [range, setRange] = useState(() => presetRange('this-month'));
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [rooftopFilter, setRooftopFilter] = useState(null);

  useEffect(() => {
    let stale = false;
    setError('');
    api(`/api/admin/usage?from=${range.from}&to=${range.to}`)
      .then((data) => !stale && setReport(data))
      .catch((err) => !stale && setError(err.message));
    return () => { stale = true; };
  }, [range]);

  const users = useMemo(() => {
    if (!report) {
      return [];
    }
    if (rooftopFilter === null) {
      return report.byUser;
    }
    return report.byUser.filter((u) => (rooftopFilter === 'Unassigned' ? u.rooftops.length === 0 : u.rooftops.includes(rooftopFilter)));
  }, [report, rooftopFilter]);

  const maxDay = Math.max(1, ...(report?.byDay || []).map((d) => d.requests));

  return (
    <>
      <div className="card">
        <div className="row">
          <label>From<input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
          <label>To<input type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
          <button className="btn" onClick={() => setRange(presetRange('this-month'))}>This month</button>
          <button className="btn" onClick={() => setRange(presetRange('last-month'))}>Last month</button>
          <button className="btn" onClick={() => setRange(presetRange('last-30'))}>Last 30 days</button>
        </div>
        {report && <p className="muted" style={{ margin: '10px 0 0' }}>Dates are in {report.timezone}. Costs are estimates from list prices. Requests from people assigned to several rooftops are split evenly among those rooftops.</p>}
      </div>

      {error && <div className="notice error">{error}</div>}
      {!report && !error && <p className="muted">Loading…</p>}

      {report && (
        <>
          <div className="stats">
            <div className="stat"><div className="value">{count(report.totals.requests)}</div><div className="label">Requests</div></div>
            <div className="stat"><div className="value">{count(report.totals.active_users)}</div><div className="label">Active users</div></div>
            <div className="stat"><div className="value">{count(report.totals.input_tokens + report.totals.output_tokens)}</div><div className="label">Tokens</div></div>
            <div className="stat"><div className="value">{money(report.totals.cost_usd)}</div><div className="label">Estimated cost</div></div>
          </div>

          {report.byDay.length > 1 && (
            <div className="card">
              <h2>Requests per day</h2>
              <div className="bars" aria-hidden="true">
                {report.byDay.map((d) => (
                  <div key={d.day} title={`${d.day}: ${d.requests} requests`} style={{ height: `${(d.requests / maxDay) * 100}%` }} />
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>By rooftop</h2>
              <span className="spacer" />
              <button className="btn small" onClick={() => downloadCsv(`usage-by-rooftop_${report.from}_${report.to}.csv`, report.byRooftop, [
                { label: 'Rooftop', value: (r) => r.rooftop },
                { label: 'Requests', value: (r) => r.requests },
                { label: 'Enhance', value: (r) => r.enhance },
                { label: 'Reply', value: (r) => r.response },
                { label: 'Active users', value: (r) => r.active_users },
                { label: 'Tokens', value: (r) => r.tokens },
                { label: 'Estimated cost (USD)', value: (r) => r.cost_usd.toFixed(4) }
              ])}>Export CSV</button>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>Click a rooftop to filter the user table.</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Rooftop</th><th className="num">Requests</th><th className="num hide-sm">Enhance</th><th className="num hide-sm">Reply</th><th className="num">Users</th><th className="num hide-sm">Tokens</th><th className="num">Est. cost</th></tr></thead>
                <tbody>
                  {report.byRooftop.length === 0 && <tr><td colSpan={7} className="muted">No usage in this period</td></tr>}
                  {report.byRooftop.map((r) => (
                    <tr key={r.rooftop_id ?? 'none'} className={`clickable ${rooftopFilter === r.rooftop ? 'selected' : ''}`}
                      onClick={() => setRooftopFilter(rooftopFilter === r.rooftop ? null : r.rooftop)}>
                      <td>{r.rooftop}</td><td className="num">{count(r.requests)}</td><td className="num hide-sm">{count(r.enhance)}</td>
                      <td className="num hide-sm">{count(r.response)}</td><td className="num">{count(r.active_users)}</td>
                      <td className="num hide-sm">{count(r.tokens)}</td><td className="num">{money(r.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>By user{rooftopFilter !== null && <> at {rooftopFilter} <button className="link" onClick={() => setRooftopFilter(null)}>(show all)</button></>}</h2>
              <span className="spacer" />
              <button className="btn small" onClick={() => downloadCsv(`usage-by-user_${report.from}_${report.to}.csv`, users, [
                { label: 'Name', value: (u) => u.name },
                { label: 'Email', value: (u) => u.email },
                { label: 'Rooftops', value: (u) => rooftopList(u.rooftops) },
                { label: 'Requests', value: (u) => u.requests },
                { label: 'Enhance', value: (u) => u.enhance },
                { label: 'Reply', value: (u) => u.response },
                { label: 'Tokens', value: (u) => u.tokens },
                { label: 'Estimated cost (USD)', value: (u) => u.cost_usd.toFixed(4) },
                { label: 'Last used', value: (u) => u.last_used }
              ])}>Export CSV</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>User</th><th>Rooftops</th><th className="num">Requests</th><th className="num hide-sm">Enhance</th><th className="num hide-sm">Reply</th><th className="num">Est. cost</th><th className="hide-sm">Last used</th></tr></thead>
                <tbody>
                  {users.length === 0 && <tr><td colSpan={7} className="muted">No usage in this period</td></tr>}
                  {users.map((u) => (
                    <tr key={u.user_id ?? 'deleted'}>
                      <td>{u.name || u.email}{u.name && <div className="muted" style={{ fontSize: 12 }}>{u.email}</div>}</td>
                      <td>{rooftopList(u.rooftops)}</td><td className="num">{count(u.requests)}</td><td className="num hide-sm">{count(u.enhance)}</td>
                      <td className="num hide-sm">{count(u.response)}</td><td className="num">{money(u.cost_usd)}</td>
                      <td className="hide-sm">{when(u.last_used)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ---------- users ---------- */

const EMPTY_USER = { email: '', name: '', role: 'user', rooftopIds: [], model: '' };

function UserForm({ initial, rooftops, models, onSubmit, onCancel, submitLabel, emailEditable }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const toggleRooftop = (id) => setForm({
    ...form,
    rooftopIds: form.rooftopIds.includes(id) ? form.rooftopIds.filter((r) => r !== id) : [...form.rooftopIds, id]
  });
  // Disabled rooftops are only listed when already assigned, so they can be removed
  const choices = rooftops.filter((r) => r.active || form.rooftopIds.includes(r.id));

  const submit = async (e) => {
    e.preventDefault();
    if (form.role === 'user' && form.rooftopIds.length === 0) {
      setFormError('Choose at least one rooftop');
      return;
    }
    setFormError('');
    setBusy(true);
    try {
      await onSubmit(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="row">
        {emailEditable && <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>}
        <label>Name<input value={form.name} onChange={set('name')} /></label>
        <label>Role
          <select value={form.role} onChange={set('role')}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label>Model
          <select value={form.model} onChange={set('model')}>
            <option value="">Default ({models.find((m) => m.default)?.label || 'server default'})</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="checks">
        <legend>Rooftops{form.role === 'admin' ? ' (optional for admins)' : ''}</legend>
        {choices.length === 0 && <span className="muted">No rooftops yet. Add one on the Rooftops tab.</span>}
        {choices.map((r) => (
          <label key={r.id} className="check">
            <input type="checkbox" checked={form.rooftopIds.includes(r.id)} onChange={() => toggleRooftop(r.id)} />
            {r.name}{!r.active && <span className="badge">Disabled</span>}
          </label>
        ))}
      </fieldset>
      {formError && <div className="notice error" role="alert" style={{ marginTop: 10 }}>{formError}</div>}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function UsersTab({ me }) {
  const [users, setUsers] = useState(null);
  const [models, setModels] = useState([]);
  const [rooftops, setRooftops] = useState([]);
  const [notice, setNotice] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([api('/api/admin/users'), api('/api/admin/rooftops')]);
      setUsers(u.users);
      setModels(u.models);
      setRooftops(r.rooftops);
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (fn) => {
    try {
      await fn();
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const create = (form) => act(async () => {
    const data = await api('/api/admin/users', { method: 'POST', body: form });
    setAdding(false);
    setNotice({ type: 'success', text: `Created ${data.user.email}. Give them this temporary password; they'll choose a new one when they first sign in:`, secret: data.tempPassword });
  });

  const update = (id, body, message) => act(async () => {
    await api(`/api/admin/users/${id}`, { method: 'PATCH', body });
    setEditing(null);
    if (message) {
      setNotice({ type: 'success', text: message });
    }
  });

  const resetPassword = (user) => {
    if (!window.confirm(`Reset the password for ${user.email}? They will be signed out everywhere.`)) {
      return;
    }
    act(async () => {
      const data = await api(`/api/admin/users/${user.id}/reset-password`, { method: 'POST' });
      setNotice({ type: 'success', text: `New temporary password for ${data.user.email}:`, secret: data.tempPassword });
    });
  };

  const modelLabel = (id) => models.find((m) => m.id === id)?.label.split(' (')[0] || 'Default';
  const shown = (users || []).filter((u) => {
    const q = filter.trim().toLowerCase();
    return !q || [u.email, u.name, ...u.rooftops.map((r) => r.name)].some((v) => (v || '').toLowerCase().includes(q));
  });

  return (
    <>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {rooftops.length === 0 && users && (
        <div className="notice warn">Add a rooftop first (Rooftops tab). Every regular user belongs to at least one.</div>
      )}

      <div className="card">
        <div className="row" style={{ alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Users</h2>
          <span className="spacer" />
          <input placeholder="Search name, email, rooftop" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 260 }} />
          {!adding && <button className="btn primary" onClick={() => { setAdding(true); setEditing(null); }}>Add user</button>}
        </div>

        {adding && (
          <div className="card" style={{ marginTop: 12, background: 'var(--surface-2)' }}>
            <UserForm initial={EMPTY_USER} rooftops={rooftops} models={models} onSubmit={create}
              onCancel={() => setAdding(false)} submitLabel="Create user" emailEditable />
          </div>
        )}

        {!users ? <p className="muted">Loading…</p> : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>User</th><th>Rooftops</th><th className="hide-sm">Model</th><th className="hide-sm">Last active</th><th /></tr></thead>
              <tbody>
                {shown.map((u) => editing === u.id ? (
                  <tr key={u.id}><td colSpan={5}>
                    <div className="muted" style={{ marginBottom: 8 }}>{u.email}</div>
                    <UserForm
                      initial={{ name: u.name, role: u.role, rooftopIds: u.rooftops.map((r) => r.id), model: u.model ?? '' }}
                      rooftops={rooftops} models={models} submitLabel="Save"
                      onSubmit={(form) => update(u.id, form)} onCancel={() => setEditing(null)} />
                  </td></tr>
                ) : (
                  <tr key={u.id} className={u.active ? '' : 'inactive'}>
                    <td>
                      {u.name || u.email}{' '}
                      {u.role === 'admin' && <span className="badge admin">Admin</span>}{' '}
                      {!u.active && <span className="badge">Disabled</span>}{' '}
                      {u.locked && <span className="badge warn">Locked</span>}{' '}
                      {u.must_change_password && u.active && <span className="badge warn">Temp password</span>}
                      {u.name && <div className="muted" style={{ fontSize: 12 }}>{u.email}</div>}
                    </td>
                    <td>
                      {u.rooftops.length === 0 && <span className="muted">None</span>}
                      {u.rooftops.map((r, i) => (
                        <span key={r.id} className={r.active ? '' : 'muted'}>{i > 0 && ', '}{r.name}{!r.active && ' (disabled)'}</span>
                      ))}
                    </td>
                    <td className="hide-sm">{modelLabel(u.model)}</td>
                    <td className="hide-sm">{when(u.last_active_at)}</td>
                    <td>
                      <div className="actions">
                        <button className="btn small" onClick={() => { setEditing(u.id); setAdding(false); }}>Edit</button>
                        {u.locked && <button className="btn small" onClick={() => update(u.id, { unlock: true }, `Unlocked ${u.email}`)}>Unlock</button>}
                        <button className="btn small" onClick={() => resetPassword(u)}>Reset password</button>
                        {u.id !== me.id && (u.active
                          ? <button className="btn small danger" onClick={() => update(u.id, { active: false }, `Disabled ${u.email} and signed them out`)}>Disable</button>
                          : <button className="btn small" onClick={() => update(u.id, { active: true }, `Enabled ${u.email}`)}>Enable</button>)}
                      </div>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={5} className="muted">No users found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------- rooftops ---------- */

function RooftopsTab() {
  const [rooftops, setRooftops] = useState(null);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => api('/api/admin/rooftops')
    .then((d) => setRooftops(d.rooftops))
    .catch((err) => setNotice({ type: 'error', text: err.message })), []);

  useEffect(() => { load(); }, [load]);

  const act = async (fn) => {
    try {
      await fn();
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const add = (e) => {
    e.preventDefault();
    act(async () => {
      await api('/api/admin/rooftops', { method: 'POST', body: { name } });
      setNotice({ type: 'success', text: `Added ${name}` });
      setName('');
    });
  };

  return (
    <>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <form className="card" onSubmit={add}>
        <h2>Add a rooftop</h2>
        <div className="row">
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ancira Chevrolet" required /></label>
          <button className="btn primary">Add</button>
        </div>
      </form>

      <div className="card">
        <h2>Rooftops</h2>
        <p className="muted" style={{ marginTop: 0 }}>Disabling a rooftop blocks its users from the extension. Usage history is kept.</p>
        {!rooftops ? <p className="muted">Loading…</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th className="num">Active users</th><th /></tr></thead>
              <tbody>
                {rooftops.length === 0 && <tr><td colSpan={3} className="muted">No rooftops yet</td></tr>}
                {rooftops.map((r) => (
                  <tr key={r.id} className={r.active ? '' : 'inactive'}>
                    <td>
                      {renaming?.id === r.id ? (
                        <form className="row" onSubmit={(e) => { e.preventDefault(); act(async () => { await api(`/api/admin/rooftops/${r.id}`, { method: 'PATCH', body: { name: renaming.name } }); setRenaming(null); }); }}>
                          <input value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} autoFocus style={{ maxWidth: 280 }} />
                          <button className="btn small primary">Save</button>
                          <button type="button" className="btn small" onClick={() => setRenaming(null)}>Cancel</button>
                        </form>
                      ) : <>{r.name} {!r.active && <span className="badge">Disabled</span>}</>}
                    </td>
                    <td className="num">{count(r.active_users)}</td>
                    <td>
                      <div className="actions">
                        <button className="btn small" onClick={() => setRenaming({ id: r.id, name: r.name })}>Rename</button>
                        {r.active
                          ? <button className="btn small danger" onClick={() => window.confirm(`Disable ${r.name}? Its ${r.active_users} users will lose access.`) && act(() => api(`/api/admin/rooftops/${r.id}`, { method: 'PATCH', body: { active: false } }))}>Disable</button>
                          : <button className="btn small" onClick={() => act(() => api(`/api/admin/rooftops/${r.id}`, { method: 'PATCH', body: { active: true } }))}>Enable</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------- prompts ---------- */

const PROMPT_INFO = {
  enhance: { title: 'Enhance prompt', help: 'Used when someone selects their own text and clicks Enhance.' },
  response: { title: 'Reply prompt', help: 'Used when someone selects a customer message and clicks Reply.' }
};

function PromptEditor({ prompt, onSaved }) {
  const [content, setContent] = useState(prompt.content);
  const [importUrl, setImportUrl] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setContent(prompt.content); }, [prompt.content]);

  const save = async (body) => {
    setBusy(true);
    setNotice(null);
    try {
      const data = await api('/api/admin/prompts', { method: 'PUT', body: { mode: prompt.mode, ...body } });
      setContent(data.prompt.content);
      setImportUrl('');
      setNotice({ type: 'success', text: 'Saved. Everyone will be using it within a minute.' });
      onSaved();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const info = PROMPT_INFO[prompt.mode];
  return (
    <div className="card">
      <h2>{info.title}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {info.help} Last changed {when(prompt.updated_at)}{prompt.updated_by ? ` by ${prompt.updated_by}` : ''}.
      </p>
      <Notice notice={notice} />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} aria-label={info.title} />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={busy || content === prompt.content} onClick={() => save({ content })}>Save</button>
        <button className="btn" disabled={busy || content === prompt.content} onClick={() => setContent(prompt.content)}>Discard changes</button>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <label>Or replace it with the text at a URL (e.g. a raw Gist link)
          <input type="url" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="https://gist.githubusercontent.com/…/raw/…" />
        </label>
        <button className="btn" disabled={busy || !importUrl} onClick={() => window.confirm('Replace this prompt with the text at that URL?') && save({ importUrl })}>Import</button>
      </div>
    </div>
  );
}

function PromptsTab() {
  const [prompts, setPrompts] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api('/api/admin/prompts')
    .then((d) => setPrompts(d.prompts))
    .catch((err) => setError(err.message)), []);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return <div className="notice error">{error}</div>;
  }
  if (!prompts) {
    return <p className="muted">Loading…</p>;
  }
  return prompts.map((p) => <PromptEditor key={p.mode} prompt={p} onSaved={load} />);
}

/* ---------- page ---------- */

const TABS = [
  { id: 'usage', label: 'Usage', Component: UsageTab },
  { id: 'users', label: 'Users', Component: UsersTab },
  { id: 'rooftops', label: 'Rooftops', Component: RooftopsTab },
  { id: 'prompts', label: 'Prompts', Component: PromptsTab }
];

export default function AdminPage() {
  const [state, setState] = useState({ status: 'loading' });
  const [tab, setTab] = useState('usage');

  const refresh = useCallback(async () => {
    try {
      const data = await api('/api/me');
      setState({ status: 'ready', me: data.user });
    } catch (err) {
      setState(err.status === 401 ? { status: 'signed-out' } : { status: 'error', error: err.message });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signOut = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setState({ status: 'signed-out' });
  };

  if (state.status === 'loading') {
    return <main className="shell"><p className="muted">Loading…</p></main>;
  }
  if (state.status === 'error') {
    return <main className="shell"><div className="notice error">{state.error}</div></main>;
  }
  if (state.status === 'signed-out') {
    return <main className="shell"><SignIn onSignedIn={refresh} /></main>;
  }

  const { me } = state;
  if (me.mustChangePassword) {
    return <main className="shell"><ChangePassword onDone={refresh} onSignOut={signOut} /></main>;
  }
  if (me.role !== 'admin') {
    return (
      <main className="shell">
        <div className="card narrow">
          <h2>Administrators only</h2>
          <p>You're signed in as {me.email}. This page is for administrators; use the Chrome extension to enhance text.</p>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </main>
    );
  }

  const Active = TABS.find((t) => t.id === tab).Component;
  return (
    <main className="shell">
      <div className="topbar">
        <h1>AAI for CRM admin</h1>
        <div className="row" style={{ alignItems: 'center' }}>
          <span className="who">{me.email}</span>
          <button className="btn small" onClick={signOut}>Sign out</button>
        </div>
      </div>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      <Active me={me} />
    </main>
  );
}
