/* Organiser console: dashboard, inbox, settings and the conference generator wizard. */
(function () {
  const { esc, url } = UI;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const html = (sel, markup) => { const el = $(sel); if (el) el.innerHTML = markup; return el; };
  const KEY_SESSION = 'ooo.anthropic.key';
  const KEY_STATE = 'ooo.generator.state.v1';
  let health = { ai: { configured: false }, store: { configured: false }, admin: { protected: false } };

  const sessionKey = () => { try { return sessionStorage.getItem(KEY_SESSION) || ''; } catch (_) { return ''; } };
  const setSessionKey = (k) => { try { if (k) sessionStorage.setItem(KEY_SESSION, k); else sessionStorage.removeItem(KEY_SESSION); } catch (_) {} };
  const aiAvailable = () => !!(health.ai && health.ai.configured) || !!sessionKey();
  const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  const fmtRange = (c) => Engine.formatRange(c.start, c.end);
  const sourceLabel = (c) => c._source === 'seed' ? 'Site dataset' : c._source === 'local' ? 'Draft (this browser)' : 'Published from console';

  function statusPills() {
    const pills = [];
    pills.push(health.ai && health.ai.configured ? '<span class="pill ok">AI generator · ' + esc(health.ai.model) + '</span>' : (sessionKey() ? '<span class="pill ok">AI generator · session key</span>' : '<span class="pill warn">AI generator not configured</span>'));
    pills.push(health.store && health.store.configured ? '<span class="pill ok">Server store · Vercel Blob</span>' : '<span class="pill warn">Drafts saved in this browser only</span>');
    pills.push(health.admin && health.admin.protected ? '<span class="pill ok">Passcode protected</span>' : '<span class="pill bad">Console unprotected</span>');
    if (health.offline) pills.push('<span class="pill warn">API offline (static preview)</span>');
    html('#status-pills', pills.join(''));
  }

  function showGate(message) {
    $('#console-body').classList.add('hide');
    const gate = $('#gate');
    gate.classList.remove('hide');
    gate.innerHTML = '<div class="gate panel"><p class="eyebrow">Organiser console</p><h2>Enter the admin passcode</h2><p class="muted small">This deployment protects the console with <code class="env">ADMIN_PASSWORD</code>. The passcode is kept for this browser session only.</p>' + (message ? '<div class="notice err mb-2">' + esc(message) + '</div>' : '') + '<form class="form" id="gate-form"><div class="field"><label for="pw">Passcode</label><input id="pw" type="password" autocomplete="current-password" required></div><button class="btn btn-primary" type="submit">Continue</button></form></div>';
    $('#gate-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      Store.setAdminToken($('#pw').value);
      try { await Store.api('/api/submissions'); location.reload(); }
      catch (err) { Store.setAdminToken(''); showGate(err.status === 401 ? 'That passcode was not accepted.' : 'Could not verify the passcode: ' + err.message); }
    });
  }

  /* ================================================================== */
  /* Dashboard                                                          */
  /* ================================================================== */
  const Dashboard = {
    init() {
      const nav = $('.console-nav');
      nav.addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (!b) return; Dashboard.show(b.dataset.view); });
      const initial = (location.hash || '').replace('#', '');
      Dashboard.show(['overview', 'conferences', 'inbox', 'settings'].indexOf(initial) >= 0 ? initial : 'overview');
      window.addEventListener('hashchange', () => { const v = location.hash.replace('#', ''); if ($('#view-' + v)) Dashboard.show(v); });
    },
    show(view) {
      $$('.console-nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
      $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
      $('#view-title').textContent = { overview: 'Overview', conferences: 'Conferences', inbox: 'Inbox', settings: 'Settings' }[view];
      if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
      Dashboard['render' + view[0].toUpperCase() + view.slice(1)]();
    },

    renderOverview() {
      const confs = Store.conferences();
      const up = Store.upcoming(), past = Store.past();
      const local = Store.localConferences(), remote = Store.remoteConferences();
      const subs = Store.localSubmissions();
      html('#view-overview',
        '<div class="kpi-row">' + [[confs.length, 'Conferences on the site'], [up.length, 'Upcoming'], [past.length, 'Past'], [local.length + remote.length, 'Created in the console']].map(([n, l]) => '<div class="kpi"><div class="num">' + n + '</div><div class="lbl">' + l + '</div></div>').join('') + '</div>' +
        '<div class="grid grid-2 mt-3">' +
          '<div class="panel"><h2>Start something</h2><p class="muted">Generate a fully planned conference from a theme, dates, a location and a speaker list. Pages, booking, hotel and sponsorship links are created automatically.</p><div class="btn-row"><a class="btn btn-primary" href="' + url('generator') + '">New conference</a><button class="btn btn-outline" data-view-go="inbox">Open inbox</button></div>' +
            '<h3 class="mt-4">Environment</h3><ul class="list-check small">' +
              '<li>' + (health.ai && health.ai.configured ? 'AI generator ready on <strong>' + esc(health.ai.model) + '</strong> (effort ' + esc(health.ai.effort) + ')' : 'AI generator off. Add <code class="env">ANTHROPIC_API_KEY</code> to enable intelligent planning; the offline planner works meanwhile.') + '</li>' +
              '<li>' + (health.store && health.store.configured ? 'Server store connected: published conferences and form submissions are shared with every visitor.' : 'No server store: drafts and submissions live in this browser. Add a Vercel Blob store (<code class="env">BLOB_READ_WRITE_TOKEN</code>) to publish for everyone.') + '</li>' +
              '<li>' + (health.admin && health.admin.protected ? 'Console protected by passcode.' : 'Set <code class="env">ADMIN_PASSWORD</code> to protect this console before sharing the URL.') + '</li></ul></div>' +
          '<div class="panel"><h2>Next on the calendar</h2>' + (up.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Conference</th><th>Dates</th><th>Status</th></tr></thead><tbody>' + up.slice(0, 6).map((c) => '<tr><td><a href="' + url('conference', c.id) + '">' + esc(c.title) + '</a><br><span class="small muted">' + esc(c.edition) + ' · ' + esc(c.city) + '</span></td><td>' + esc(fmtRange(c)) + '</td><td>' + esc(c._status) + (c.registration && c.registration.open ? ' · registration open' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">No upcoming conferences.</p>') + '</div>' +
        '</div>' +
        '<div class="panel mt-3"><div class="flex between center wrap gap-1"><h2 class="mb-0">Recent submissions</h2><button class="btn btn-ghost btn-sm" data-view-go="inbox">All submissions →</button></div>' + (subs.length ? '<div class="table-wrap mt-2"><table class="data"><thead><tr><th>Received</th><th>Type</th><th>From</th><th>Detail</th></tr></thead><tbody>' + subs.slice(0, 5).map((s) => '<tr><td>' + esc(new Date(s.createdAt).toLocaleString()) + '</td><td><span class="badge">' + esc(s.kind) + '</span></td><td>' + esc(s.data.name || ((s.data.firstName || '') + ' ' + (s.data.lastName || '')).trim() || s.data.email || '—') + '<br><span class="small muted">' + esc(s.data.email || '') + '</span></td><td class="small">' + esc(s.data.conference || s.data.topic || s.data.title || s.data.hotel || s.data.tier || '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted mt-2">No submissions stored in this browser yet.' + (health.store && health.store.configured ? ' Server submissions appear in the inbox.' : '') + '</p>') + '</div>');
      $$('[data-view-go]').forEach((b) => b.addEventListener('click', () => Dashboard.show(b.dataset.viewGo)));
    },

    renderConferences() {
      const confs = Store.conferences().sort((a, b) => b.start.localeCompare(a.start));
      html('#view-conferences', '<div class="panel"><div class="flex between center wrap gap-1 mb-2"><p class="muted mb-0">' + confs.length + ' conferences. Conferences created in the console can be edited, published to the server store or removed.</p><a class="btn btn-primary btn-sm" href="' + url('generator') + '">New conference</a></div>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>Conference</th><th>Dates</th><th>Location</th><th>Theme</th><th>Status</th><th>Source</th><th>Actions</th></tr></thead><tbody>' +
        confs.map((c) => '<tr><td><strong>' + esc(c.title) + '</strong><br><span class="small muted">' + esc(c.edition || '') + '</span></td><td>' + esc(fmtRange(c)) + '</td><td>' + esc(c.city) + '</td><td class="small">' + esc(c._theme ? c._theme.name : c.themeName || '') + (c._theme && c._theme.compliance ? ' <span class="badge badge-compliance">Compliance</span>' : '') + '</td><td>' + esc(c._status) + '</td><td class="small">' + sourceLabel(c) + '</td>' +
          '<td><div class="actions"><a class="btn btn-outline btn-sm" href="' + url('conference', c.id) + '" target="_blank" rel="noopener">View</a>' +
          (c._source !== 'seed' ? '<a class="btn btn-outline btn-sm" href="' + url('generator') + '?edit=' + encodeURIComponent(c.id) + '">Edit</a>' : '') +
          (c._source === 'local' && health.store && health.store.configured ? '<button class="btn btn-primary btn-sm" data-publish="' + esc(c.id) + '">Publish to site</button>' : '') +
          (c._source === 'remote' ? '<button class="btn btn-outline btn-sm" data-unpublish="' + esc(c.id) + '">Unpublish</button>' : '') +
          (c._source === 'local' ? '<button class="btn btn-outline btn-sm" data-delete="' + esc(c.id) + '">Delete draft</button>' : '') +
          (c._source !== 'seed' ? '<button class="btn btn-ghost btn-sm" data-export="' + esc(c.id) + '">JSON</button>' : '') +
          '</div></td></tr>').join('') + '</tbody></table></div></div>');
      $$('[data-publish]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; try { const c = Store.get(b.dataset.publish); await Store.publishRemote(stripMeta(c)); Store.removeLocal(c.id); UI.toast('Published to the site.'); Dashboard.renderConferences(); } catch (e) { UI.toast(e.message); b.disabled = false; } }));
      $$('[data-unpublish]').forEach((b) => b.addEventListener('click', async () => { if (!confirm('Unpublish this conference from the server store? A copy is kept as a draft in this browser.')) return; b.disabled = true; try { const c = Store.get(b.dataset.unpublish); Store.saveLocal(stripMeta(c)); await Store.deleteRemote(c.id); UI.toast('Unpublished. Kept as a browser draft.'); Dashboard.renderConferences(); } catch (e) { UI.toast(e.message); b.disabled = false; } }));
      $$('[data-delete]').forEach((b) => b.addEventListener('click', () => { if (!confirm('Delete this draft from the browser? This cannot be undone.')) return; Store.removeLocal(b.dataset.delete); Dashboard.renderConferences(); }));
      $$('[data-export]').forEach((b) => b.addEventListener('click', () => { const c = Store.get(b.dataset.export); download(c.id + '.json', JSON.stringify(stripMeta(c), null, 2)); }));
    },

    async renderInbox() {
      html('#view-inbox', '<div class="panel"><p class="muted">Loading submissions…</p></div>');
      let remote = [], remoteError = null;
      if (health.store && health.store.configured) {
        try { const r = await Store.remoteSubmissions(); remote = (r.submissions || []).map((s) => Object.assign({ _where: 'server' }, s)); } catch (e) { remoteError = e.message; }
      }
      const local = Store.localSubmissions().map((s) => Object.assign({ _where: 'browser' }, s));
      const all = remote.concat(local).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const kinds = Array.from(new Set(all.map((s) => s.kind)));
      const render = (filter) => {
        const list = all.filter((s) => !filter || s.kind === filter);
        html('#inbox-list', list.length ? list.map((s) => {
          const d = s.data || {};
          const who = d.name || ((d.firstName || '') + ' ' + (d.lastName || '')).trim() || d.email || 'Anonymous';
          return '<details class="sub-card"><summary><span class="badge">' + esc(s.kind) + '</span><strong>' + esc(who) + '</strong><span class="small muted">' + esc(d.email || '') + (d.organisation ? ' · ' + esc(d.organisation) : '') + '</span><span class="small muted" style="margin-left:auto">' + esc(new Date(s.createdAt).toLocaleString()) + ' · ' + s._where + '</span></summary>' +
            (d.conference ? '<p class="small mt-2 mb-0"><strong>Conference:</strong> ' + esc(d.conference) + '</p>' : '') + (d.message || d.abstract || d.objectives || d.notes ? '<p class="small mt-1 mb-0">' + esc(d.message || d.abstract || d.objectives || d.notes) + '</p>' : '') +
            '<pre>' + esc(JSON.stringify(d, null, 2)) + '</pre><div class="actions mt-2">' + (d.email ? '<a class="btn btn-outline btn-sm" href="mailto:' + esc(d.email) + '?subject=' + encodeURIComponent('Your ' + s.kind.replace('-', ' ') + ' — OOO') + '">Reply by email</a>' : '') + '<button class="btn btn-ghost btn-sm" data-del-sub="' + esc(s.id) + '" data-where="' + s._where + '" data-path="' + esc(s._pathname || '') + '">Delete</button></div></details>';
        }).join('') : '<div class="empty">No submissions' + (filter ? ' of this type' : '') + '.</div>');
        $$('[data-del-sub]').forEach((b) => b.addEventListener('click', async () => {
          if (!confirm('Delete this submission?')) return;
          if (b.dataset.where === 'browser') { const rest = Store.localSubmissions().filter((x) => x.id !== b.dataset.delSub); localStorage.setItem('ooo.submissions.v1', JSON.stringify(rest)); }
          else { try { await Store.api('/api/submissions?pathname=' + encodeURIComponent(b.dataset.path), { method: 'DELETE' }); } catch (e) { UI.toast(e.message); return; } }
          Dashboard.renderInbox();
        }));
      };
      html('#view-inbox', '<div class="panel"><div class="flex between center wrap gap-1 mb-2"><div><p class="muted mb-0">' + all.length + ' submission' + (all.length === 1 ? '' : 's') + (remote.length ? ' · ' + remote.length + ' on the server' : '') + (local.length ? ' · ' + local.length + ' in this browser' : '') + '.' + (remoteError ? ' <span class="small" style="color:var(--danger)">Server: ' + esc(remoteError) + '</span>' : '') + '</p></div><div class="inline-form"><select id="inbox-filter" aria-label="Filter"><option value="">All types</option>' + kinds.map((k) => '<option value="' + esc(k) + '">' + esc(k) + '</option>').join('') + '</select><button class="btn btn-outline btn-sm" id="inbox-csv">Export CSV</button></div></div><div id="inbox-list"></div></div>');
      render('');
      $('#inbox-filter').addEventListener('change', (e) => render(e.target.value));
      $('#inbox-csv').addEventListener('click', () => {
        const filter = $('#inbox-filter').value;
        const list = all.filter((s) => !filter || s.kind === filter);
        const cols = ['id', 'kind', 'createdAt', 'where', 'name', 'email', 'organisation', 'conference', 'message'];
        const rows = [cols.join(',')].concat(list.map((s) => { const d = s.data || {}; const name = d.name || ((d.firstName || '') + ' ' + (d.lastName || '')).trim(); return [s.id, s.kind, s.createdAt, s._where, name, d.email || '', d.organisation || '', d.conference || '', (d.message || d.abstract || d.objectives || d.notes || '')].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(','); }));
        download('ooo-submissions.csv', rows.join('\n'), 'text/csv');
      });
    },

    renderSettings() {
      const key = sessionKey();
      html('#view-settings',
        '<div class="panel"><h2>AI generator</h2><p class="muted">The generator calls the Anthropic API from a serverless function, so the key never reaches the browser. Configure <code class="env">ANTHROPIC_API_KEY</code> in the Vercel project (Settings → Environment Variables) and redeploy.</p>' +
          '<dl class="kv"><dt>Status</dt><dd>' + (health.ai && health.ai.configured ? '<span class="pill ok">Configured</span>' : (key ? '<span class="pill ok">Session key in use</span>' : '<span class="pill warn">Not configured</span>')) + '</dd><dt>Model</dt><dd><code class="env">' + esc((health.ai && health.ai.model) || 'claude-opus-5') + '</code> <span class="small muted">(override with ANTHROPIC_MODEL)</span></dd><dt>Effort</dt><dd><code class="env">' + esc((health.ai && health.ai.effort) || 'medium') + '</code> <span class="small muted">(ANTHROPIC_EFFORT: low, medium, high, xhigh, max)</span></dd></dl>' +
          '<div class="btn-row mt-2"><button class="btn btn-outline" id="ai-test"' + (aiAvailable() ? '' : ' disabled') + '>Test connection</button><span class="small muted" id="ai-test-result"></span></div>' +
          '<h3 class="mt-4">Session key (optional)</h3><p class="small muted">For testing before the environment variable is set. The key is kept in this browser tab’s session storage only and sent to your own deployment with each generator request. Prefer the environment variable for regular use.</p>' +
          '<form class="inline-form" id="key-form"><label class="sr-only" for="ak">Anthropic API key</label><input id="ak" type="password" placeholder="sk-ant-…" value="' + esc(key) + '" autocomplete="off"><button class="btn btn-primary" type="submit">Save for this session</button>' + (key ? '<button class="btn btn-ghost" type="button" id="key-clear">Clear</button>' : '') + '</form></div>' +
        '<div class="panel"><h2>Server store</h2><p class="muted">Published conferences and form submissions are stored in a Vercel Blob store when <code class="env">BLOB_READ_WRITE_TOKEN</code> is present. Create one from the Vercel dashboard (Storage → Create → Blob) and connect it to this project; the variable is added automatically.</p><dl class="kv"><dt>Status</dt><dd>' + (health.store && health.store.configured ? '<span class="pill ok">Connected</span>' : '<span class="pill warn">Not configured — drafts stay in this browser</span>') + '</dd></dl></div>' +
        '<div class="panel"><h2>Security</h2><p class="muted">Set <code class="env">ADMIN_PASSWORD</code> to require a passcode for this console and for the generator, publishing and inbox endpoints.</p><dl class="kv"><dt>Status</dt><dd>' + (health.admin && health.admin.protected ? '<span class="pill ok">Protected</span>' : '<span class="pill bad">Unprotected</span>') + '</dd></dl>' + (health.admin && health.admin.protected ? '<button class="btn btn-outline btn-sm mt-2" id="sign-out">Sign out of this session</button>' : '') + '</div>' +
        '<div class="panel"><h2>Environment variables</h2><div class="table-wrap"><table class="data"><thead><tr><th>Variable</th><th>Purpose</th><th>Required</th></tr></thead><tbody>' +
          [['ANTHROPIC_API_KEY', 'Enables Claude-assisted conference generation.', 'For AI mode'], ['ANTHROPIC_MODEL', 'Model id. Default claude-opus-5.', 'No'], ['ANTHROPIC_EFFORT', 'Reasoning effort. Default medium.', 'No'], ['ADMIN_PASSWORD', 'Protects the console and admin endpoints.', 'Strongly recommended'], ['BLOB_READ_WRITE_TOKEN', 'Vercel Blob store for published conferences and submissions.', 'For publishing to all visitors']].map(([v, p, r]) => '<tr><td><code class="env">' + v + '</code></td><td>' + p + '</td><td>' + r + '</td></tr>').join('') + '</tbody></table></div></div>' +
        '<div class="panel"><h2>Data</h2><p class="muted">Drafts created in this browser can be exported, imported on another machine or cleared.</p><div class="btn-row"><button class="btn btn-outline" id="export-drafts">Export drafts (JSON)</button><label class="btn btn-outline" for="import-drafts">Import drafts<input id="import-drafts" type="file" accept="application/json" class="sr-only"></label><button class="btn btn-ghost" id="clear-drafts">Clear drafts</button><button class="btn btn-ghost" id="clear-subs">Clear browser submissions</button></div></div>');
      $('#key-form').addEventListener('submit', (e) => { e.preventDefault(); setSessionKey($('#ak').value.trim()); UI.toast('Session key saved.'); statusPills(); Dashboard.renderSettings(); });
      const clr = $('#key-clear'); if (clr) clr.addEventListener('click', () => { setSessionKey(''); statusPills(); Dashboard.renderSettings(); });
      $('#ai-test').addEventListener('click', async () => {
        const out = $('#ai-test-result'); out.textContent = 'Testing…';
        try { const r = await callGenerate('test', {}); out.textContent = 'Connected to ' + r.model + ' · replied “' + r.data.reply + '” in ' + r.data.latencyMs + ' ms.'; }
        catch (e) { out.textContent = 'Failed: ' + e.message; }
      });
      const so = $('#sign-out'); if (so) so.addEventListener('click', () => { Store.setAdminToken(''); location.reload(); });
      $('#export-drafts').addEventListener('click', () => download('ooo-drafts.json', JSON.stringify(Store.localConferences(), null, 2)));
      $('#import-drafts').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const list = JSON.parse(await f.text()); (Array.isArray(list) ? list : [list]).forEach((c) => Store.saveLocal(Engine.sanitiseConference(c))); UI.toast('Imported ' + (Array.isArray(list) ? list.length : 1) + ' draft(s).'); } catch (err) { UI.toast('Import failed: ' + err.message); } });
      $('#clear-drafts').addEventListener('click', () => { if (confirm('Remove all drafts from this browser?')) { Store.localConferences().forEach((c) => Store.removeLocal(c.id)); UI.toast('Drafts cleared.'); } });
      $('#clear-subs').addEventListener('click', () => { if (confirm('Remove all submissions stored in this browser?')) { Store.clearLocalSubmissions(); UI.toast('Cleared.'); } });
    },
  };

  function stripMeta(c) {
    const out = Object.assign({}, c);
    Object.keys(out).forEach((k) => { if (k.startsWith('_')) delete out[k]; });
    return out;
  }

  async function callGenerate(stage, payload) {
    const headers = {};
    const k = sessionKey(); if (k) headers['x-anthropic-key'] = k;
    return Store.api('/api/generate', { method: 'POST', body: { stage, payload }, headers });
  }

  /* ================================================================== */
  /* Generator wizard                                                   */
  /* ================================================================== */
  const STEPS = ['Theme', 'Essentials', 'Speakers', 'Generate', 'Review & publish'];
  const defaultState = () => ({
    step: 0,
    brief: {
      theme: '', customTheme: { name: '', description: '', tracks: '', keywords: '', audiences: '' },
      title: '', start: '', end: '', city: '', country: '', region: '', venue: '', venueAddress: '', expected: 300, currency: '',
      options: { welcomeReception: true, gala: true, workshopsDay: true, excursion: true, roundtables: true, livestream: false },
      registrationOpen: true, cfpOpen: true,
      speakers: [{ name: '', title: '', org: '', linkedin: '', notes: '' }, { name: '', title: '', org: '', linkedin: '', notes: '' }, { name: '', title: '', org: '', linkedin: '', notes: '' }],
    },
    mode: 'ai',
    result: null,
    aiUsed: false,
    log: [],
    editing: null,
  });

  const Generator = {
    state: defaultState(),
    init() {
      try { const saved = JSON.parse(sessionStorage.getItem(KEY_STATE)); if (saved && saved.brief) Generator.state = Object.assign(defaultState(), saved); } catch (_) {}
      const editId = new URLSearchParams(location.search).get('edit');
      if (editId) Generator.loadForEdit(editId);
      if (!aiAvailable() && Generator.state.mode === 'ai') Generator.state.mode = 'instant';
      Generator.render();
    },
    save() { try { sessionStorage.setItem(KEY_STATE, JSON.stringify(Generator.state)); } catch (_) {} },
    loadForEdit(id) {
      const c = Store.get(id);
      if (!c || c._source === 'seed') { UI.toast('Only conferences created in the console can be edited.'); return; }
      const s = defaultState();
      s.editing = id;
      s.brief.theme = c.customTheme ? '__custom' : c.themeId;
      if (c.customTheme) s.brief.customTheme = { name: c.customTheme.name, description: c.customTheme.description || '', tracks: (c.customTheme.tracks || []).join(', '), keywords: (c.customTheme.keywords || []).join(', '), audiences: (c.customTheme.audiences || []).join(', ') };
      Object.assign(s.brief, { title: c.title, start: c.start, end: c.end, city: c.city, country: c.country, region: c.region, venue: c.venue && c.venue.name !== 'Venue to be confirmed' ? c.venue.name : '', venueAddress: c.venue ? c.venue.address : '', expected: c.expected || 300, currency: c.registration ? c.registration.currency : '' });
      s.brief.speakers = (c.speakers || []).map((sp) => ({ name: sp.name, title: sp.title || '', org: sp.org || '', linkedin: sp.linkedin || '', notes: (sp.expertise || []).join(', ') }));
      if (!s.brief.speakers.length) s.brief.speakers = defaultState().brief.speakers;
      s.result = stripMeta(c);
      s.aiUsed = !!c.aiAssisted;
      s.step = 4;
      Generator.state = s;
    },
    go(step) { Generator.state.step = step; Generator.save(); Generator.render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },

    theme() {
      const b = Generator.state.brief;
      if (b.theme === '__custom') {
        const ct = b.customTheme;
        return Engine.resolveTheme({ name: ct.name || 'Custom programme', description: ct.description, tracks: ct.tracks.split(',').map((x) => x.trim()).filter(Boolean), keywords: ct.keywords.split(',').map((x) => x.trim()).filter(Boolean), audiences: ct.audiences.split(',').map((x) => x.trim()).filter(Boolean) }, MLS.THEMES);
      }
      return MLS.THEMES.find((t) => t.id === b.theme) || null;
    },

    render() {
      const st = Generator.state;
      html('#steps', STEPS.map((s, i) => '<button type="button" class="' + (i === st.step ? 'active' : '') + (i < st.step ? ' done' : '') + '" data-step="' + i + '"' + (i > st.step && !st.result && i > 3 ? ' disabled' : '') + '><span class="n">' + (i < st.step ? '✓' : i + 1) + '</span>' + s + '</button>').join(''));
      $$('#steps button').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.step; if (i <= st.step || st.result) Generator.go(i); }));
      const t = Generator.theme();
      html('#side-summary', (t ? '<p><strong>' + esc(t.name) + '</strong></p>' : '') + (st.brief.title ? '<p>' + esc(st.brief.title) + '</p>' : '') + (st.brief.start ? '<p>' + esc(Engine.formatRange(st.brief.start, st.brief.end || st.brief.start)) + '<br>' + esc([st.brief.city, st.brief.country].filter(Boolean).join(', ')) + '</p>' : '') + '<p>' + st.brief.speakers.filter((s) => s.name.trim()).length + ' speakers</p>' + (st.editing ? '<p class="badge badge-accent">Editing ' + esc(st.editing) + '</p>' : ''));
      Generator['step' + st.step]();
    },

    /* Step 0: theme */
    step0() {
      const b = Generator.state.brief;
      const groups = ['Compliance', 'Regulatory', 'Practice', 'Technology'];
      const card = (t) => '<button type="button" class="theme-option' + (b.theme === t.id ? ' selected' : '') + '" data-theme="' + esc(t.id) + '" style="--sw:' + t.color + '"><span class="swatch"></span><span><strong>' + esc(t.name) + '</strong><span class="d">' + esc(t.short) + '</span>' + (t.compliance ? '<span class="badge badge-compliance">Compliance</span>' : '') + '</span></button>';
      html('#wizard', '<div class="panel"><h2>Choose a theme</h2><p class="muted">Pre-selected themes carry a track structure, a bank of session topics, audience profile and sponsor categories. Compliance themes, including compliance functions within financial institutions, are grouped first. Or define your own.</p>' +
        groups.map((g) => '<p class="group-label">' + g + (g === 'Compliance' ? ' · compliance-focused programmes' : '') + '</p><div class="theme-grid">' + MLS.THEMES.filter((t) => t.group === g).map(card).join('') + '</div>').join('') +
        '<p class="group-label">Your own theme</p><div class="theme-grid"><button type="button" class="theme-option' + (b.theme === '__custom' ? ' selected' : '') + '" data-theme="__custom" style="--sw:var(--accent)"><span class="swatch"></span><span><strong>Custom theme</strong><span class="d">Name the topic, describe the focus and optionally set your own tracks. The planner builds a generic structure and the AI mode writes the detail.</span></span></button></div>' +
        '<div id="custom-fields" class="' + (b.theme === '__custom' ? '' : 'hide') + ' mt-3"><div class="form"><div class="form-row">' + UI.field({ name: 'ct-name', label: 'Theme name', required: true, value: b.customTheme.name, placeholder: 'e.g. Insurance Distribution Compliance' }) + UI.field({ name: 'ct-tracks', label: 'Tracks (comma-separated)', value: b.customTheme.tracks, placeholder: 'Regulation, Conduct, Technology' }) + '</div>' + UI.field({ name: 'ct-desc', label: 'Focus and audience', type: 'textarea', value: b.customTheme.description, placeholder: 'One or two sentences on what the programme covers and who it is for.' }) + '<div class="form-row">' + UI.field({ name: 'ct-keywords', label: 'Keywords', value: b.customTheme.keywords, placeholder: 'comma-separated' }) + UI.field({ name: 'ct-aud', label: 'Audiences', value: b.customTheme.audiences, placeholder: 'Heads of Compliance, General Counsel…' }) + '</div></div></div>' +
        '<div class="btn-row mt-4"><button class="btn btn-primary btn-lg" id="next">Continue to essentials</button></div></div>');
      $$('[data-theme]').forEach((el) => el.addEventListener('click', () => { b.theme = el.dataset.theme; $$('[data-theme]').forEach((x) => x.classList.toggle('selected', x === el)); $('#custom-fields').classList.toggle('hide', b.theme !== '__custom'); if (b.theme !== '__custom') { const t = MLS.THEMES.find((x) => x.id === b.theme); if (t && !Generator.state.result) b.title = ''; } Generator.save(); }));
      ['ct-name', 'ct-tracks', 'ct-desc', 'ct-keywords', 'ct-aud'].forEach((id) => { const el = $('#' + id); el.addEventListener('input', () => { b.customTheme = { name: $('#ct-name').value, tracks: $('#ct-tracks').value, description: $('#ct-desc').value, keywords: $('#ct-keywords').value, audiences: $('#ct-aud').value }; Generator.save(); }); });
      $('#next').addEventListener('click', () => {
        if (!b.theme) return UI.toast('Choose a theme to continue.');
        if (b.theme === '__custom' && !b.customTheme.name.trim()) return UI.toast('Give your custom theme a name.');
        Generator.go(1);
      });
    },

    /* Step 1: essentials */
    step1() {
      const b = Generator.state.brief;
      const t = Generator.theme();
      const year = (b.start || new Date().toISOString()).slice(0, 4);
      const suggested = t ? Engine.fill(t.titlePattern, { year }) : '';
      if (!b.title && suggested) b.title = suggested;
      const opt = (k, label, hint) => '<label class="check"><input type="checkbox" name="opt-' + k + '"' + (b.options[k] ? ' checked' : '') + '><span><strong>' + label + '</strong>' + (hint ? '<br><span class="small muted">' + hint + '</span>' : '') + '</span></label>';
      html('#wizard', '<div class="panel"><h2>Essentials</h2><p class="muted">Theme: <strong>' + esc(t ? t.name : '') + '</strong>. <button class="btn btn-ghost btn-sm" id="back0">Change</button></p>' +
        '<div class="form"><div class="form-row">' + UI.field({ name: 'title', label: 'Conference title', required: true, value: b.title, hint: suggested ? 'Suggested: ' + suggested : '' }) + UI.field({ name: 'expected', label: 'Expected delegates', type: 'number', value: b.expected, attrs: ' min="30" max="5000"' }) + '</div>' +
        '<div class="form-row">' + UI.field({ name: 'start', label: 'Start date', type: 'date', required: true, value: b.start }) + UI.field({ name: 'end', label: 'End date', type: 'date', required: true, value: b.end, hint: 'Four days or more adds an arrival day and a masterclass day.' }) + '</div>' +
        '<div class="form-row">' + UI.field({ name: 'city', label: 'City', required: true, value: b.city, placeholder: 'e.g. Nusa Dua, Bali' }) + UI.field({ name: 'country', label: 'Country', required: true, value: b.country, placeholder: 'e.g. Indonesia' }) + '</div>' +
        '<div class="form-row">' + UI.field({ name: 'venue', label: 'Venue name', value: b.venue, placeholder: 'Leave blank to receive a venue recommendation' }) + UI.field({ name: 'venueAddress', label: 'Venue address', value: b.venueAddress }) + '</div>' +
        '<div class="form-row">' + UI.field({ name: 'currency', label: 'Pricing currency', type: 'select', value: b.currency || Engine.currencyFor(b.country), options: [['', 'Automatic (' + Engine.currencyFor(b.country) + ')'], 'USD', 'EUR', 'GBP', 'SGD', 'AUD', 'CAD', 'CHF', 'HKD', 'JPY', 'AED', 'INR'] }) + UI.field({ name: 'region', label: 'Region', type: 'select', value: b.region || Engine.regionFor(b.country), options: [['', 'Automatic (' + Engine.regionFor(b.country) + ')'], 'Asia-Pacific', 'Europe', 'Americas', 'Middle East', 'Africa', 'International'] }) + '</div>' +
        '<h3 class="mt-2">Programme options</h3><div class="grid grid-2">' + opt('welcomeReception', 'Welcome reception', 'Evening before or on the first day') + opt('gala', 'Gala dinner', 'Hosted by the gala partner') + opt('workshopsDay', 'Masterclass day', 'Half-day masterclasses on the final day (four days or more)') + opt('excursion', 'Cultural programme', 'Optional excursion for delegates and guests') + opt('roundtables', 'Closed-door roundtables', 'Chatham House rule sessions for senior delegates') + opt('livestream', 'Livestream pass', 'Plenary sessions streamed for remote delegates') + '</div>' +
        '<h3 class="mt-2">Status</h3><div class="grid grid-2"><label class="check"><input type="checkbox" name="registrationOpen"' + (b.registrationOpen ? ' checked' : '') + '><span><strong>Registration open</strong><br><span class="small muted">Off for save-the-date announcements.</span></span></label><label class="check"><input type="checkbox" name="cfpOpen"' + (b.cfpOpen ? ' checked' : '') + '><span><strong>Call for speakers open</strong></span></label></div></div>' +
        '<div class="btn-row mt-4"><button class="btn btn-outline" id="back">Back</button><button class="btn btn-primary btn-lg" id="next">Continue to speakers</button></div></div>');
      const read = () => {
        b.title = $('#title').value.trim(); b.expected = +$('#expected').value || 300; b.start = $('#start').value; b.end = $('#end').value; b.city = $('#city').value.trim(); b.country = $('#country').value.trim(); b.venue = $('#venue').value.trim(); b.venueAddress = $('#venueAddress').value.trim(); b.currency = $('#currency').value; b.region = $('#region').value;
        ['welcomeReception', 'gala', 'workshopsDay', 'excursion', 'roundtables', 'livestream'].forEach((k) => { b.options[k] = $('[name="opt-' + k + '"]').checked; });
        b.registrationOpen = $('[name="registrationOpen"]').checked; b.cfpOpen = $('[name="cfpOpen"]').checked;
        Generator.save();
      };
      $$('#wizard input, #wizard select').forEach((el) => el.addEventListener('change', read));
      $$('#wizard input').forEach((el) => el.addEventListener('input', read));
      $('#start').addEventListener('change', () => { if (!$('#end').value || $('#end').value < $('#start').value) { $('#end').value = $('#start').value; read(); } if (t && (!b.title || b.title === suggested)) { $('#title').value = Engine.fill(t.titlePattern, { year: $('#start').value.slice(0, 4) }); read(); } });
      $('#back0').addEventListener('click', () => Generator.go(0));
      $('#back').addEventListener('click', () => Generator.go(0));
      $('#next').addEventListener('click', () => {
        read();
        const problems = [];
        if (!b.title) problems.push('a title'); if (!b.start) problems.push('a start date'); if (!b.end) problems.push('an end date'); if (!b.city) problems.push('a city'); if (!b.country) problems.push('a country');
        if (b.start && b.end && b.end < b.start) problems.push('an end date after the start date');
        if (b.start && b.end && Engine.daysBetween(b.start, b.end) > 6) problems.push('a duration of seven days or fewer');
        if (problems.length) return UI.toast('Please provide ' + problems.join(', ') + '.');
        Generator.go(2);
      });
    },

    /* Step 2: speakers */
    step2() {
      const b = Generator.state.brief;
      const row = (s, i) => '<div class="speaker-row" data-i="' + i + '"><div><label>Full name</label><input data-k="name" value="' + esc(s.name) + '" placeholder="e.g. Amara Okafor"></div><div><label>Title</label><input data-k="title" value="' + esc(s.title) + '" placeholder="Chief Compliance Officer"></div><div><label>Organisation</label><input data-k="org" value="' + esc(s.org) + '" placeholder="Northgate Bank"></div><div><label>LinkedIn profile (optional)</label><input data-k="linkedin" value="' + esc(s.linkedin) + '" placeholder="linkedin.com/in/…"></div><div><button class="btn btn-ghost btn-sm" type="button" data-remove="' + i + '" aria-label="Remove speaker">Remove</button></div><div style="grid-column:1 / -1"><label>Expertise or notes (optional)</label><input data-k="notes" value="' + esc(s.notes) + '" placeholder="AML, sanctions; former regulator; happy to keynote"></div></div>';
      html('#wizard', '<div class="panel"><h2>Speakers</h2><p class="muted">Add the speakers you have confirmed or invited. The first two become programme chairs. LinkedIn profiles are stored and linked from each speaker page; biographies are drafted from the details you enter (the AI mode never infers content from the profile itself). You can also generate a programme with no speakers and add them later.</p>' +
        '<div id="rows">' + b.speakers.map(row).join('') + '</div>' +
        '<div class="btn-row mt-2"><button class="btn btn-outline" id="add">Add speaker</button><button class="btn btn-ghost" id="paste-toggle">Paste a list</button></div>' +
        '<div id="paste" class="hide mt-2"><div class="field"><label for="paste-text">One speaker per line: Name | Title | Organisation | LinkedIn URL | Notes</label><textarea id="paste-text" placeholder="Amara Okafor | Group Chief Compliance Officer | Northgate Bank plc | https://www.linkedin.com/in/example | AML, sanctions"></textarea></div><button class="btn btn-outline btn-sm" id="paste-apply">Add these speakers</button></div>' +
        '<div class="btn-row mt-4"><button class="btn btn-outline" id="back">Back</button><button class="btn btn-primary btn-lg" id="next">Continue to generation</button></div></div>');
      const read = () => { b.speakers = $$('.speaker-row').map((r) => ({ name: $('[data-k="name"]', r).value, title: $('[data-k="title"]', r).value, org: $('[data-k="org"]', r).value, linkedin: $('[data-k="linkedin"]', r).value, notes: $('[data-k="notes"]', r).value })); Generator.save(); };
      $('#rows').addEventListener('input', read);
      $('#rows').addEventListener('click', (e) => { const btn = e.target.closest('[data-remove]'); if (!btn) return; read(); b.speakers.splice(+btn.dataset.remove, 1); if (!b.speakers.length) b.speakers.push({ name: '', title: '', org: '', linkedin: '', notes: '' }); Generator.save(); Generator.render(); });
      $('#add').addEventListener('click', () => { read(); b.speakers.push({ name: '', title: '', org: '', linkedin: '', notes: '' }); Generator.save(); Generator.render(); });
      $('#paste-toggle').addEventListener('click', () => $('#paste').classList.toggle('hide'));
      $('#paste-apply').addEventListener('click', () => { read(); const lines = $('#paste-text').value.split('\n').map((l) => l.trim()).filter(Boolean); lines.forEach((l) => { const p = l.split('|').map((x) => x.trim()); if (p[0]) b.speakers.push({ name: p[0], title: p[1] || '', org: p[2] || '', linkedin: p[3] || '', notes: p[4] || '' }); }); b.speakers = b.speakers.filter((s) => s.name.trim()); if (!b.speakers.length) b.speakers.push({ name: '', title: '', org: '', linkedin: '', notes: '' }); Generator.save(); Generator.render(); });
      $('#back').addEventListener('click', () => Generator.go(1));
      $('#next').addEventListener('click', () => { read(); b.speakers = b.speakers.filter((s) => s.name.trim()); if (!b.speakers.length) b.speakers.push({ name: '', title: '', org: '', linkedin: '', notes: '' }); Generator.save(); Generator.go(3); });
    },

    /* Step 3: generate */
    step3() {
      const st = Generator.state;
      const speakers = st.brief.speakers.filter((s) => s.name.trim());
      const nDays = st.brief.start && st.brief.end ? Engine.daysBetween(st.brief.start, st.brief.end) + 1 : 1;
      const aiOk = aiAvailable();
      if (!aiOk) st.mode = 'instant';
      html('#wizard', '<div class="panel"><h2>Generate the conference</h2>' +
        '<div class="mode-cards"><button type="button" class="mode-card' + (st.mode === 'ai' ? ' selected' : '') + '" data-mode="ai"' + (aiOk ? '' : ' disabled') + '><strong>Intelligent planning with Claude</strong><span class="small">Writes the concept, a bespoke programme for each day, draft speaker biographies from the details you supplied, candidate hotels and a partnership plan. Runs in ' + (2 + nDays + Math.ceil(speakers.length / 8)) + ' short steps.' + (aiOk ? '' : ' <br><span style="color:var(--danger)">Requires ANTHROPIC_API_KEY (or a session key in Settings).</span>') + '</span></button>' +
        '<button type="button" class="mode-card' + (st.mode === 'instant' ? ' selected' : '') + '" data-mode="instant"><strong>Instant planner</strong><span class="small">Builds the full structure immediately from the theme’s session bank: tracks, a timed programme, registration tiers, sponsorship packages and a hotel plan. Works offline; no API key needed.</span></button></div>' +
        '<div class="btn-row mt-3"><button class="btn btn-outline" id="back">Back</button><button class="btn btn-primary btn-lg" id="run">' + (st.result ? 'Regenerate' : 'Generate conference') + '</button>' + (st.result ? '<button class="btn btn-ghost" id="review">Review current result →</button>' : '') + '</div>' +
        '<div id="progress" class="hide mt-3"><div class="progress"><span id="bar"></span></div><div class="log" id="log" aria-live="polite"></div></div></div>');
      $$('[data-mode]').forEach((el) => el.addEventListener('click', () => { if (el.disabled) return; st.mode = el.dataset.mode; $$('[data-mode]').forEach((x) => x.classList.toggle('selected', x === el)); Generator.save(); }));
      $('#back').addEventListener('click', () => Generator.go(2));
      const rv = $('#review'); if (rv) rv.addEventListener('click', () => Generator.go(4));
      $('#run').addEventListener('click', () => Generator.run());
    },

    briefForEngine() {
      const b = Generator.state.brief;
      const theme = b.theme === '__custom' ? Generator.theme() : b.theme;
      return {
        theme, title: b.title, start: b.start, end: b.end, city: b.city, country: b.country, region: b.region || undefined, venue: b.venue || undefined, venueAddress: b.venueAddress || undefined, expected: b.expected, currency: b.currency || undefined,
        options: b.options, registrationOpen: b.registrationOpen, cfpOpen: b.cfpOpen,
        speakers: b.speakers.filter((s) => s.name.trim()).map((s) => ({ name: s.name, title: s.title, org: s.org, linkedin: s.linkedin || null, expertise: s.notes ? s.notes.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : [] })),
      };
    },

    async run() {
      const st = Generator.state;
      const runBtn = $('#run'); runBtn.disabled = true;
      $('#progress').classList.remove('hide');
      const logEl = $('#log'); logEl.innerHTML = '';
      const log = (msg, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = msg; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; };
      let done = 0, total = 1;
      const tick = () => { done++; $('#bar').style.width = Math.min(100, Math.round((done / total) * 100)) + '%'; };
      try {
        log('Building the base plan from the theme, dates and speakers…');
        let conf = Engine.plan(Generator.briefForEngine(), { themes: MLS.THEMES });
        if (st.editing) conf.id = st.editing;
        conf.aiAssisted = false;
        tick();
        log('Base plan ready: ' + conf.program.length + ' day(s), ' + conf.tracks.length + ' tracks, ' + conf.speakers.length + ' speakers.', 'ok');
        if (st.mode === 'ai') {
          total = 2 + conf.program.length + Math.ceil(conf.speakers.length / 8) + 1;
          $('#bar').style.width = Math.round((done / total) * 100) + '%';
          await Generator.runAI(conf, log, tick);
        }
        conf = Engine.sanitiseConference(conf);
        conf.createdAt = conf.createdAt || new Date().toISOString();
        st.result = conf; st.aiUsed = st.mode === 'ai'; Generator.save();
        $('#bar').style.width = '100%';
        log('Done. Review the conference and publish when ready.', 'ok');
        setTimeout(() => Generator.go(4), 600);
      } catch (err) {
        console.error(err);
        log('Generation failed: ' + err.message, 'err');
        runBtn.disabled = false;
      }
    },

    async runAI(conf, log, tick) {
      const b = Generator.state.brief;
      const theme = Generator.theme();
      const nDays = conf.program.length;
      const year = conf.start.slice(0, 4);
      const stage = async (name, payload, label) => {
        log('Claude · ' + label + '…');
        const started = Date.now();
        const r = await callGenerate(name, payload);
        log('  ✓ ' + label + ' (' + Math.round((Date.now() - started) / 100) / 10 + 's, ' + (r.usage ? r.usage.output_tokens + ' tokens' : '') + ')', 'ok');
        tick();
        return r.data;
      };
      const themeBrief = theme ? { name: theme.name, description: theme.description, compliance: !!theme.compliance, keywords: theme.keywords, audiences: theme.audiences, defaultTracks: theme.tracks, sponsorCategories: theme.sponsorCategories } : null;

      // 1. Concept
      let keyTopics = [];
      try {
        const c = await stage('concept', { brief: { title: b.title, edition: conf.edition, theme: themeBrief, start: conf.start, end: conf.end, nDays, year, city: conf.city, country: conf.country, region: conf.region, venue: b.venue || null, expected: conf.expected, format: conf.format, options: b.options, speakers: conf.speakers.map((s) => ({ name: s.name, title: s.title, org: s.org })) } }, 'concept, tracks and key topics');
        const oldTracks = conf.tracks;
        conf.title = b.title || c.title; conf.edition = c.edition || conf.edition; conf.tagline = c.tagline; conf.summary = c.summary; conf.description = c.description;
        conf.tracks = c.tracks.map((t) => ({ id: Engine.slugify(t.name), name: t.name, description: t.description }));
        // remap base programme track ids by position so a failed agenda stage still renders cleanly
        const remap = (s) => { if (s.parallel) { s.parallel.forEach(remap); return; } if (s.track) { const i = oldTracks.findIndex((t) => t.id === s.track); s.track = i >= 0 && conf.tracks[i] ? conf.tracks[i].id : (conf.tracks[0] ? conf.tracks[0].id : null); } };
        conf.program.forEach((d) => d.sessions.forEach(remap));
        conf.highlights = c.highlights; conf.audiences = c.audiences; conf.hashtag = c.hashtag || conf.hashtag; conf.faq = c.faq; keyTopics = c.keyTopics; conf.keyTopics = keyTopics;
        conf.aiAssisted = true;
      } catch (err) { log('  ✗ concept stage failed (' + err.message + '); keeping the planner’s concept.', 'err'); tick(); }

      // 2. Agenda, one day at a time
      const roster = conf.speakers.map((s) => ({ id: s.id, name: s.name, title: s.title, org: s.org, expertise: s.expertise }));
      const fullIdx = conf.program.map((d, i) => (/^Arrival/.test(d.label) || /^Masterclass/.test(d.label) ? -1 : i)).filter((i) => i >= 0);
      const used = [];
      for (let i = 0; i < conf.program.length; i++) {
        const day = conf.program[i];
        const kind = /^Arrival/.test(day.label) ? 'arrival' : /^Masterclass/.test(day.label) ? 'masterclass' : 'full';
        const fixedEvents = day.sessions.filter((s) => !s.parallel && s.time).map((s) => ({ type: s.type, title: s.title, abstract: s.abstract, time: s.time, durationMinutes: s.duration || null }));
        try {
          const a = await stage('agenda', {
            conference: { title: conf.title, edition: conf.edition, tagline: conf.tagline, theme: theme ? theme.name : conf.themeName, compliance: !!(theme && theme.compliance), tracks: conf.tracks, keyTopics, city: conf.city, country: conf.country, region: conf.region, year, chairIds: conf.chairs, options: b.options },
            day: { number: i + 1, date: Engine.addDays(conf.start, i), weekday: Engine.weekday(Engine.addDays(conf.start, i)), label: day.label, kind, isFirstFull: fullIdx[0] === i, isLastFull: fullIdx[fullIdx.length - 1] === i, fixedEvents },
            speakers: roster, usedTitles: used.slice(),
          }, 'programme for day ' + (i + 1) + ' of ' + nDays);
          const validIds = new Set(roster.map((r) => r.id));
          const trackIds = new Set(conf.tracks.map((t) => t.id));
          const conv = (s) => { const out = { type: s.type, title: s.title, abstract: s.abstract || '', speakers: (s.speakerIds || []).filter((id) => validIds.has(id)), track: s.trackId && trackIds.has(s.trackId) ? s.trackId : null }; if (s.time) out.time = s.time; if (s.durationMinutes) out.duration = s.durationMinutes; return out; };
          const sessions = a.items.map((it) => (it.parallel && it.sessions.length > 1 ? { parallel: it.sessions.map(conv) } : conv(it.sessions[0]))).filter((s) => s && (s.parallel || s.title));
          if (sessions.length) conf.program[i] = { label: a.label || day.label, sessions };
          sessions.forEach((s) => (s.parallel ? s.parallel : [s]).forEach((x) => used.push(x.title)));
        } catch (err) { log('  ✗ day ' + (i + 1) + ' failed (' + err.message + '); keeping the planner’s day.', 'err'); tick(); }
      }

      // 3. Speaker biographies
      const sessionsFor = (id) => { const t = []; conf.program.forEach((d) => d.sessions.forEach((s) => (s.parallel ? s.parallel : [s]).forEach((x) => { if ((x.speakers || []).indexOf(id) >= 0) t.push(x.title); }))); return t; };
      for (let i = 0; i < conf.speakers.length; i += 8) {
        const batch = conf.speakers.slice(i, i + 8);
        try {
          const r = await stage('speakers', { conference: { title: conf.title, edition: conf.edition, theme: theme ? theme.name : conf.themeName }, speakers: batch.map((s) => ({ id: s.id, name: s.name, title: s.title, org: s.org, location: s.location || null, linkedin: s.linkedin || null, notes: (s.expertise || []).join(', '), sessions: sessionsFor(s.id) })) }, 'speaker biographies ' + (i + 1) + '–' + Math.min(i + 8, conf.speakers.length));
          r.speakers.forEach((out) => { const sp = conf.speakers.find((s) => s.id === out.id); if (!sp) return; sp.bio = out.bio; sp.bioDraft = true; if (out.expertise && out.expertise.length) sp.expertise = out.expertise; if (out.location && !sp.location) sp.location = out.location; });
        } catch (err) { log('  ✗ biographies failed (' + err.message + '); templated biographies will be used.', 'err'); tick(); }
      }

      // 4. Hotels, venue and partnership plan
      try {
        const p = await stage('partners', { brief: { city: conf.city, country: conf.country, region: conf.region, venue: b.venue ? { name: b.venue, address: b.venueAddress || null } : null, start: conf.start, end: conf.end, expected: conf.expected, currency: conf.registration.currency, theme: themeBrief ? { name: themeBrief.name, sponsorCategories: themeBrief.sponsorCategories } : null, audiences: conf.audiences } }, 'hotel candidates, venue and partnership plan');
        if (p.hotels && p.hotels.length) conf.hotels = p.hotels.map((h, i) => ({ name: h.name, category: h.category, stars: h.stars, distance: h.distance, rate: h.rateEstimate, cutoff: Engine.addDays(conf.start, i === 0 ? -30 : -21), description: h.description + (h.note ? ' ' + h.note : ''), amenities: h.amenities || [], proposed: true }));
        if (p.venueSuggestion && !b.venue) conf.venue = { name: p.venueSuggestion.name, address: p.venueSuggestion.address, description: p.venueSuggestion.description + ' (Proposed venue, subject to contract.)', rooms: [] };
        if (p.sponsorProspects && p.sponsorProspects.length) { conf.sponsorCategories = p.sponsorProspects.map((x) => x.category); conf.sponsorProspects = p.sponsorProspects; }
        if (p.travelNotes && p.travelNotes.length) { const seen = new Set((conf.faq || []).map((f) => f.q.toLowerCase())); conf.faq = (conf.faq || []).concat(p.travelNotes.filter((f) => !seen.has(f.q.toLowerCase()))); }
      } catch (err) { log('  ✗ partnership stage failed (' + err.message + '); keeping the planner’s hotel plan.', 'err'); tick(); }
    },

    /* Step 4: review & publish */
    step4() {
      const st = Generator.state;
      const c = st.result;
      if (!c) { html('#wizard', '<div class="panel"><div class="empty">Nothing to review yet. <button class="btn btn-primary mt-2" id="gen">Generate a conference</button></div></div>'); $('#gen').addEventListener('click', () => Generator.go(3)); return; }
      const theme = c.customTheme || MLS.THEMES.find((t) => t.id === c.themeId) || null;
      const sched = Engine.schedule(c, theme);
      const local = Store.localConferences().some((x) => x.id === c.id);
      const remote = Store.remoteConferences().some((x) => x.id === c.id);
      const reg = Engine.registrationState(c);
      const sp = Engine.sponsorship(c);
      const spk = (id) => (c.speakers || []).find((s) => s.id === id);
      const dayHtml = (d) => '<h4 class="mt-3">Day ' + d.number + ' · ' + esc(d.weekday) + ' ' + esc(Engine.formatDate(d.date)) + ' — ' + esc(d.label) + '</h4>' + d.slots.map((s) => s.parallel ? '<div class="mini-slot"><div class="t">' + esc(s.start) + '–' + esc(s.end) + '</div><div><div class="sub">Parallel sessions</div>' + s.parallel.map((x) => '<div class="mt-1"><strong>' + esc(x.title) + '</strong> <span class="badge">' + esc(Engine.TYPE_LABELS[x.type] || x.type) + '</span><div class="sub">' + esc((x.speakers || []).map((id) => (spk(id) || {}).name).filter(Boolean).join(', ') || 'Speakers to be announced') + (x.room ? ' · ' + esc(x.room) : '') + '</div></div>').join('') + '</div></div>' : '<div class="mini-slot"><div class="t">' + esc(s.start) + '–' + esc(s.end) + '</div><div>' + (s.auto ? '<span class="sub">' + esc(s.title) + '</span>' : '<strong>' + esc(s.title) + '</strong> <span class="badge">' + esc(Engine.TYPE_LABELS[s.type] || s.type) + '</span>' + (s.abstract ? '<div class="small muted">' + esc(s.abstract) + '</div>' : '') + '<div class="sub">' + esc((s.speakers || []).map((id) => (spk(id) || {}).name).filter(Boolean).join(', ') || (Engine.CONTENT_TYPES.indexOf(s.type) >= 0 && s.type !== 'networking' ? 'Speakers to be announced' : '')) + (s.room ? ' · ' + esc(s.room) : '') + '</div>') + '</div></div>').join('');
      html('#wizard',
        '<div class="panel"><div class="flex between wrap gap-2"><div><div class="flex wrap gap-1 mb-1"><span class="badge badge-accent">' + (st.aiUsed || c.aiAssisted ? 'AI-assisted plan' : 'Instant plan') + '</span>' + (theme ? '<span class="badge">' + esc(theme.name) + '</span>' : '') + (local ? '<span class="badge">Saved in this browser</span>' : '') + (remote ? '<span class="badge badge-ink">Published</span>' : '') + '</div><h2 class="mb-0">' + esc(c.title) + ' <span class="muted" style="font-weight:400">' + esc(c.edition) + '</span></h2><p class="muted mb-0">' + esc(fmtRange(c)) + ' · ' + esc(c.city) + ', ' + esc(c.country) + ' · ' + esc(c.venue.name) + '</p></div>' +
          '<div class="actions"><button class="btn btn-primary" id="save-local">' + (local ? 'Update draft in this browser' : 'Save draft to this browser') + '</button><button class="btn btn-ink" id="publish"' + (health.store && health.store.configured ? '' : ' disabled title="Connect a Vercel Blob store to publish for all visitors"') + '>' + (remote ? 'Republish to site' : 'Publish to site') + '</button><button class="btn btn-outline" id="export">Export JSON</button><button class="btn btn-ghost" id="restart">Start over</button></div></div>' +
          '<div id="publish-note" class="mt-2"></div>' +
          '<div class="kpi-row mt-3">' + [[sched.length, 'Days'], [Engine.countSessions(sched), 'Sessions'], [(c.speakers || []).length, 'Speakers'], [(c.tracks || []).length, 'Tracks']].map(([n, l]) => '<div class="kpi"><div class="num">' + n + '</div><div class="lbl">' + l + '</div></div>').join('') + '</div></div>' +
        '<div class="panel"><div class="preview-tabs" role="tablist">' + ['Overview', 'Programme', 'Speakers', 'Venue & hotels', 'Partnership', 'Registration', 'JSON'].map((t, i) => '<button role="tab" class="' + (i === 0 ? 'active' : '') + '" data-tab="' + i + '">' + t + '</button>').join('') + '</div>' +
          '<div class="preview-pane active" data-pane="0"><p class="lede">' + esc(c.tagline) + '</p><p class="muted">' + esc(c.summary) + '</p>' + (c.description || []).map((p) => '<p>' + esc(p) + '</p>').join('') + '<h4>Highlights</h4><ul class="list-check">' + (c.highlights || []).map((h) => '<li>' + esc(h) + '</li>').join('') + '</ul><h4>Tracks</h4><ul class="list-check">' + (c.tracks || []).map((t) => '<li><strong>' + esc(t.name) + '</strong>' + (t.description ? ' — ' + esc(t.description) : '') + '</li>').join('') + '</ul>' + (c.faq && c.faq.length ? '<h4>Practical information</h4>' + c.faq.map((f) => '<p class="small"><strong>' + esc(f.q) + '</strong><br>' + esc(f.a) + '</p>').join('') : '') + '</div>' +
          '<div class="preview-pane" data-pane="1">' + (sched.length ? sched.map(dayHtml).join('') : '<p class="muted">No programme.</p>') + '</div>' +
          '<div class="preview-pane" data-pane="2">' + ((c.speakers || []).length ? '<div class="grid grid-2">' + c.speakers.map((s) => '<div class="speaker-card" style="cursor:default">' + UI.avatar(s) + '<span><span class="name">' + esc(s.name) + '</span><span class="role" style="display:block">' + esc(s.title) + (s.org ? ', ' + esc(s.org) : '') + '</span>' + (s.linkedin ? '<a class="small" href="' + esc(s.linkedin) + '" target="_blank" rel="noopener">LinkedIn</a>' : '') + '<span class="small muted" style="display:block;margin-top:.35rem">' + esc(Engine.bioFor(s)) + (s.bioDraft ? ' <em>(draft, pending approval)</em>' : '') + '</span></span></div>').join('') + '</div>' : '<p class="muted">No speakers yet. Sessions show “Speakers to be announced” until you add them.</p>') + '</div>' +
          '<div class="preview-pane" data-pane="3"><h4>' + esc(c.venue.name) + '</h4><p class="muted">' + esc(c.venue.address) + '</p><p>' + esc(c.venue.description) + '</p><h4>Hotel plan</h4>' + (c.hotels || []).map((h) => '<div class="sub-card"><strong>' + esc(h.name) + '</strong> · ' + esc(h.category) + (h.proposed ? ' <span class="badge">Proposed</span>' : '') + '<div class="small muted">' + esc(h.rate) + ' · ' + esc(h.distance) + (h.cutoff ? ' · block cut-off ' + esc(Engine.formatDate(h.cutoff)) : '') + '</div><p class="small mb-0">' + esc(h.description) + '</p></div>').join('') + '</div>' +
          '<div class="preview-pane" data-pane="4"><p class="muted">Packages in ' + esc(sp.currency) + '. Confirmed sponsors are added after contracts are signed; the public prospectus shows availability.</p><div class="table-wrap"><table class="data"><thead><tr><th>Package</th><th>Price</th><th>Slots</th></tr></thead><tbody>' + sp.tiers.map((t) => '<tr><td>' + esc(t.name) + '</td><td>' + esc(Engine.formatMoney(t.price, sp.currency)) + '</td><td>' + t.slots + '</td></tr>').join('') + '</tbody></table></div>' + (c.sponsorCategories && c.sponsorCategories.length ? '<h4 class="mt-3">Prospect categories</h4><ul class="list-check">' + c.sponsorCategories.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '</div>' +
          '<div class="preview-pane" data-pane="5"><div class="table-wrap"><table class="data"><thead><tr><th>Pass</th><th>Until</th><th>Price</th></tr></thead><tbody>' + reg.tiers.map((t) => '<tr><td>' + esc(t.name) + '</td><td>' + (t.until ? esc(Engine.formatDate(t.until)) : '—') + '</td><td>' + esc(Engine.formatMoney(t.price, reg.currency)) + '</td></tr>').join('') + reg.special.map((s) => '<tr><td>' + esc(s.name) + '</td><td>—</td><td>' + esc(Engine.formatMoney(s.price, reg.currency)) + '</td></tr>').join('') + '</tbody></table></div><p class="small muted mt-2">' + esc(reg.groupDiscount) + '</p></div>' +
          '<div class="preview-pane" data-pane="6"><p class="muted small">Advanced: edit any field directly, then apply. Changes are validated before they replace the plan.</p><textarea class="json-editor" id="json">' + esc(JSON.stringify(c, null, 2)) + '</textarea><div class="btn-row mt-2"><button class="btn btn-outline" id="apply-json">Apply changes</button></div></div>' +
        '</div>');
      $$('[data-tab]').forEach((b) => b.addEventListener('click', () => { $$('[data-tab]').forEach((x) => x.classList.toggle('active', x === b)); $$('.preview-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === b.dataset.tab)); }));
      const links = () => '<div class="notice ok"><strong>Live pages:</strong> <a href="' + url('conference', c.id) + '" target="_blank" rel="noopener">Overview</a> · <a href="' + url('agenda', c.id) + '" target="_blank" rel="noopener">Programme</a> · <a href="' + url('register', c.id) + '" target="_blank" rel="noopener">Registration</a> · <a href="' + url('hotels', c.id) + '" target="_blank" rel="noopener">Hotels</a> · <a href="' + url('sponsor', c.id) + '" target="_blank" rel="noopener">Sponsorship</a>' + (c.speakers && c.speakers.length ? ' · <a href="' + url('speaker', c.speakers[0].id) + '" target="_blank" rel="noopener">First speaker page</a>' : '') + '</div>';
      $('#save-local').addEventListener('click', () => { Store.saveLocal(stripMeta(c)); UI.toast('Draft saved. Pages are live in this browser.'); html('#publish-note', links() + '<p class="small muted mt-1">Drafts are visible in this browser only. Publish to the site to make them visible to every visitor.</p>'); });
      $('#publish').addEventListener('click', async () => {
        const btn = $('#publish'); btn.disabled = true; btn.textContent = 'Publishing…';
        try { await Store.publishRemote(stripMeta(c)); Store.removeLocal(c.id); UI.toast('Published to the site.'); html('#publish-note', links() + '<p class="small muted mt-1">Published to the server store. Visitors see it within about a minute.</p>'); btn.textContent = 'Republish to site'; }
        catch (e) { html('#publish-note', '<div class="notice err">' + esc(e.message) + '</div>'); btn.textContent = 'Publish to site'; }
        btn.disabled = false;
      });
      $('#export').addEventListener('click', () => download(c.id + '.json', JSON.stringify(stripMeta(c), null, 2)));
      $('#restart').addEventListener('click', () => { if (!confirm('Start a new conference? The current result stays saved if you have saved the draft.')) return; Generator.state = defaultState(); if (!aiAvailable()) Generator.state.mode = 'instant'; Generator.save(); history.replaceState(null, '', location.pathname); Generator.render(); });
      $('#apply-json').addEventListener('click', () => { try { const next = Engine.sanitiseConference(JSON.parse($('#json').value)); Generator.state.result = next; Generator.save(); UI.toast('Changes applied.'); Generator.render(); } catch (e) { UI.toast('Invalid JSON: ' + e.message); } });
    },
  };

  document.addEventListener('DOMContentLoaded', async () => {
    UI.renderChrome('');
    await Store.ready;
    health = await Store.health();
    statusPills();
    if (health.admin && health.admin.protected) {
      if (!Store.adminToken()) return showGate();
      try { await Store.api('/api/submissions'); }
      catch (e) { if (e.status === 401) { Store.setAdminToken(''); return showGate('The saved passcode is no longer valid.'); } }
    }
    if (document.body.dataset.page === 'admin') Dashboard.init(); else Generator.init();
  });
})();
