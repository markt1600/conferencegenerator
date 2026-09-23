/* Shared UI: chrome (header/footer), theme toggle, routing helpers and component renderers. */
(function (root) {
  const MLS = root.MLS || (root.MLS = {});
  const Engine = root.Engine;

  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const ROUTES = {
    home: () => '/',
    conferences: () => '/conferences',
    conference: (id) => '/conferences/' + encodeURIComponent(id),
    agenda: (id) => '/conferences/' + encodeURIComponent(id) + '/agenda',
    register: (id) => '/conferences/' + encodeURIComponent(id) + '/register',
    hotels: (id) => '/conferences/' + encodeURIComponent(id) + '/hotels',
    sponsor: (id) => '/conferences/' + encodeURIComponent(id) + '/sponsor',
    speakers: () => '/speakers',
    speaker: (id) => '/speakers/' + encodeURIComponent(id),
    sponsors: () => '/sponsors',
    about: () => '/about',
    contact: () => '/contact',
    admin: () => '/admin',
    generator: () => '/admin/generator',
  };

  function url(type, id) { return (ROUTES[type] || (() => '/'))(id); }

  function routeId() {
    const q = new URLSearchParams(location.search).get('id');
    if (q) return q;
    const m = /^\/(?:conferences|speakers)\/([^/]+)/.exec(location.pathname);
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* ---------- Theme ---------- */
  const THEME_KEY = 'ooo.theme';
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    document.querySelectorAll('.theme-toggle').forEach((b) => { b.setAttribute('aria-label', 'Switch to ' + (effectiveTheme() === 'dark' ? 'light' : 'dark') + ' theme'); b.innerHTML = themeIcon(); });
  }
  function storedTheme() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (_) { return 'auto'; } }
  function effectiveTheme() {
    const t = storedTheme();
    if (t === 'light' || t === 'dark') return t;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function toggleTheme() {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    applyTheme(next);
  }
  function themeIcon() {
    return effectiveTheme() === 'dark'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  }

  /* ---------- Logo ---------- */
  function logoMark(cls) {
    return '<svg class="brand-mark ' + (cls || '') + '" viewBox="0 0 60 40" aria-hidden="true"><circle cx="14" cy="20" r="11"/><circle cx="30" cy="20" r="11"/><circle cx="46" cy="20" r="11"/></svg>';
  }

  /* ---------- Chrome ---------- */
  const NAV = [
    ['conferences', 'Conferences'],
    ['speakers', 'Speakers'],
    ['sponsors', 'Sponsorship'],
    ['about', 'About OOO'],
    ['contact', 'Contact'],
  ];

  function renderChrome(active) {
    const org = MLS.ORG;
    const header = document.querySelector('[data-site-header]');
    if (header) {
      header.className = 'site-header';
      header.innerHTML =
        '<div class="container bar">' +
          '<a class="brand" href="' + url('home') + '" aria-label="' + esc(org.name) + ' home">' + logoMark() +
            '<span><span class="brand-word">OOO</span><span class="brand-sub">Orient Occidental Organisers</span></span></a>' +
          '<nav class="nav" aria-label="Primary">' + NAV.map(([k, label]) => '<a href="' + url(k) + '"' + (active === k ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') + '</nav>' +
          '<div class="header-actions">' +
            '<button class="theme-toggle" type="button" aria-label="Toggle theme">' + themeIcon() + '</button>' +
            '<a class="btn btn-primary btn-sm" href="' + url('conferences') + '#upcoming">Upcoming events</a>' +
            '<button class="nav-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-nav"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>' +
          '</div>' +
        '</div>' +
        '<div class="mobile-nav" id="mobile-nav">' + NAV.map(([k, label]) => '<a href="' + url(k) + '">' + label + '</a>').join('') + '<a href="' + url('admin') + '">Organiser console</a></div>';
      header.querySelector('.nav-toggle').addEventListener('click', (e) => {
        const nav = header.querySelector('.mobile-nav');
        const open = nav.classList.toggle('open');
        e.currentTarget.setAttribute('aria-expanded', String(open));
      });
      header.querySelector('.theme-toggle').addEventListener('click', toggleTheme);
    }
    const footer = document.querySelector('[data-site-footer]');
    if (footer) {
      footer.className = 'site-footer';
      const year = new Date().getFullYear();
      footer.innerHTML =
        '<div class="container">' +
          '<div class="cols">' +
            '<div>' +
              '<a class="brand" href="' + url('home') + '">' + logoMark() + '<span><span class="brand-word">OOO</span><span class="brand-sub">Orient Occidental Organisers Pte Ltd</span></span></a>' +
              '<p class="mt-2" style="max-width:38ch">' + esc(org.tagline) + ' Independent legal conferences convening regulators, in-house counsel and private practice across five continents since ' + org.founded + '.</p>' +
              '<form class="newsletter" data-form="newsletter" novalidate><label class="sr-only" for="nl-email">Email address</label><input id="nl-email" name="email" type="email" placeholder="Email for programme announcements" required><button class="btn btn-primary" type="submit">Subscribe</button></form>' +
              '<p class="small mt-1" data-form-note style="color:rgba(255,255,255,0.6)">One email a month. Unsubscribe at any time.</p>' +
            '</div>' +
            '<div><h4>Programmes</h4><ul>' +
              '<li><a href="' + url('conferences') + '#upcoming">Upcoming conferences</a></li>' +
              '<li><a href="' + url('conferences') + '#past">Past conferences</a></li>' +
              '<li><a href="' + url('speakers') + '">Speaker faculty</a></li>' +
              '<li><a href="' + url('sponsors') + '">Sponsorship</a></li>' +
              '<li><a href="' + url('contact') + '#speak">Propose a session</a></li>' +
            '</ul></div>' +
            '<div><h4>Company</h4><ul>' +
              '<li><a href="' + url('about') + '">About OOO</a></li>' +
              '<li><a href="' + url('about') + '#team">Leadership team</a></li>' +
              '<li><a href="' + url('about') + '#advisory">Advisory board</a></li>' +
              '<li><a href="' + url('contact') + '">Contact</a></li>' +
              '<li><a href="' + url('admin') + '">Organiser console</a></li>' +
            '</ul></div>' +
            '<div><h4>Offices</h4><ul>' + org.offices.map((o) => '<li><strong>' + esc(o.city) + '</strong><br><span class="small">' + esc(o.address) + '</span></li>').join('') + '</ul></div>' +
          '</div>' +
          '<div class="legal"><span>© ' + year + ' ' + esc(org.legalName) + '. Registered in Singapore. ' + esc(org.domain) + '</span><span><a href="' + url('contact') + '">Privacy</a> · <a href="' + url('contact') + '">Terms of participation</a> · <a href="' + url('contact') + '#press">Press</a></span></div>' +
        '</div>';
      const nl = footer.querySelector('[data-form="newsletter"]');
      if (nl) bindForm(nl, 'newsletter', { successHtml: '<p class="small" style="color:#fff">Thank you. You are on the list for programme announcements.</p>' });
    }
    applyTheme(storedTheme());
  }

  function setMeta(title, description) {
    document.title = title ? title + ' · OOO' : 'OOO — Orient Occidental Organisers';
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'description'); document.head.appendChild(m); }
    if (description) m.setAttribute('content', description);
  }

  /* ---------- Components ---------- */
  const AV_COLORS = ['#1F3A5F', '#5B2A86', '#0F5B5B', '#8B1E3F', '#7A4A0F', '#2F5D3A', '#3A506B', '#6B2C39', '#0B6E99', '#4A3728', '#334E68', '#3D4F1F'];
  function initials(name) {
    const parts = String(name || '').replace(/\b(Dr|Prof|Sir|Dame|Mr|Ms|Mrs)\.?\s+/g, '').replace(/\s+(SC|KC|QC)$/g, '').split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function avatar(sp, size) {
    const color = AV_COLORS[Engine.hash(sp.id || sp.name || 'x') % AV_COLORS.length];
    return '<span class="avatar ' + (size || '') + '" style="--av:' + color + '" aria-hidden="true">' + esc(initials(sp.name)) + '</span>';
  }

  function speakerCard(sp, opts) {
    opts = opts || {};
    const note = opts.note || (sp.proposed ? 'Invited · confirmation pending' : '');
    return '<a class="speaker-card" href="' + url('speaker', sp.id) + '">' + avatar(sp) +
      '<span><span class="name">' + esc(sp.name) + '</span>' +
      '<span class="role" style="display:block">' + esc(sp.title) + '</span>' +
      '<span class="org" style="display:block">' + esc(sp.org) + '</span>' +
      (note ? '<span class="small muted" style="display:block;margin-top:.35rem">' + esc(note) + '</span>' : '') +
      '</span></a>';
  }

  function speakerChip(sp) {
    if (!sp) return '';
    return '<a class="speaker-chip" href="' + url('speaker', sp.id) + '">' + avatar(sp, 'sm') + '<span>' + esc(sp.name) + '</span></a>';
  }

  function statusBadge(conf) {
    const st = conf._status || Engine.status(conf, MLS.NOW);
    if (st === 'live') return '<span class="badge badge-live">Happening now</span>';
    if (st === 'upcoming') return '<span class="badge badge-outline-light">Registration open</span>';
    if (st === 'announced') return '<span class="badge badge-outline-light">Announced</span>';
    return '<span class="badge badge-outline-light">Past event</span>';
  }

  function complianceBadge(conf) {
    const t = conf._theme;
    return t && t.compliance ? '<span class="badge badge-compliance">Compliance</span>' : '';
  }

  function confCard(conf, opts) {
    opts = opts || {};
    const pal = conf.palette || ['#1B2A44', '#0F1B2D'];
    const st = conf._status || Engine.status(conf, MLS.NOW);
    const meta = [Engine.formatRange(conf.start, conf.end), conf.venue && conf.venue.name].filter(Boolean);
    const stats = conf.stats;
    const foot = st === 'past'
      ? (stats ? '<span class="muted">' + stats.attendees + ' delegates · ' + stats.countries + ' countries</span>' : '<span class="muted">Programme archive</span>')
      : (conf.registration && conf.registration.open ? '<span class="muted">Registration open</span>' : '<span class="muted">' + (conf.cfp && conf.cfp.open ? 'Call for speakers open' : 'Programme to be announced') + '</span>');
    return '<article class="card conf-card"><a class="card-link" href="' + url('conference', conf.id) + '">' +
      '<div class="conf-art" style="--art-a:' + pal[0] + ';--art-b:' + pal[1] + '"><span class="ring"></span>' +
        '<div class="badges">' + statusBadge(conf) + (conf._theme && conf._theme.compliance ? '<span class="badge badge-outline-light">Compliance</span>' : '') + '</div>' +
        '<div class="city">' + esc(conf.city) + '</div><div class="dates">' + esc(Engine.formatRange(conf.start, conf.end)) + '</div>' +
      '</div>' +
      '<div class="card-body"><div class="conf-meta">' + (conf._theme ? '<span>' + esc(conf._theme.name) + '</span>' : '') + '</div>' +
        '<h3>' + esc(conf.title) + (conf.edition ? ' <span class="muted" style="font-weight:400">— ' + esc(conf.edition) + '</span>' : '') + '</h3>' +
        '<p class="summary">' + esc(conf.summary || conf.tagline) + '</p></div>' +
      '<div class="conf-foot">' + foot + '<span class="more">View programme →</span></div>' +
    '</a></article>';
  }

  function trackPill(conf, trackId) {
    if (!trackId) return '';
    const idx = (conf.tracks || []).findIndex((t) => t.id === trackId);
    const tr = idx >= 0 ? conf.tracks[idx] : null;
    return '<span class="track-pill t' + (idx >= 0 ? idx % 5 : 0) + '">' + esc(tr ? tr.name : trackId) + '</span>';
  }

  function typeBadge(type) {
    return '<span class="badge">' + esc(Engine.TYPE_LABELS[type] || type) + '</span>';
  }

  function money(n, cur) { return Engine.formatMoney(n, cur); }

  function countdown(el, dateStr, timeStr) {
    if (!el) return;
    const target = new Date(dateStr + 'T' + (timeStr || '08:00:00') + 'Z').getTime();
    const tick = () => {
      let diff = Math.max(0, target - Date.now());
      const d = Math.floor(diff / 86400000); diff -= d * 86400000;
      const h = Math.floor(diff / 3600000); diff -= h * 3600000;
      const m = Math.floor(diff / 60000); diff -= m * 60000;
      const s = Math.floor(diff / 1000);
      el.innerHTML = [[d, 'days'], [h, 'hours'], [m, 'minutes'], [s, 'seconds']].map(([n, l]) => '<div><div class="n">' + n + '</div><div class="l">' + l + '</div></div>').join('');
    };
    tick();
    setInterval(tick, 1000);
  }

  let toastTimer = null;
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* ---------- Forms ---------- */
  function bindForm(form, kind, opts) {
    opts = opts || {};
    form.setAttribute('novalidate', '');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let valid = true;
      form.querySelectorAll('input, select, textarea').forEach((input) => {
        const field = input.closest('.field') || input.parentElement;
        const ok = input.checkValidity();
        if (field && field.classList) field.classList.toggle('invalid', !ok);
        if (!ok) valid = false;
      });
      if (!valid) {
        const first = form.querySelector('.invalid input, .invalid select, .invalid textarea, :invalid');
        if (first) first.focus();
        return;
      }
      const data = {};
      new FormData(form).forEach((v, k) => { if (data[k] !== undefined) data[k] = [].concat(data[k], v); else data[k] = v; });
      if (opts.extra) Object.assign(data, typeof opts.extra === 'function' ? opts.extra() : opts.extra);
      const btn = form.querySelector('[type="submit"]');
      const label = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      try {
        const res = await root.Store.submit(kind, data);
        const success = document.createElement('div');
        success.className = 'form-success';
        success.setAttribute('role', 'status');
        success.innerHTML = opts.successHtml || ('<h3>Thank you</h3><p>' + esc(opts.successText || 'Your message has been received. A member of the OOO team will reply within one working day.') + '</p><p class="small muted mb-0">Reference ' + esc(res.record.id.toUpperCase()) + (res.stored === 'local' ? ' · saved locally in this browser (no server store configured)' : '') + '</p>');
        form.replaceWith(success);
        if (opts.onSuccess) opts.onSuccess(res);
      } catch (err) {
        toast('Something went wrong. Please try again.');
        if (btn) { btn.disabled = false; btn.textContent = label; }
      }
    });
    form.querySelectorAll('input, select, textarea').forEach((input) => {
      input.addEventListener('input', () => { const f = input.closest('.field'); if (f) f.classList.remove('invalid'); });
    });
  }

  function field(opts) {
    const id = opts.id || opts.name;
    const req = opts.required ? ' required' : '';
    let control;
    if (opts.type === 'textarea') control = '<textarea id="' + id + '" name="' + opts.name + '"' + req + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + '>' + esc(opts.value || '') + '</textarea>';
    else if (opts.type === 'select') control = '<select id="' + id + '" name="' + opts.name + '"' + req + '>' + (opts.options || []).map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(v) + '"' + (opts.value === v ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>';
    else control = '<input id="' + id + '" name="' + opts.name + '" type="' + (opts.type || 'text') + '"' + req + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + (opts.value !== undefined ? ' value="' + esc(opts.value) + '"' : '') + (opts.attrs || '') + '>';
    return '<div class="field"><label for="' + id + '">' + esc(opts.label) + (opts.required ? '' : ' <span class="muted" style="font-weight:400">(optional)</span>') + '</label>' + control + (opts.hint ? '<span class="hint">' + esc(opts.hint) + '</span>' : '') + '<span class="error">' + esc(opts.error || 'Please complete this field.') + '</span></div>';
  }

  function heroStyle(conf) {
    const pal = conf.palette || ['#1B2A44', '#0F1B2D'];
    return 'style="--hero-a:' + pal[0] + ';--hero-b:' + pal[1] + '"';
  }

  function subnav(conf, active) {
    const items = [
      ['conference', 'Overview'], ['agenda', 'Programme'], ['speakers', 'Speakers'], ['venue', 'Venue & hotels'], ['sponsorship', 'Partners'], ['register', 'Register'],
    ];
    const hrefFor = (k) => {
      if (k === 'agenda') return url('agenda', conf.id);
      if (k === 'register') return url('register', conf.id);
      if (k === 'venue') return url('hotels', conf.id);
      if (k === 'sponsorship') return url('sponsor', conf.id);
      if (k === 'speakers') return url('conference', conf.id) + '#speakers';
      return url('conference', conf.id);
    };
    return '<div class="subnav"><div class="container row">' + items.map(([k, l]) => '<a href="' + hrefFor(k) + '"' + (active === k ? ' class="active" aria-current="page"' : '') + '>' + l + '</a>').join('') + '</div></div>';
  }

  root.UI = { esc, url, routeId, renderChrome, setMeta, avatar, initials, speakerCard, speakerChip, statusBadge, complianceBadge, confCard, trackPill, typeBadge, money, countdown, toast, bindForm, field, heroStyle, subnav, logoMark, toggleTheme, effectiveTheme, applyTheme };
})(typeof window !== 'undefined' ? window : globalThis);
