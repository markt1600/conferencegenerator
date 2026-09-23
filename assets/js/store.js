/* Data layer: merges the seed dataset with conferences generated in the organiser console
 * (kept in this browser) and conferences published to the server store (Vercel Blob, when configured).
 * Also routes form submissions to the server with a local fallback. */
(function (root) {
  const MLS = root.MLS || (root.MLS = {});
  const Engine = root.Engine;
  const LS_CONFS = 'ooo.conferences.v1';
  const LS_SUBS = 'ooo.submissions.v1';
  const LS_ADMIN = 'ooo.admin.token';

  const state = { remote: [], remoteConfigured: null, local: [], scheduleCache: new Map(), loaded: false, health: null };

  function readLS(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
  }
  function writeLS(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  }

  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = opts.token || Store.adminToken();
    if (token) headers['x-admin-token'] = token;
    const res = await fetch(path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) {
      const err = new Error((data && (data.error || data.message)) || ('Request failed (' + res.status + ')'));
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  const Store = {
    ready: null,
    api,
    adminToken() { try { return sessionStorage.getItem(LS_ADMIN) || ''; } catch (_) { return ''; } },
    setAdminToken(t) { try { if (t) sessionStorage.setItem(LS_ADMIN, t); else sessionStorage.removeItem(LS_ADMIN); } catch (_) {} },

    async init() {
      state.local = readLS(LS_CONFS, []);
      if (typeof fetch === 'function' && location.protocol !== 'file:') {
        try {
          const data = await api('/api/conferences');
          state.remoteConfigured = !!(data && data.configured);
          state.remote = (data && Array.isArray(data.conferences)) ? data.conferences : [];
        } catch (_) {
          state.remoteConfigured = false;
          state.remote = [];
        }
      }
      state.loaded = true;
      return Store;
    },

    remoteConfigured() { return state.remoteConfigured; },

    theme(conf) {
      if (!conf) return null;
      if (conf.customTheme) return conf.customTheme;
      return (MLS.THEMES || []).find((t) => t.id === conf.themeId) || null;
    },

    decorate(conf, source) {
      const c = conf;
      c._source = source;
      c._status = Engine.status(c, MLS.NOW);
      c._theme = Store.theme(c);
      return c;
    },

    conferences() {
      const map = new Map();
      (MLS.CONFERENCES || []).forEach((c) => map.set(c.id, Store.decorate(c, 'seed')));
      state.remote.forEach((c) => { try { map.set(c.id, Store.decorate(c, 'remote')); } catch (_) {} });
      state.local.forEach((c) => { try { map.set(c.id, Store.decorate(c, 'local')); } catch (_) {} });
      return Array.from(map.values());
    },

    get(id) { return Store.conferences().find((c) => c.id === id) || null; },

    upcoming() {
      return Store.conferences().filter((c) => c._status === 'upcoming' || c._status === 'live' || c._status === 'announced').sort((a, b) => a.start.localeCompare(b.start));
    },
    past() {
      return Store.conferences().filter((c) => c._status === 'past').sort((a, b) => b.start.localeCompare(a.start));
    },
    featured() {
      const up = Store.upcoming();
      return up.find((c) => c.featured) || up.find((c) => c._status === 'live') || up.find((c) => c._status === 'upcoming' && c.registration && c.registration.open) || up[0] || null;
    },

    schedule(conf) {
      const key = conf.id + ':' + (conf.updatedAt || conf.createdAt || '') + ':' + (conf._source || '');
      if (!state.scheduleCache.has(key)) state.scheduleCache.set(key, Engine.schedule(conf, Store.theme(conf)));
      return state.scheduleCache.get(key);
    },

    speakerMap() {
      const map = new Map();
      (MLS.SPEAKERS || []).forEach((s) => map.set(s.id, Object.assign({}, s, { _source: 'seed' })));
      Store.conferences().forEach((c) => {
        (c.speakers || []).forEach((s) => { if (s && s.id && !map.has(s.id)) map.set(s.id, Object.assign({}, s, { _source: c._source, _conferenceId: c.id })); });
      });
      return map;
    },

    speaker(id) { return Store.speakerMap().get(id) || null; },

    speakers() {
      const list = Array.from(Store.speakerMap().values());
      const counts = new Map();
      Store.conferences().forEach((c) => Engine.allSpeakerIds(c).forEach((id) => counts.set(id, (counts.get(id) || 0) + 1)));
      list.forEach((s) => { s._appearances = counts.get(s.id) || 0; });
      return list.sort((a, b) => (b.featured === a.featured ? (b._appearances - a._appearances) || a.name.localeCompare(b.name) : (b.featured ? 1 : -1)));
    },

    speakersFor(conf) {
      const map = Store.speakerMap();
      const ids = Engine.allSpeakerIds(conf);
      const chairs = conf.chairs || [];
      const out = ids.map((id) => map.get(id)).filter(Boolean);
      return out.sort((a, b) => {
        const ca = chairs.indexOf(a.id), cb = chairs.indexOf(b.id);
        if (ca >= 0 || cb >= 0) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
        return a.name.localeCompare(b.name);
      });
    },

    appearances(speakerId) {
      const out = [];
      Store.conferences().forEach((c) => {
        const sched = Store.schedule(c);
        const sessions = [];
        sched.forEach((d) => d.flat.forEach((s) => { if ((s.speakers || []).indexOf(speakerId) >= 0) sessions.push(Object.assign({}, s, { date: d.date, dayLabel: d.label })); }));
        const isChair = (c.chairs || []).indexOf(speakerId) >= 0;
        if (sessions.length || isChair) out.push({ conf: c, sessions, isChair });
      });
      return out.sort((a, b) => b.conf.start.localeCompare(a.conf.start));
    },

    /* ---- Local (browser) conferences ---- */
    localConferences() { return state.local.slice(); },
    saveLocal(conf) {
      conf.updatedAt = new Date().toISOString();
      const idx = state.local.findIndex((c) => c.id === conf.id);
      if (idx >= 0) state.local[idx] = conf; else state.local.push(conf);
      writeLS(LS_CONFS, state.local);
      state.scheduleCache.clear();
      return conf;
    },
    removeLocal(id) {
      state.local = state.local.filter((c) => c.id !== id);
      writeLS(LS_CONFS, state.local);
      state.scheduleCache.clear();
    },

    /* ---- Remote (server store) conferences ---- */
    remoteConferences() { return state.remote.slice(); },
    async publishRemote(conf, token) {
      const data = await api('/api/conferences', { method: 'POST', body: { conference: conf }, token });
      if (data && data.conference) {
        const idx = state.remote.findIndex((c) => c.id === data.conference.id);
        if (idx >= 0) state.remote[idx] = data.conference; else state.remote.push(data.conference);
        state.scheduleCache.clear();
      }
      return data;
    },
    async deleteRemote(id, token) {
      const data = await api('/api/conferences?id=' + encodeURIComponent(id), { method: 'DELETE', token });
      state.remote = state.remote.filter((c) => c.id !== id);
      state.scheduleCache.clear();
      return data;
    },

    /* ---- Form submissions ---- */
    async submit(kind, data) {
      const record = { id: 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), kind, data, createdAt: new Date().toISOString(), page: location.pathname };
      let stored = 'local';
      if (typeof fetch === 'function' && location.protocol !== 'file:') {
        try {
          const res = await api('/api/submissions', { method: 'POST', body: record });
          if (res && res.stored === 'server') stored = 'server';
        } catch (_) { /* fall back to local */ }
      }
      if (stored === 'local') {
        const subs = readLS(LS_SUBS, []);
        subs.unshift(record);
        writeLS(LS_SUBS, subs.slice(0, 500));
      }
      return { ok: true, stored, record };
    },
    localSubmissions() { return readLS(LS_SUBS, []); },
    clearLocalSubmissions() { writeLS(LS_SUBS, []); },
    async remoteSubmissions(token) {
      const data = await api('/api/submissions', { token });
      return data;
    },

    async health() {
      if (state.health) return state.health;
      try { state.health = await api('/api/health'); } catch (_) { state.health = { ok: false, ai: { configured: false }, store: { configured: false }, admin: { protected: false }, offline: true }; }
      return state.health;
    },
  };

  Store.ready = Store.init();
  root.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
