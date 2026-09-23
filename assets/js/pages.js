/* Page renderers for the public site. Each page's <body data-page="…"> selects a renderer. */
(function () {
  const { esc, url } = UI;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const html = (sel, markup) => { const el = $(sel); if (el) el.innerHTML = markup; return el; };
  const fmtRange = (c) => Engine.formatRange(c.start, c.end);
  const andList = (items) => items.length <= 1 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  const NAV_FOR = { home: 'home', conferences: 'conferences', conference: 'conferences', agenda: 'conferences', hotels: 'conferences', register: 'conferences', sponsor: 'conferences', speakers: 'speakers', speaker: 'speakers', sponsors: 'sponsors', about: 'about', contact: 'contact' };

  function heroMeta(c) {
    const items = [
      ['Dates', fmtRange(c.start ? c : { start: '' }) || fmtRange(c)],
      ['Location', (c.venue && c.venue.name ? c.venue.name + ', ' : '') + c.city],
      ['Format', c.format || 'In person'],
      [c._status === 'past' ? 'Attendance' : 'Expected', c._status === 'past' && c.stats ? c.stats.attendees + ' delegates from ' + c.stats.countries + ' countries' : (c.expected ? c.expected + ' delegates' : 'To be announced')],
    ];
    return '<div class="meta">' + items.map(([k, v]) => '<div><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>').join('') + '</div>';
  }

  function confHero(c, opts) {
    opts = opts || {};
    const st = c._status;
    const badges = UI.statusBadge(c) + (c._theme ? '<span class="badge badge-outline-light">' + esc(c._theme.name) + '</span>' : '') + (c._theme && c._theme.compliance ? '<span class="badge badge-outline-light">Compliance programme</span>' : '') + (c._source !== 'seed' ? '<span class="badge badge-outline-light">' + (c._source === 'local' ? 'Draft in this browser' : 'Published from console') + '</span>' : '');
    const actions = st === 'past'
      ? '<a class="btn btn-light" href="' + url('agenda', c.id) + '">View the programme</a><a class="btn btn-outline-light" href="' + url('conference', c.id) + '#recap">Read the recap</a>'
      : (c.registration && c.registration.open
        ? '<a class="btn btn-light" href="' + url('register', c.id) + '">Register now</a><a class="btn btn-outline-light" href="' + url('agenda', c.id) + '">Full programme</a><a class="btn btn-outline-light" href="' + url('sponsor', c.id) + '">Sponsorship</a>'
        : '<a class="btn btn-light" href="' + url('register', c.id) + '">Register your interest</a>' + (c.cfp && c.cfp.open ? '<a class="btn btn-outline-light" href="' + url('contact') + '#speak">Propose a session</a>' : '') + '<a class="btn btn-outline-light" href="' + url('sponsor', c.id) + '">Sponsorship</a>');
    return '<section class="page-hero themed" ' + UI.heroStyle(c) + '><div class="container">' +
      '<div class="crumbs"><a href="' + url('home') + '">Home</a> / <a href="' + url('conferences') + '">Conferences</a> / ' + esc(c.title) + (opts.crumb ? ' / ' + esc(opts.crumb) : '') + '</div>' +
      '<div class="flex wrap gap-1 mb-2">' + badges + '</div>' +
      '<h1>' + esc(opts.title || c.title) + (opts.title ? '' : (c.edition ? ' <span style="opacity:.75;font-weight:400">' + esc(c.edition) + '</span>' : '')) + '</h1>' +
      '<p class="lede">' + esc(opts.lede || c.tagline) + '</p>' +
      heroMeta(c) +
      '<div class="btn-row">' + (opts.actions !== undefined ? opts.actions : actions) + '</div>' +
      '</div></section>' + UI.subnav(c, opts.active || 'conference');
  }

  function notFound(what) {
    html('#app', '<section class="section"><div class="container"><div class="empty"><h2>' + esc(what || 'Page') + ' not found</h2><p>The link may be out of date. <a href="' + url('conferences') + '">Browse all conferences</a> or <a href="' + url('home') + '">return home</a>.</p></div></div></section>');
  }

  function loadConf() {
    const id = UI.routeId();
    const c = id && Store.get(id);
    if (!c) { notFound('Conference'); return null; }
    return c;
  }

  function slotMarkup(c, s, opts) {
    opts = opts || {};
    const speakers = (s.speakers || []).map((id) => Store.speaker(id)).filter(Boolean);
    const isAuto = s.auto || ['break', 'lunch', 'registration'].indexOf(s.type) >= 0;
    const evening = Engine.EVENING_TYPES.indexOf(s.type) >= 0;
    return '<div class="slot' + (isAuto ? ' auto' : '') + (evening ? ' evening' : '') + '">' +
      '<div class="time">' + esc(s.start) + '<span class="end">to ' + esc(s.end) + '</span></div>' +
      '<div>' + (isAuto ? '<h4>' + esc(s.title) + '</h4>' :
        '<div class="type-row">' + UI.typeBadge(s.type) + UI.trackPill(c, s.track) + (s.filled ? '' : '') + '</div>' +
        '<h4>' + esc(s.title) + '</h4>' +
        (s.abstract ? '<p class="abstract">' + esc(s.abstract) + '</p>' : '') +
        (speakers.length ? '<div class="speaker-list">' + speakers.map(UI.speakerChip).join('') + '</div>' : (Engine.CONTENT_TYPES.indexOf(s.type) >= 0 && s.type !== 'networking' ? '<p class="small muted mb-0">Speakers to be announced</p>' : '')) +
        (s.room && !opts.noRoom ? '<div class="room mt-1">' + esc(s.room) + '</div>' : '')) +
      '</div></div>';
  }

  function parallelMarkup(c, block) {
    return '<div class="slot"><div class="time">' + esc(block.start) + '<span class="end">to ' + esc(block.end) + '</span></div>' +
      '<div><div class="type-row"><span class="badge badge-accent">Parallel sessions</span></div>' +
      '<div class="parallel" style="--cols:' + Math.min(3, block.parallel.length) + '">' + block.parallel.map((s) => {
        const speakers = (s.speakers || []).map((id) => Store.speaker(id)).filter(Boolean);
        return '<div class="psession"><div class="type-row">' + UI.typeBadge(s.type) + UI.trackPill(c, s.track) + '</div><h4>' + esc(s.title) + '</h4>' +
          (s.abstract ? '<p class="abstract">' + esc(s.abstract) + '</p>' : '') +
          (speakers.length ? '<div class="speaker-list">' + speakers.map(UI.speakerChip).join('') + '</div>' : '<p class="small muted mb-0">Speakers to be announced</p>') +
          (s.room ? '<div class="room mt-1">' + esc(s.room) + '</div>' : '') + '</div>';
      }).join('') + '</div></div></div>';
  }

  function dayMarkup(c, day) {
    return day.slots.map((s) => (s.parallel ? parallelMarkup(c, s) : slotMarkup(c, s))).join('');
  }

  function sponsorsByTier(sponsors) {
    const order = ['Platinum', 'Gold', 'Silver', 'Gala dinner host', 'Masterclass partner', 'Knowledge partner', 'Supporting organisation', 'Media partner', 'Exhibitor'];
    const groups = new Map();
    (sponsors || []).forEach((s) => { const k = s.tier || 'Partner'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
    return Array.from(groups.entries()).sort((a, b) => { const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
  }

  function sponsorGrid(sponsors, opts) {
    opts = opts || {};
    if (!sponsors || !sponsors.length) return '<div class="empty"><p class="mb-1"><strong>Founding partners to be announced.</strong></p><p class="mb-0">Partnership packages are available now. <a href="' + (opts.enquireHref || url('sponsors')) + '">Enquire about partnership</a>.</p></div>';
    return sponsorsByTier(sponsors).map(([tier, list]) => {
      const big = tier === 'Platinum' || tier === 'Gold';
      return '<div class="sponsor-tier-block"><h3>' + esc(tier) + (list.length > 1 ? ' partners' : (tier.indexOf('partner') >= 0 || tier.indexOf('host') >= 0 || tier === 'Exhibitor' || tier === 'Supporting organisation' ? '' : ' partner')) + '</h3><div class="logo-grid' + (big ? ' big' : '') + '">' +
        list.map((s) => '<div class="logo-card' + (big ? ' big' : '') + '"><div class="wordmark">' + esc(s.name) + '</div><div class="industry">' + esc(s.industry || '') + '</div>' + (big && s.blurb ? '<p class="blurb">' + esc(s.blurb) + '</p>' : '') + '</div>').join('') + '</div></div>';
    }).join('');
  }

  function icsFor(c) {
    const dt = (d) => d.replace(/-/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OOO//Conferences//EN', 'BEGIN:VEVENT', 'UID:' + c.id + '@ooo.sg', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'), 'DTSTART;VALUE=DATE:' + dt(c.start), 'DTEND;VALUE=DATE:' + dt(Engine.addDays(c.end || c.start, 1)), 'SUMMARY:' + (c.title + (c.edition ? ' — ' + c.edition : '')).replace(/,/g, '\\,'), 'LOCATION:' + ((c.venue && c.venue.name ? c.venue.name + ', ' : '') + c.city + ', ' + c.country).replace(/,/g, '\\,'), 'URL:' + location.origin + url('conference', c.id), 'DESCRIPTION:' + String(c.tagline || '').replace(/,/g, '\\,'), 'END:VEVENT', 'END:VCALENDAR'];
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'));
  }

  const Pages = {};

  /* ------------------------------------------------------------------ */
  Pages.home = function () {
    const featured = Store.featured();
    const upcoming = Store.upcoming().filter((c) => !featured || c.id !== featured.id);
    const past = Store.past();
    UI.setMeta('Legal conferences that convene the profession', 'OOO runs independent legal and compliance conferences across five continents. Next: the Legal Fintech Summit, Bali, 25–29 October 2026.');

    if (featured) {
      const c = featured;
      const reg = Engine.registrationState(c, MLS.NOW);
      const sched = Store.schedule(c);
      const speakers = Store.speakersFor(c);
      const chairs = (c.chairs || []).map((id) => Store.speaker(id)).filter(Boolean);
      const days = Engine.daysUntil(c, MLS.NOW);
      const partners = (c.sponsors || []).filter((s) => ['Platinum', 'Gold'].indexOf(s.tier) >= 0).slice(0, 4);
      const includes = (reg.includes || []).slice(0, 3);
      html('#hero', '<section class="hero-xl" ' + UI.heroStyle(c) + '>' +
        '<div class="aurora"></div><div class="grain"></div><div class="orb a"></div><div class="orb b"></div>' +
        '<svg class="rings" viewBox="0 0 400 400" aria-hidden="true"><circle cx="140" cy="200" r="120"/><circle cx="200" cy="200" r="120"/><circle cx="260" cy="200" r="120"/></svg>' +
        '<div class="container hero-inner"><div>' +
          '<div class="pill-row">' + (c._status === 'live' ? '<span class="pill-glass"><span class="dot"></span>Happening now</span>' : (reg.open ? '<span class="pill-glass"><span class="dot"></span>Registration open</span>' : '<span class="pill-glass">Announced</span>')) + (days > 0 ? '<span class="pill-glass">' + days + ' days to go</span>' : '') + '<span class="pill-glass">' + esc(c.city) + (c.country ? ', ' + esc(c.country) : '') + '</span></div>' +
          '<h1>' + esc(c.title) + ' <em>' + esc(c.edition) + '</em></h1>' +
          '<p class="lede">' + esc(c.tagline) + '</p>' +
          '<div class="meta">' +
            '<div><span class="k">Dates</span><span class="v">' + esc(fmtRange(c)) + '</span></div>' +
            '<div><span class="k">Venue</span><span class="v">' + esc(c.venue.name) + '</span></div>' +
            '<div><span class="k">Format</span><span class="v">' + esc(c.format) + '</span></div>' +
            (chairs.length ? '<div><span class="k">Chaired by</span><span class="v">' + esc(andList(chairs.map((s) => s.name))) + '</span></div>' : '') +
          '</div>' +
          '<div class="btn-row">' + (reg.open ? '<a class="btn btn-glow btn-lg pulse" href="' + url('register', c.id) + '">Register now</a>' : '<a class="btn btn-glow btn-lg" href="' + url('register', c.id) + '">Register interest</a>') + '<a class="btn btn-outline-light btn-lg" href="' + url('agenda', c.id) + '">Explore the programme</a><a class="btn btn-outline-light btn-lg" href="' + url('sponsor', c.id) + '">Become a partner</a></div>' +
          (partners.length ? '<div class="trust"><span class="k">Partners include</span>' + partners.map((s) => '<span class="name">' + esc(s.name) + '</span>').join('') + '</div>' : '') +
        '</div>' +
        '<div class="glass"><h3>' + (c._status === 'live' ? 'Under way' : 'Doors open in') + '<small>' + esc(Engine.formatDate(c.start, { weekday: true, short: true })) + '</small></h3><div class="countdown" id="countdown"></div>' +
          reg.tiers.map((t) => '<div class="price ' + esc(t.state) + '"><span>' + esc(t.name) + (t.state === 'current' ? '<span class="tag">Current</span>' : '') + (t.until && t.state !== 'closed' ? ' <span style="opacity:.7">· until ' + esc(Engine.formatDate(t.until, { short: true, noYear: true })) + '</span>' : '') + '</span><strong>' + esc(UI.money(t.price, reg.currency)) + '</strong></div>').join('') +
          (includes.length ? '<ul class="includes">' + includes.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '') +
          '<a class="btn btn-light w-full mt-3" href="' + url('register', c.id) + '">' + (reg.open ? 'Secure your place' : 'Register your interest') + '</a>' +
          (c.hotels && c.hotels[0] && c.hotels[0].cutoff ? '<p class="small mt-2 mb-0" style="opacity:.75;text-align:center">Headquarters hotel block closes ' + esc(Engine.formatDate(c.hotels[0].cutoff, { short: true })) + '</p>' : '') +
        '</div></div></section>' +
        tickerMarkup(c, sched, speakers, reg));
      UI.countdown($('#countdown'), c.start, '00:00:00');

      // Agenda teaser timeline
      const tl = $('#timeline');
      if (tl && sched.length) {
        tl.style.setProperty('--days', sched.length);
        tl.innerHTML = sched.map((d) => {
          const top = d.flat.find((s) => ['keynote', 'panel', 'masterclass', 'regulator-address', 'debate'].indexOf(s.type) >= 0) || d.flat.find((s) => Engine.EVENING_TYPES.indexOf(s.type) >= 0) || d.flat[0];
          return '<div class="tl-day"><span class="dot" aria-hidden="true"></span><div class="d">Day ' + d.number + ' · ' + esc(d.weekday.slice(0, 3)) + ' ' + esc(Engine.formatDate(d.date, { short: true, noYear: true })) + '</div><h4>' + esc(d.label) + '</h4><p>' + esc(top ? top.title : '') + '</p>' + (d.contentCount ? '<span class="n">' + d.contentCount + ' sessions →</span>' : '<span class="n">Social programme →</span>') + '</div>';
        }).join('');
        $('#inside-title').textContent = sched.length + ' days, ' + (c.tracks || []).length + ' tracks, one room that matters';
        $('#inside-sub').textContent = c.title + ' · ' + c.edition + ' · ' + Engine.countSessions(sched) + ' sessions with ' + speakers.length + ' speakers.';
        $('#inside-link').setAttribute('href', url('agenda', c.id));
      } else if (tl) { $('#inside').classList.add('hide'); }

      // Destination panel
      const hotels = (c.hotels || []).slice(0, 3);
      const faq = (c.faq || []).slice(0, 2);
      html('#destination', '<div class="destination" ' + UI.heroStyle(c) + '>' +
        '<svg class="waves" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden="true"><path d="M0 80 C 240 140, 480 20, 720 80 S 1200 140, 1440 80 V160 H0 Z" fill="rgba(255,255,255,0.12)"/><path d="M0 110 C 240 170, 480 50, 720 110 S 1200 170, 1440 110 V160 H0 Z" fill="rgba(255,255,255,0.10)"/></svg>' +
        '<div><p class="eyebrow on-dark">The destination</p><h2>' + esc(c.city) + (c.country ? ', ' + esc(c.country) : '') + '</h2><p class="lede" style="color:rgba(255,255,255,.88)">' + esc(c.venue.description) + '</p>' + faq.map((f) => '<p class="small"><strong>' + esc(f.q) + '</strong> ' + esc(f.a) + '</p>').join('') + '<div class="btn-row"><a class="btn btn-light" href="' + url('hotels', c.id) + '">Hotel partners &amp; booking</a><a class="btn btn-outline-light" href="' + url('conference', c.id) + '#venue">About the venue</a></div></div>' +
        '<div class="hotel-mini">' + hotels.map((h) => '<div><span><strong>' + esc(h.name) + '</strong><span class="s">' + esc(h.category) + ' · ' + esc(h.distance) + '</span></span><span class="r">' + esc(String(h.rate).replace(/ per night$/, '')) + '</span></div>').join('') + (hotels.length ? '<p class="small mb-0" style="opacity:.75">Negotiated delegate rates per night, available to registered delegates until the cut-off dates shown on the hotels page.</p>' : '') + '</div></div>');

      // Closing call to action
      html('#cta', '<section class="cta-band"><div class="container"><p class="eyebrow on-dark">' + esc(c.title) + ' · ' + esc(c.edition) + '</p><h2>' + (reg.open ? 'Secure your place at the <em>summit</em>' : 'Be first to hear when registration <em>opens</em>') + '</h2>' +
        (reg.current ? '<div class="price-lockup"><strong>' + esc(UI.money(reg.current.price, reg.currency)) + '</strong><span>per delegate · ' + esc(reg.current.name) + (reg.current.until ? ' pricing until ' + esc(Engine.formatDate(reg.current.until)) : '') + '</span></div>' : '') +
        '<p>' + esc(c.summary) + '</p>' +
        '<div class="btn-row" style="justify-content:center"><a class="btn btn-glow btn-lg" href="' + url('register', c.id) + '">' + (reg.open ? 'Register now' : 'Register interest') + '</a><a class="btn btn-outline-light btn-lg" href="' + url('sponsor', c.id) + '">Partner with the summit</a></div></div></section>');
    } else {
      $('#inside').classList.add('hide');
    }

    html('#upcoming-grid', upcoming.length ? upcoming.map((c) => UI.confCard(c)).join('') : '<div class="empty">Further programmes will be announced shortly.</div>');

    const org = MLS.ORG;
    html('#stats', [[org.stats.conferences, 'Conferences since ' + org.founded], [org.stats.delegates, 'Delegates convened'], [org.stats.countries, 'Countries represented'], [org.stats.rating, 'Average delegate rating']].map(([n, l]) => '<div class="stat"><div class="num" data-count="' + esc(n) + '">' + esc(n) + '</div><div class="lbl">' + esc(l) + '</div></div>').join(''));
    countUp(document.querySelectorAll('#stats .num'));

    const themes = Array.from(new Set(past.map((c) => c.themeId))).map((id) => MLS.THEMES.find((t) => t.id === id)).filter(Boolean);
    const chipRow = $('#topic-chips');
    let activeTheme = null;
    const renderPast = () => {
      const list = past.filter((c) => !activeTheme || c.themeId === activeTheme).slice(0, 6);
      html('#past-grid', list.map((c) => UI.confCard(c)).join(''));
    };
    if (chipRow) {
      chipRow.innerHTML = '<button class="chip active" data-theme="">All topics</button>' + '<button class="chip" data-theme="__compliance">Compliance</button>' + themes.map((t) => '<button class="chip" data-theme="' + esc(t.id) + '">' + esc(t.name) + '</button>').join('');
      chipRow.addEventListener('click', (e) => {
        const b = e.target.closest('.chip'); if (!b) return;
        chipRow.querySelectorAll('.chip').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        const v = b.dataset.theme;
        if (v === '__compliance') { activeTheme = null; html('#past-grid', past.filter((c) => c._theme && c._theme.compliance).slice(0, 6).map((c) => UI.confCard(c)).join('')); return; }
        activeTheme = v || null; renderPast();
      });
    }
    renderPast();

    const featuredSpeakers = Store.speakers().filter((s) => s.featured).slice(0, 8);
    html('#faculty-grid', featuredSpeakers.map((s) => '<a class="spot" href="' + url('speaker', s.id) + '">' + UI.avatar(s, 'lg') + '<span class="name">' + esc(s.name) + '</span><span class="role">' + esc(s.title) + '</span><span class="org">' + esc(s.org) + '</span><span class="tagrow">' + (s.expertise || []).slice(0, 2).map((e) => '<span class="tag">' + esc(e) + '</span>').join('') + '</span></a>').join(''));

    const names = Array.from(new Set(Store.conferences().flatMap((c) => (c.sponsors || []).filter((s) => ['Platinum', 'Gold'].indexOf(s.tier) >= 0).map((s) => s.name))));
    const track = names.map((n) => '<span>' + esc(n) + '</span>').join('');
    html('#marquee', '<div class="track">' + track + track + '</div>');

    const quotes = past.flatMap((c) => (c.recap && c.recap.quotes ? c.recap.quotes.map((q) => Object.assign({ conf: c }, q)) : [])).slice(0, 3);
    html('#quotes', quotes.map((q) => '<blockquote class="quote"><p>“' + esc(q.text) + '”</p><footer><strong>' + esc(q.name) + '</strong>' + esc(q.role) + ' · ' + esc(q.conf.title) + ', ' + esc(q.conf.edition) + '</footer></blockquote>').join(''));
  };

  function tickerMarkup(c, sched, speakers, reg) {
    const items = [];
    sched.forEach((d) => d.flat.forEach((s) => { if (['keynote', 'panel', 'debate', 'masterclass', 'fireside', 'roundtable'].indexOf(s.type) >= 0 && items.length < 10) items.push('<span class="item"><span class="lbl">' + esc(Engine.TYPE_LABELS[s.type] || s.type) + '</span>' + esc(s.title) + '</span>'); }));
    speakers.slice(0, 6).forEach((s) => items.push('<span class="item"><span class="lbl">Speaking</span>' + esc(s.name) + ', ' + esc(s.org) + '</span>'));
    if (reg.current && reg.current.until) items.push('<span class="item"><span class="lbl">Pricing</span>' + esc(reg.current.name) + ' rate ends ' + esc(Engine.formatDate(reg.current.until)) + '</span>');
    if (c.hotels && c.hotels[0] && c.hotels[0].cutoff) items.push('<span class="item"><span class="lbl">Hotels</span>' + esc(c.hotels[0].name) + ' block closes ' + esc(Engine.formatDate(c.hotels[0].cutoff)) + '</span>');
    if (!items.length) return '';
    const track = items.join('');
    return '<div class="ticker" aria-hidden="true"><div class="track">' + track + track + '</div></div>';
  }

  function countUp(nodes) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const run = (el) => {
      const raw = el.dataset.count || el.textContent;
      const m = /^([\d,]+(?:\.\d+)?)(.*)$/.exec(raw.trim());
      if (!m || reduce) { el.textContent = raw; return; }
      const target = parseFloat(m[1].replace(/,/g, ''));
      const suffix = m[2];
      const decimals = (m[1].split('.')[1] || '').length;
      const start = performance.now();
      const dur = 1100;
      const tick = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        el.textContent = (decimals ? val.toFixed(decimals) : Math.round(val).toLocaleString('en-US')) + suffix;
        if (p < 1) requestAnimationFrame(tick); else el.textContent = raw;
      };
      requestAnimationFrame(tick);
    };
    if (!('IntersectionObserver' in window)) { nodes.forEach((el) => run(el)); return; }
    const io = new IntersectionObserver((entries) => { entries.forEach((en) => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } }); }, { threshold: 0.4 });
    nodes.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------------ */
  Pages.conferences = function () {
    UI.setMeta('Conferences', 'Upcoming and past OOO legal and compliance conferences across five continents.');
    const all = Store.conferences();
    const themes = MLS.THEMES.filter((t) => all.some((c) => c.themeId === t.id));
    const regions = Array.from(new Set(all.map((c) => c.region))).sort();
    html('#filters', '<label class="sr-only" for="q">Search</label><input id="q" type="search" placeholder="Search by title, city or topic">' +
      '<select id="f-theme" aria-label="Topic"><option value="">All topics</option><option value="__compliance">Compliance programmes</option>' + themes.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('') + '</select>' +
      '<select id="f-region" aria-label="Region"><option value="">All regions</option>' + regions.map((r) => '<option>' + esc(r) + '</option>').join('') + '</select>' +
      '<select id="f-status" aria-label="Status"><option value="">Upcoming and past</option><option value="upcoming">Upcoming only</option><option value="past">Past only</option></select>' +
      '<span class="count" id="count"></span>');
    const apply = () => {
      const q = $('#q').value.trim().toLowerCase();
      const th = $('#f-theme').value, rg = $('#f-region').value, st = $('#f-status').value;
      const match = (c) => (!q || (c.title + ' ' + c.city + ' ' + c.country + ' ' + (c._theme ? c._theme.name : '') + ' ' + (c.edition || '')).toLowerCase().indexOf(q) >= 0) &&
        (!th || (th === '__compliance' ? (c._theme && c._theme.compliance) : c.themeId === th)) && (!rg || c.region === rg);
      const up = st === 'past' ? [] : Store.upcoming().filter(match);
      const past = st === 'upcoming' ? [] : Store.past().filter(match);
      html('#upcoming-grid', up.length ? up.map((c) => UI.confCard(c)).join('') : '<div class="empty">No upcoming conferences match these filters.</div>');
      const byYear = new Map();
      past.forEach((c) => { const y = c.start.slice(0, 4); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(c); });
      html('#past-years', past.length ? Array.from(byYear.entries()).map(([y, list]) => '<h3 class="year-head">' + y + '</h3><div class="grid grid-3">' + list.map((c) => UI.confCard(c)).join('') + '</div>').join('') : '<div class="empty">No past conferences match these filters.</div>');
      $('#count').textContent = (up.length + past.length) + ' conference' + (up.length + past.length === 1 ? '' : 's');
      $('#upcoming').classList.toggle('hide', st === 'past');
      $('#past').classList.toggle('hide', st === 'upcoming');
    };
    ['#q', '#f-theme', '#f-region', '#f-status'].forEach((s) => $(s).addEventListener('input', apply));
    apply();
    if (location.hash) { const el = $(location.hash); if (el) setTimeout(() => el.scrollIntoView(), 50); }
  };

  /* ------------------------------------------------------------------ */
  Pages.conference = function () {
    const c = loadConf(); if (!c) return;
    UI.setMeta(c.title + ' — ' + c.edition, c.summary || c.tagline);
    const sched = Store.schedule(c);
    const speakers = Store.speakersFor(c);
    const chairs = (c.chairs || []).map((id) => Store.speaker(id)).filter(Boolean);
    const reg = Engine.registrationState(c, MLS.NOW);
    const sp = Engine.sponsorship(c);
    const past = c._status === 'past';
    const hotels = c.hotels || [];
    const hq = hotels[0];

    const glance = sched.length ? sched.map((d) => {
      const top = d.flat.filter((s) => Engine.CONTENT_TYPES.indexOf(s.type) >= 0 && !s.auto && s.type !== 'opening' && s.type !== 'closing').slice(0, 3);
      const evening = d.flat.filter((s) => Engine.EVENING_TYPES.indexOf(s.type) >= 0);
      return '<div class="card"><div class="card-body"><p class="eyebrow mb-1">Day ' + d.number + ' · ' + esc(d.weekday) + ' ' + esc(Engine.formatDate(d.date, { noYear: true })) + '</p><h4>' + esc(d.label) + '</h4><ul class="list-check small">' + top.map((s) => '<li>' + esc(s.title) + '</li>').join('') + evening.map((s) => '<li><em>' + esc(s.title) + '</em></li>').join('') + '</ul></div></div>';
    }).join('') : '<div class="empty"><p class="mb-0">The programme is being written now. ' + (c.cfp && c.cfp.open ? 'The call for speakers is open until ' + esc(Engine.formatDate(c.cfp.deadline)) + '.' : '') + '</p></div>';

    html('#app', confHero(c, { active: 'conference' }) +
      '<section class="section"><div class="container two-col"><div>' +
        '<div class="prose" id="about"><p class="eyebrow">About the ' + (c.title.toLowerCase().indexOf('summit') >= 0 ? 'summit' : c.title.toLowerCase().indexOf('forum') >= 0 ? 'forum' : c.title.toLowerCase().indexOf('congress') >= 0 ? 'congress' : 'conference') + '</p>' + (c.description || []).map((p) => '<p class="lede" style="font-size:1.08rem">' + esc(p) + '</p>').join('') + '</div>' +
        (c.highlights && c.highlights.length ? '<div class="mt-4"><h3>Highlights</h3><ul class="list-check">' + c.highlights.map((h) => '<li>' + esc(h) + '</li>').join('') + '</ul></div>' : '') +
        (c.tracks && c.tracks.length ? '<div class="mt-6"><div class="section-head"><h2>Tracks</h2><a class="btn btn-outline btn-sm" href="' + url('agenda', c.id) + '">Full programme</a></div><div class="grid grid-2">' + c.tracks.map((t, i) => '<div class="card"><div class="card-body"><span class="track-pill t' + (i % 5) + '">Track ' + (i + 1) + '</span><h3 class="mt-2">' + esc(t.name) + '</h3><p class="muted mb-0">' + esc(t.description || (c._theme ? 'Sessions from the ' + c._theme.name.toLowerCase() + ' programme committee.' : '')) + '</p></div></div>').join('') + '</div></div>' : '') +
        '<div class="mt-6" id="programme"><div class="section-head"><h2>Programme at a glance</h2>' + (sched.length ? '<a class="btn btn-outline btn-sm" href="' + url('agenda', c.id) + '">Day-by-day itinerary</a>' : '') + '</div><div class="grid grid-2">' + glance + '</div></div>' +
        '<div class="mt-6" id="speakers"><div class="section-head"><h2>' + (past ? 'Faculty' : 'Confirmed speakers') + '</h2><span class="muted">' + speakers.length + ' speaker' + (speakers.length === 1 ? '' : 's') + (chairs.length ? ' · chaired by ' + esc(andList(chairs.map((s) => s.name))) : '') + '</span></div>' +
          (speakers.length ? '<div class="grid grid-2">' + speakers.map((s) => UI.speakerCard(s, { note: (c.chairs || []).indexOf(s.id) >= 0 ? 'Programme chair' : '' })).join('') + '</div>' : '<div class="empty">Speakers will be announced as the programme is confirmed.' + (c.cfp && c.cfp.open ? ' <a href="' + url('contact') + '#speak">Propose a session</a>.' : '') + '</div>') + '</div>' +
        '<div class="mt-6" id="venue"><div class="section-head"><h2>Venue & hotels</h2><a class="btn btn-outline btn-sm" href="' + url('hotels', c.id) + '">Hotel partners & booking</a></div>' +
          '<div class="card"><div class="card-body"><h3>' + esc(c.venue.name) + '</h3><p class="muted">' + esc(c.venue.address) + '</p><p class="mb-0">' + esc(c.venue.description) + '</p></div></div>' +
          (hotels.length ? '<div class="grid grid-3 mt-3">' + hotels.slice(0, 3).map((h) => '<div class="card"><div class="card-body"><p class="eyebrow mb-1">' + esc(h.category) + '</p><h4>' + esc(h.name) + '</h4><p class="small muted mb-1">' + esc(h.distance) + '</p><p class="mb-0"><strong>' + esc(h.rate) + '</strong>' + (h.cutoff ? '<br><span class="small muted">Book by ' + esc(Engine.formatDate(h.cutoff)) + '</span>' : '') + '</p></div></div>').join('') + '</div>' : '') + '</div>' +
        '<div class="mt-6" id="partners"><div class="section-head"><h2>' + (past ? 'Partners' : 'Partners & sponsors') + '</h2><a class="btn btn-outline btn-sm" href="' + url('sponsor', c.id) + '">' + (past ? 'Partner with the next edition' : 'Sponsorship prospectus') + '</a></div>' + sponsorGrid(c.sponsors, { enquireHref: url('sponsor', c.id) }) + '</div>' +
        (c.faq && c.faq.length ? '<div class="mt-6" id="faq"><h2>Practical information</h2>' + c.faq.map((f) => '<details class="faq"><summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>').join('') + '</div>' : '') +
        (past && (c.stats || c.recap) ? '<div class="mt-6" id="recap"><h2>Recap</h2>' + (c.stats ? '<div class="stats mb-3">' + [[c.stats.attendees, 'Delegates'], [c.stats.countries, 'Countries'], [c.stats.sessions || Engine.countSessions(sched), 'Sessions'], [c.stats.nps ? '+' + c.stats.nps : '—', 'Net promoter score']].map(([n, l]) => '<div class="stat"><div class="num">' + esc(n) + '</div><div class="lbl">' + esc(l) + '</div></div>').join('') + '</div>' : '') +
          (c.recap && c.recap.quotes ? '<div class="grid grid-2">' + c.recap.quotes.map((q) => '<blockquote class="quote"><p>“' + esc(q.text) + '”</p><footer><strong>' + esc(q.name) + '</strong>' + esc(q.role) + '</footer></blockquote>').join('') + '</div>' : '') +
          (c.recap && c.recap.outcomes ? '<h3 class="mt-4">Delegate resources</h3><ul class="list-check">' + c.recap.outcomes.map((o) => '<li>' + esc(o) + '</li>').join('') + '</ul><p class="small muted">Slides, recordings and toolkits are available to registered delegates through the delegate portal.</p>' : '') + '</div>' : '') +
      '</div>' +
      '<aside>' +
        '<div class="aside-card"><h3>Key facts</h3><dl class="kv"><dt>Dates</dt><dd>' + esc(fmtRange(c)) + '</dd><dt>Venue</dt><dd>' + esc(c.venue.name) + '<br><span class="small muted">' + esc(c.venue.address) + '</span></dd><dt>Time zone</dt><dd>' + esc(c.timezone || '') + '</dd><dt>Format</dt><dd>' + esc(c.format || 'In person') + '</dd>' + (chairs.length ? '<dt>Chairs</dt><dd>' + chairs.map((s) => '<a href="' + url('speaker', s.id) + '">' + esc(s.name) + '</a>').join('<br>') + '</dd>' : '') + (c.hashtag ? '<dt>Hashtag</dt><dd>' + esc(c.hashtag) + '</dd>' : '') + '</dl><div class="btn-row mt-2"><a class="btn btn-outline btn-sm" href="' + icsFor(c) + '" download="' + esc(c.id) + '.ics">Add to calendar</a></div></div>' +
        (past ? '<div class="aside-card"><h3>This event has taken place</h3><p class="small muted">Explore the programme archive, or register for the next edition when it is announced.</p><div class="btn-row"><a class="btn btn-primary" href="' + url('agenda', c.id) + '">Programme archive</a><a class="btn btn-outline" href="' + url('conferences') + '#upcoming">Upcoming conferences</a></div></div>' :
          '<div class="aside-card"><h3>Registration</h3>' + (reg.open ? (reg.current ? '<p class="mb-1"><span class="muted small">' + esc(reg.current.name) + (reg.current.until ? ' until ' + esc(Engine.formatDate(reg.current.until)) : '') + '</span><br><strong style="font-family:var(--font-display);font-size:1.9rem">' + esc(UI.money(reg.current.price, reg.currency)) + '</strong> <span class="small muted">per delegate</span></p>' : '') + (reg.special && reg.special.length ? '<p class="small muted">In-house and regulator rates from ' + esc(UI.money(Math.min.apply(null, reg.special.map((s) => s.price)), reg.currency)) + '.</p>' : '') + '<a class="btn btn-primary w-full" href="' + url('register', c.id) + '">Register now</a>' : '<p class="small muted">' + (reg.opensOn ? 'Registration opens on ' + esc(Engine.formatDate(reg.opensOn)) + '.' : 'Registration will open once the programme is confirmed.') + '</p><a class="btn btn-primary w-full" href="' + url('register', c.id) + '">Register your interest</a>') + '</div>' +
          (hq ? '<div class="aside-card"><h3>Hotel block</h3><p class="small mb-1"><strong>' + esc(hq.name) + '</strong><br><span class="muted">' + esc(hq.rate) + '</span></p>' + (hq.cutoff ? '<p class="small muted">Delegate rate available until ' + esc(Engine.formatDate(hq.cutoff)) + '.</p>' : '') + '<a class="btn btn-outline w-full" href="' + url('hotels', c.id) + '">Book accommodation</a></div>' : '') +
          '<div class="aside-card"><h3>Sponsorship</h3><p class="small muted">' + (sp.tiers ? sp.tiers.filter((t) => t.remaining > 0).length + ' of ' + sp.tiers.length + ' packages still available.' : 'Packages available.') + '</p><a class="btn btn-outline w-full" href="' + url('sponsor', c.id) + '">View the prospectus</a></div>') +
        '<div class="aside-card"><h3>Questions?</h3><p class="small muted">Delegate enquiries: <a href="mailto:' + esc(MLS.ORG.emails.registration) + '">' + esc(MLS.ORG.emails.registration) + '</a><br>Partnerships: <a href="mailto:' + esc(MLS.ORG.emails.sponsorship) + '">' + esc(MLS.ORG.emails.sponsorship) + '</a></p><a class="btn btn-ghost btn-sm" href="' + url('contact') + '">Contact form →</a></div>' +
      '</aside></div></section>');
  };

  /* ------------------------------------------------------------------ */
  Pages.agenda = function () {
    const c = loadConf(); if (!c) return;
    UI.setMeta('Programme — ' + c.title + ' ' + c.edition, 'Day-by-day itinerary for ' + c.title + ', ' + c.edition + '.');
    const sched = Store.schedule(c);
    const first = Math.max(0, sched.findIndex((d) => d.contentCount > 0));
    const body = sched.length ?
      '<div class="day-tabs" role="tablist">' + sched.map((d, i) => '<button role="tab" aria-selected="' + (i === first) + '" class="' + (i === first ? 'active' : '') + '" data-day="' + i + '"><strong>Day ' + d.number + ' · ' + esc(d.weekday.slice(0, 3)) + ' ' + esc(Engine.formatDate(d.date, { noYear: true, short: true })) + '</strong>' + esc(d.label) + '</button>').join('') + '</div>' +
      sched.map((d, i) => '<div class="agenda-day ' + (i === first ? 'active' : '') + '" id="day-' + i + '" role="tabpanel"><div class="agenda-day-title"><h3>' + esc(d.label) + '</h3><span class="muted">' + esc(d.weekday) + ', ' + esc(Engine.formatDate(d.date)) + ' · ' + (d.contentCount ? d.contentCount + ' session' + (d.contentCount === 1 ? '' : 's') : 'arrival and social programme') + '</span></div>' + dayMarkup(c, d) + '</div>').join('')
      : '<div class="empty"><h3>Programme to be announced</h3><p>The editorial team is writing the ' + esc(c.edition) + ' programme now.' + (c.cfp && c.cfp.open ? ' Speaker proposals are open until ' + esc(Engine.formatDate(c.cfp.deadline)) + '.' : '') + '</p><a class="btn btn-primary" href="' + url('register', c.id) + '">Register your interest</a></div>';
    html('#app', confHero(c, { active: 'agenda', crumb: 'Programme', title: 'Programme', lede: c.title + ' · ' + c.edition + ' · ' + fmtRange(c) + (c.timezone ? ' · all times ' + c.timezone : ''), actions: '<a class="btn btn-light" href="' + url('register', c.id) + '">' + (c._status === 'past' ? 'Next edition' : 'Register') + '</a><a class="btn btn-outline-light" href="' + icsFor(c) + '" download="' + esc(c.id) + '.ics">Add to calendar</a><button class="btn btn-outline-light" type="button" onclick="window.print()">Print programme</button>' }) +
      '<section class="section"><div class="container">' + (c.tracks && c.tracks.length ? '<div class="flex wrap gap-1 mb-3">' + c.tracks.map((t, i) => '<span class="track-pill t' + (i % 5) + '">' + esc(t.name) + '</span>').join('') + '</div>' : '') + body + '</div></section>');
    const tabs = $('.day-tabs');
    if (tabs) tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      tabs.querySelectorAll('button').forEach((x) => { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
      b.classList.add('active'); b.setAttribute('aria-selected', 'true');
      document.querySelectorAll('.agenda-day').forEach((d) => d.classList.remove('active'));
      $('#day-' + b.dataset.day).classList.add('active');
    });
    if (matchMedia('print').matches) document.querySelectorAll('.agenda-day').forEach((d) => d.classList.add('active'));
    window.addEventListener('beforeprint', () => document.querySelectorAll('.agenda-day').forEach((d) => d.classList.add('active')));
  };

  /* ------------------------------------------------------------------ */
  Pages.speakers = function () {
    UI.setMeta('Speakers', 'The OOO speaker faculty: regulators, general counsel, compliance leaders and practitioners.');
    const all = Store.speakers();
    const confs = Store.conferences().sort((a, b) => b.start.localeCompare(a.start));
    const expertise = Array.from(new Set(all.flatMap((s) => s.expertise || []))).sort();
    html('#filters', '<label class="sr-only" for="q">Search speakers</label><input id="q" type="search" placeholder="Search by name, organisation or expertise">' +
      '<select id="f-conf" aria-label="Conference"><option value="">All conferences</option>' + confs.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.title + ' — ' + c.edition) + '</option>').join('') + '</select>' +
      '<select id="f-exp" aria-label="Expertise"><option value="">All expertise</option>' + expertise.map((x) => '<option>' + esc(x) + '</option>').join('') + '</select><span class="count" id="count"></span>');
    const apply = () => {
      const q = $('#q').value.trim().toLowerCase(), cid = $('#f-conf').value, ex = $('#f-exp').value;
      let list = all;
      if (cid) { const c = Store.get(cid); const ids = c ? Engine.allSpeakerIds(c) : []; list = list.filter((s) => ids.indexOf(s.id) >= 0); }
      if (ex) list = list.filter((s) => (s.expertise || []).indexOf(ex) >= 0);
      if (q) list = list.filter((s) => (s.name + ' ' + s.org + ' ' + s.title + ' ' + (s.expertise || []).join(' ') + ' ' + (s.location || '')).toLowerCase().indexOf(q) >= 0);
      html('#grid', list.length ? list.map((s) => UI.speakerCard(s, { note: s._appearances ? s._appearances + ' OOO programme' + (s._appearances === 1 ? '' : 's') : '' })).join('') : '<div class="empty">No speakers match.</div>');
      $('#count').textContent = list.length + ' speaker' + (list.length === 1 ? '' : 's');
    };
    ['#q', '#f-conf', '#f-exp'].forEach((s) => $(s).addEventListener('input', apply));
    apply();
  };

  /* ------------------------------------------------------------------ */
  Pages.speaker = function () {
    const id = UI.routeId();
    const s = id && Store.speaker(id);
    if (!s) { notFound('Speaker'); return; }
    UI.setMeta(s.name, s.title + ', ' + s.org);
    const apps = Store.appearances(s.id);
    const upcoming = apps.filter((a) => a.conf._status !== 'past');
    const past = apps.filter((a) => a.conf._status === 'past');
    const related = Store.speakers().filter((x) => x.id !== s.id && (x.expertise || []).some((e) => (s.expertise || []).indexOf(e) >= 0)).slice(0, 4);
    const appMarkup = (a) => '<div class="card"><div class="card-body"><div class="flex between wrap gap-1"><div><p class="eyebrow mb-1">' + esc(fmtRange(a.conf)) + ' · ' + esc(a.conf.city) + '</p><h3><a href="' + url('conference', a.conf.id) + '">' + esc(a.conf.title) + ' — ' + esc(a.conf.edition) + '</a></h3></div>' + (a.isChair ? '<span class="badge badge-accent">Programme chair</span>' : '') + '</div>' +
      (a.sessions.length ? '<ul class="list-check mt-2 mb-0">' + a.sessions.map((x) => '<li>' + UI.typeBadge(x.type) + ' <strong>' + esc(x.title) + '</strong><br><span class="small muted">' + esc(x.dayLabel) + ', ' + esc(Engine.formatDate(x.date, { short: true })) + ' · ' + esc(x.start) + '–' + esc(x.end) + '</span></li>').join('') + '</ul>' : '') + '<a class="btn btn-ghost btn-sm mt-2" href="' + url('agenda', a.conf.id) + '">Full programme →</a></div></div>';
    html('#app', '<section class="page-hero"><div class="container"><div class="crumbs"><a href="' + url('home') + '">Home</a> / <a href="' + url('speakers') + '">Speakers</a> / ' + esc(s.name) + '</div>' +
      '<div class="flex wrap gap-2 center">' + UI.avatar(s, 'xl') + '<div>' + (s.proposed ? '<span class="badge badge-outline-light mb-1">Invited speaker · confirmation pending</span>' : '') + '<h1>' + esc(s.name) + '</h1><p class="lede mb-1">' + esc(s.title) + (s.org ? ', ' + esc(s.org) : '') + '</p>' + (s.location ? '<p class="small" style="opacity:.75">' + esc(s.location) + '</p>' : '') +
      '<div class="flex wrap gap-1 mt-2">' + (s.expertise || []).map((e) => '<span class="badge badge-outline-light">' + esc(e) + '</span>').join('') + '</div>' +
      '<div class="btn-row mt-3">' + (s.linkedin ? '<a class="btn btn-light" href="' + esc(s.linkedin) + '" target="_blank" rel="noopener">LinkedIn profile</a>' : '') + '<a class="btn btn-outline-light" href="' + url('contact') + '?speaker=' + encodeURIComponent(s.id) + '#general">Request an introduction</a></div></div></div></div></section>' +
      '<section class="section"><div class="container two-col"><div>' +
        '<h2>Biography</h2><p class="lede" style="font-size:1.08rem">' + esc(Engine.bioFor(s)) + '</p>' + (s._source !== 'seed' && (!s.bio || s.bioDraft) ? '<p class="small muted">' + (s.researched ? 'Draft biography compiled from the details supplied and public sources. ' : (s.proposed ? 'Placeholder profile for an invited speaker; details will be updated on confirmation. ' : 'Draft biography generated from the details supplied to the organiser console. ')) + 'Pending speaker approval.</p>' : '') +
        (upcoming.length ? '<h2 class="mt-6">Speaking at</h2><div class="grid grid-1" style="display:grid;gap:1rem">' + upcoming.map(appMarkup).join('') + '</div>' : '') +
        (past.length ? '<h2 class="mt-6">Past OOO appearances</h2><div style="display:grid;gap:1rem">' + past.map(appMarkup).join('') + '</div>' : '') +
        (!apps.length ? '<div class="empty mt-4">No programme appearances recorded yet.</div>' : '') +
      '</div><aside>' +
        '<div class="aside-card"><h3>At a glance</h3><dl class="kv"><dt>Role</dt><dd>' + esc(s.title) + '</dd><dt>Organisation</dt><dd>' + esc(s.org) + '</dd>' + (s.location ? '<dt>Based in</dt><dd>' + esc(s.location) + '</dd>' : '') + '<dt>OOO programmes</dt><dd>' + apps.length + '</dd></dl></div>' +
        (related.length ? '<div class="aside-card"><h3>Related speakers</h3>' + related.map((r) => '<div class="mb-2">' + UI.speakerChip(r) + '</div>').join('') + '</div>' : '') +
        '<div class="aside-card"><h3>Invite to speak</h3><p class="small muted">Our programme team can request availability for your own event or a private briefing.</p><a class="btn btn-outline w-full" href="' + url('contact') + '?speaker=' + encodeURIComponent(s.id) + '#general">Contact programme team</a></div>' +
      '</aside></div></section>');
  };

  /* ------------------------------------------------------------------ */
  Pages.sponsors = function () {
    UI.setMeta('Sponsorship & partnerships', 'Partner with OOO conferences to reach senior legal and compliance decision-makers.');
    const upcoming = Store.upcoming();
    const tiers = Engine.defaultSponsorship({ expected: 400, sponsorship: { currency: 'USD' } }).tiers;
    html('#tiers', tiers.slice(0, 4).map((t, i) => '<div class="tier-card' + (i === 1 ? ' featured' : '') + '"><p class="eyebrow mb-0">' + esc(t.name) + '</p><div class="tier-price">from ' + esc(UI.money(t.price, 'USD')) + '</div><ul>' + t.benefits.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul><a class="btn ' + (i === 1 ? 'btn-primary' : 'btn-outline') + ' mt-1" href="#enquire">Enquire</a></div>').join(''));
    html('#opportunities-grid', upcoming.map((c) => { const sp = Engine.sponsorship(c); const open = sp.tiers.filter((t) => t.remaining > 0); return '<div class="card"><div class="card-body"><p class="eyebrow mb-1">' + esc(fmtRange(c)) + ' · ' + esc(c.city) + '</p><h3><a href="' + url('conference', c.id) + '">' + esc(c.title) + ' — ' + esc(c.edition) + '</a></h3><p class="muted">' + esc(c.expected || 300) + ' expected delegates · ' + (c._theme ? esc(c._theme.name) : '') + '</p><p class="small mb-2">' + (open.length ? open.length + ' packages available, including ' + esc(open.slice(0, 3).map((t) => t.name).join(', ')) : 'Packages available on request') + '</p><a class="btn btn-outline btn-sm" href="' + url('sponsor', c.id) + '">Prospectus →</a></div></div>'; }).join(''));
    const partners = Array.from(new Map(Store.past().flatMap((c) => c.sponsors || []).map((s) => [s.name, s])).values());
    html('#partners', '<div class="logo-grid">' + partners.slice(0, 24).map((s) => '<div class="logo-card"><div class="wordmark">' + esc(s.name) + '</div><div class="industry">' + esc(s.industry || '') + '</div></div>').join('') + '</div>');
    const form = $('#enquire form');
    if (form) {
      $('#enq-conf').innerHTML = '<option value="">Any programme / general partnership</option>' + upcoming.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.title + ' — ' + c.edition) + '</option>').join('');
      UI.bindForm(form, 'sponsorship', { successText: 'Thank you. Our partnerships team will send the prospectus and propose a call within one working day.' });
    }
  };

  /* ------------------------------------------------------------------ */
  Pages.sponsor = function () {
    const c = loadConf(); if (!c) return;
    UI.setMeta('Sponsorship — ' + c.title + ' ' + c.edition, 'Partnership packages for ' + c.title + ', ' + c.edition + '.');
    const sp = Engine.sponsorship(c);
    const theme = c._theme;
    const audiences = c.audiences || (theme && theme.audiences) || [];
    const cats = c.sponsorCategories || (theme && theme.sponsorCategories) || [];
    const past = c._status === 'past';
    html('#app', confHero(c, { active: 'sponsorship', crumb: 'Sponsorship', title: 'Partner with the ' + (c.title.toLowerCase().indexOf('summit') >= 0 ? 'summit' : 'programme'), lede: (past ? 'This edition has taken place. Packages below show what partners received; the next edition’s prospectus follows the same structure.' : 'Reach ' + (c.expected || 300) + ' senior decision-makers in ' + c.city + '. Packages are limited and allocated in order of confirmation.'), actions: '<a class="btn btn-light" href="#enquire">Request the prospectus</a><a class="btn btn-outline-light" href="' + url('conference', c.id) + '#partners">Current partners</a>' }) +
      '<section class="section"><div class="container">' +
        '<div class="two-col"><div><h2>Who attends</h2><p class="lede">' + esc(c.summary) + '</p>' +
          (audiences.length ? '<ul class="list-check mt-2">' + audiences.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul>' : '') +
          '<div class="stats mt-4">' + [[(c.expected || (c.stats && c.stats.attendees) || 300), past ? 'Delegates attended' : 'Expected delegates'], [(c.tracks || []).length || '—', 'Tracks'], [Store.speakersFor(c).length, 'Speakers'], [c.region, 'Region']].map(([n, l]) => '<div class="stat"><div class="num">' + esc(n) + '</div><div class="lbl">' + esc(l) + '</div></div>').join('') + '</div>' +
        '</div><aside>' + (cats.length ? '<div class="aside-card"><h3>Partners we work with</h3><ul class="list-check small">' + cats.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '') + '<div class="aside-card"><h3>Editorial independence</h3><p class="small muted mb-0">Speaking places are allocated on merit and approved by the programme committee. Partner sessions are labelled as such. This protects the audience you are paying to reach.</p></div></aside></div>' +
        '<div class="mt-6"><div class="section-head"><h2>Packages</h2><span class="muted">Prices in ' + esc(sp.currency) + (sp.generated ? ' · indicative' : '') + '</span></div><div class="grid grid-3">' + sp.tiers.map((t, i) => '<div class="tier-card' + (i === 1 ? ' featured' : '') + '"><div class="flex between center"><p class="eyebrow mb-0">' + esc(t.name) + '</p><span class="avail' + (t.remaining === 0 ? ' sold' : '') + '">' + (past ? 'Allocated' : (t.remaining === 0 ? 'Sold out' : t.remaining + ' of ' + t.slots + ' available')) + '</span></div><div class="tier-price">' + esc(UI.money(t.price, sp.currency)) + '</div><ul>' + (t.benefits || []).map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>' + (!past && t.remaining > 0 ? '<a class="btn btn-outline mt-1" href="#enquire" data-tier="' + esc(t.name) + '">Reserve</a>' : '') + '</div>').join('') + '</div></div>' +
        '<div class="mt-6" id="partners"><h2>' + (past ? 'Partners of this edition' : 'Confirmed partners') + '</h2>' + sponsorGrid(c.sponsors, { enquireHref: '#enquire' }) + '</div>' +
        '<div class="mt-6" id="enquire"><div class="two-col"><div><h2>Request the prospectus</h2><p class="muted">Tell us about your objectives and we will send the full prospectus, floor plan and availability within one working day.</p>' +
          '<form class="form" id="sponsor-form">' +
            '<div class="form-row">' + UI.field({ name: 'name', label: 'Your name', required: true }) + UI.field({ name: 'email', label: 'Work email', type: 'email', required: true, error: 'Please enter a valid email address.' }) + '</div>' +
            '<div class="form-row">' + UI.field({ name: 'organisation', label: 'Organisation', required: true }) + UI.field({ name: 'role', label: 'Job title' }) + '</div>' +
            '<div class="form-row">' + UI.field({ name: 'tier', label: 'Package of interest', type: 'select', options: [['', 'Not sure yet']].concat(sp.tiers.map((t) => [t.name, t.name])) }) + UI.field({ name: 'budget', label: 'Indicative budget', type: 'select', options: [['', 'Prefer not to say'], ['under-10k', 'Under ' + UI.money(10000, sp.currency)], ['10k-25k', UI.money(10000, sp.currency) + '–' + UI.money(25000, sp.currency)], ['25k-50k', UI.money(25000, sp.currency) + '–' + UI.money(50000, sp.currency)], ['50k+', 'Over ' + UI.money(50000, sp.currency)]] }) + '</div>' +
            UI.field({ name: 'objectives', label: 'What would success look like?', type: 'textarea', placeholder: 'Lead generation, thought leadership, hosting a dinner, launching a product…' }) +
            '<label class="check"><input type="checkbox" name="consent" required><span>I agree to be contacted about partnership opportunities. See our privacy notice.</span></label>' +
            '<div class="btn-row"><button class="btn btn-primary btn-lg" type="submit">Send enquiry</button><span class="small muted">or email <a href="mailto:' + esc(MLS.ORG.emails.sponsorship) + '">' + esc(MLS.ORG.emails.sponsorship) + '</a></span></div>' +
          '</form></div><aside><div class="aside-card"><h3>Your partnerships contact</h3><p class="small"><strong>Margaux Olivier</strong><br>Head of Partnerships<br><a href="mailto:' + esc(MLS.ORG.emails.sponsorship) + '">' + esc(MLS.ORG.emails.sponsorship) + '</a></p></div>' + (c.hashtag ? '<div class="aside-card"><h3>Reach beyond the room</h3><p class="small muted mb-0">All partners are featured in pre-event communications to the OOO community and in the post-event report. Official hashtag: ' + esc(c.hashtag) + '.</p></div>' : '') + '</aside></div></div>' +
      '</div></section>');
    const form = $('#sponsor-form');
    UI.bindForm(form, 'sponsorship', { extra: { conferenceId: c.id, conference: c.title + ' — ' + c.edition }, successText: 'Thank you. The prospectus for ' + c.title + ' is on its way, and Margaux Olivier will propose a call within one working day.' });
    document.querySelectorAll('[data-tier]').forEach((a) => a.addEventListener('click', () => { const sel = form.querySelector('[name="tier"]'); if (sel) sel.value = a.dataset.tier; }));
  };

  /* ------------------------------------------------------------------ */
  Pages.hotels = function () {
    const c = loadConf(); if (!c) return;
    UI.setMeta('Venue & hotels — ' + c.title + ' ' + c.edition, 'Venue, partner hotels and delegate rates for ' + c.title + '.');
    const hotels = c.hotels || [];
    const past = c._status === 'past';
    const mapHref = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((c.venue.name || '') + ' ' + (c.venue.address || c.city));
    html('#app', confHero(c, { active: 'venue', crumb: 'Venue & hotels', title: 'Venue & hotel partners', lede: (c.venue.name || 'Venue') + ' · ' + c.city + (c.country ? ', ' + c.country : '') + '. Negotiated delegate rates at ' + hotels.length + ' partner hotel' + (hotels.length === 1 ? '' : 's') + '.', actions: '<a class="btn btn-light" href="#book">Request a hotel booking</a><a class="btn btn-outline-light" href="' + mapHref + '" target="_blank" rel="noopener">Open venue in Maps</a>' }) +
      '<section class="section"><div class="container">' +
        '<div class="two-col"><div><h2>The venue</h2><div class="card"><div class="card-body"><h3>' + esc(c.venue.name) + '</h3><p class="muted">' + esc(c.venue.address) + '</p><p>' + esc(c.venue.description) + '</p>' + (c.venue.rooms && c.venue.rooms.length ? '<p class="small muted mb-0"><strong>Rooms:</strong> ' + esc(c.venue.rooms.join(' · ')) + '</p>' : '') + '</div></div>' +
        '<h2 class="mt-6">Partner hotels</h2>' + (hotels.length ? '<p class="muted">Rates are per room per night and available to registered delegates until the cut-off date shown. Quote the booking code <strong>OOO-' + esc(Engine.initials(c.title)) + esc(c.start.slice(2, 4)) + '</strong> or use the booking request form.</p>' + hotels.map((h, i) => '<div class="hotel-card mt-3"><div><p class="eyebrow mb-1">' + esc(h.category) + (h.proposed ? ' · proposed' : '') + '</p><h3>' + esc(h.name) + '</h3><div class="stars" aria-label="' + h.stars + ' star">' + '★'.repeat(h.stars || 0) + '</div><p class="muted mt-1">' + esc(h.description || '') + '</p>' + (h.amenities && h.amenities.length ? '<div class="tags">' + h.amenities.map((a) => '<span class="tag">' + esc(a) + '</span>').join('') + '</div>' : '') + '</div><div class="hotel-side"><div class="rate">' + esc(h.rate) + '</div><div class="small muted">' + esc(h.distance) + '</div>' + (h.cutoff ? '<div class="small">' + (past ? 'Block closed ' : 'Book by ') + '<strong>' + esc(Engine.formatDate(h.cutoff)) + '</strong></div>' : '') + (!past ? '<a class="btn btn-outline btn-sm mt-1" href="#book" data-hotel="' + esc(h.name) + '">Request this hotel</a>' : '') + '</div></div>').join('') : '<div class="empty">Hotel partners will be announced with the programme.</div>') +
        '</div><aside>' +
          '<div class="aside-card"><h3>Getting there</h3><dl class="kv"><dt>City</dt><dd>' + esc(c.city) + (c.country ? ', ' + esc(c.country) : '') + '</dd><dt>Time zone</dt><dd>' + esc(c.timezone || 'Local time') + '</dd><dt>Dates</dt><dd>' + esc(fmtRange(c)) + '</dd></dl><a class="btn btn-ghost btn-sm mt-2" href="' + mapHref + '" target="_blank" rel="noopener">Directions →</a></div>' +
          (c.faq && c.faq.length ? '<div class="aside-card"><h3>Practical notes</h3>' + c.faq.slice(0, 2).map((f) => '<p class="small"><strong>' + esc(f.q) + '</strong><br><span class="muted">' + esc(f.a) + '</span></p>').join('') + '</div>' : '') +
          '<div class="aside-card"><h3>Accessibility</h3><p class="small muted mb-0">All venues and headquarters hotels are step-free. Tell us about access, dietary or childcare needs when you register and our delegate experience team will make arrangements.</p></div>' +
        '</aside></div>' +
        (!past ? '<div class="mt-6" id="book"><div class="two-col"><div><h2>Hotel booking request</h2><p class="muted">Our delegate experience team confirms bookings directly with the hotel within one working day and sends you the confirmation. No payment is taken at this stage.</p>' +
          '<form class="form" id="hotel-form">' +
            '<div class="form-row">' + UI.field({ name: 'name', label: 'Guest name', required: true }) + UI.field({ name: 'email', label: 'Email', type: 'email', required: true, error: 'Please enter a valid email address.' }) + '</div>' +
            '<div class="form-row">' + UI.field({ name: 'hotel', label: 'Preferred hotel', type: 'select', required: true, options: hotels.map((h) => [h.name, h.name + ' — ' + h.rate]) }) + UI.field({ name: 'rooms', label: 'Rooms', type: 'number', value: 1, attrs: ' min="1" max="20"' }) + '</div>' +
            '<div class="form-row">' + UI.field({ name: 'checkin', label: 'Check-in', type: 'date', required: true, value: Engine.addDays(c.start, 0) }) + UI.field({ name: 'checkout', label: 'Check-out', type: 'date', required: true, value: Engine.addDays(c.end || c.start, 1) }) + '</div>' +
            UI.field({ name: 'notes', label: 'Requests', type: 'textarea', placeholder: 'Room type, accessibility needs, sharing with a colleague…' }) +
            '<div class="btn-row"><button class="btn btn-primary btn-lg" type="submit">Send booking request</button></div></form></div>' +
          '<aside><div class="aside-card"><h3>Why book through OOO</h3><ul class="list-check small"><li>Negotiated rates below public prices</li><li>Flexible cancellation up to the cut-off date</li><li>Shuttle and transfer arrangements coordinated with the venue</li><li>One point of contact for the whole delegation</li></ul></div></aside></div></div>' : '') +
      '</div></section>');
    const form = $('#hotel-form');
    if (form) {
      UI.bindForm(form, 'hotel-booking', { extra: { conferenceId: c.id, conference: c.title + ' — ' + c.edition }, successText: 'Your booking request has been received. The delegate experience team will confirm availability with the hotel and email you within one working day.' });
      document.querySelectorAll('[data-hotel]').forEach((a) => a.addEventListener('click', () => { form.querySelector('[name="hotel"]').value = a.dataset.hotel; }));
    }
  };

  /* ------------------------------------------------------------------ */
  Pages.register = function () {
    const c = loadConf(); if (!c) return;
    UI.setMeta('Register — ' + c.title + ' ' + c.edition, 'Registration for ' + c.title + ', ' + c.edition + '.');
    const reg = Engine.registrationState(c, MLS.NOW);
    const past = c._status === 'past';
    const passOptions = reg.tiers.filter((t) => t.state !== 'closed').map((t) => [t.name, t.name + ' — ' + UI.money(t.price, reg.currency)]).concat(reg.special.map((s) => [s.name, s.name + ' — ' + UI.money(s.price, reg.currency)]));
    const table = reg.tiers.length ? '<table class="price-table"><thead><tr><th>Pass</th><th>Deadline</th><th>Price</th></tr></thead><tbody>' + reg.tiers.map((t) => '<tr class="' + esc(t.state) + '"><td><strong>' + esc(t.name) + '</strong>' + (t.state === 'current' ? ' <span class="badge badge-accent">Current</span>' : '') + '</td><td>' + (t.until ? esc(Engine.formatDate(t.until)) : '—') + (t.state === 'closed' ? ' <span class="small muted">closed</span>' : '') + '</td><td class="price">' + esc(UI.money(t.price, reg.currency)) + '</td></tr>').join('') + reg.special.map((s) => '<tr><td><strong>' + esc(s.name) + '</strong>' + (s.note ? '<br><span class="small muted">' + esc(s.note) + '</span>' : '') + '</td><td>Until the event</td><td class="price">' + esc(UI.money(s.price, reg.currency)) + '</td></tr>').join('') + '</tbody></table>' : '';
    const intro = past ? '<div class="notice mb-3">Registration for this edition has closed. You can <a href="' + url('agenda', c.id) + '">explore the programme archive</a> or register your interest in the next edition below.</div>' : (!reg.open ? '<div class="notice mb-3">Registration ' + (reg.opensOn ? 'opens on <strong>' + esc(Engine.formatDate(reg.opensOn)) + '</strong>' : 'is not yet open') + '. Leave your details and we will notify you first, with early-bird pricing.</div>' : '');
    html('#app', confHero(c, { active: 'register', crumb: 'Register', title: past || !reg.open ? 'Register your interest' : 'Register', lede: (reg.open ? 'Secure your place at ' + c.title + ', ' + c.edition + '. ' + (reg.current ? reg.current.name + ' pricing applies until ' + Engine.formatDate(reg.current.until) + '.' : '') : c.title + ', ' + c.edition + '.'), actions: '<a class="btn btn-light" href="#form">' + (reg.open ? 'Complete registration' : 'Register interest') + '</a><a class="btn btn-outline-light" href="' + url('hotels', c.id) + '">Hotel partners</a>' }) +
      '<section class="section"><div class="container two-col"><div>' + intro +
        (table ? '<h2>Delegate passes</h2>' + table + (reg.groupDiscount ? '<p class="small muted mt-2">' + esc(reg.groupDiscount) + ' Prices exclude local taxes where applicable.</p>' : '') : '') +
        (reg.includes.length ? '<h3 class="mt-4">Your pass includes</h3><ul class="list-check">' + reg.includes.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '') +
        '<div class="mt-6" id="form"><h2>' + (reg.open ? 'Delegate details' : 'Register your interest') + '</h2>' +
          '<form class="form" id="reg-form">' +
            '<div class="form-row">' + UI.field({ name: 'firstName', label: 'First name', required: true }) + UI.field({ name: 'lastName', label: 'Last name', required: true }) + '</div>' +
            '<div class="form-row">' + UI.field({ name: 'email', label: 'Work email', type: 'email', required: true, error: 'Please enter a valid email address.' }) + UI.field({ name: 'phone', label: 'Mobile number', type: 'tel' }) + '</div>' +
            '<div class="form-row">' + UI.field({ name: 'organisation', label: 'Organisation', required: true }) + UI.field({ name: 'role', label: 'Job title', required: true }) + '</div>' +
            '<div class="form-row">' + UI.field({ name: 'country', label: 'Country', required: true }) + UI.field({ name: 'sector', label: 'Sector', type: 'select', options: [['in-house', 'In-house legal or compliance'], ['law-firm', 'Private practice'], ['regulator', 'Regulator or public body'], ['vendor', 'Technology or service provider'], ['academic', 'Academic'], ['other', 'Other']] }) + '</div>' +
            (reg.open ? '<div class="form-row">' + UI.field({ name: 'pass', label: 'Pass type', type: 'select', required: true, options: passOptions }) + UI.field({ name: 'promo', label: 'Promotional code' }) + '</div>' : '') +
            '<div class="form-row">' + UI.field({ name: 'dietary', label: 'Dietary requirements' }) + UI.field({ name: 'access', label: 'Access requirements' }) + '</div>' +
            (c.hotels && c.hotels.length && !past ? '<label class="check"><input type="checkbox" name="hotelHelp" value="yes"><span>I would like the delegate team to arrange accommodation at a partner hotel.</span></label>' : '') +
            '<label class="check"><input type="checkbox" name="terms" required><span>I accept the terms of participation and the privacy notice.</span></label>' +
            '<div class="btn-row"><button class="btn btn-primary btn-lg" type="submit">' + (reg.open ? 'Submit registration' : 'Register interest') + '</button><span class="small muted">' + (reg.open ? 'An invoice or card payment link follows by email. Places are confirmed on payment.' : 'No payment is taken.') + '</span></div>' +
          '</form></div>' +
      '</div><aside>' +
        (reg.open && reg.current ? '<div class="aside-card"><h3>Current price</h3><p class="mb-1"><strong style="font-family:var(--font-display);font-size:2rem">' + esc(UI.money(reg.current.price, reg.currency)) + '</strong> <span class="small muted">per delegate</span></p><p class="small muted mb-0">' + esc(reg.current.name) + (reg.current.until ? ' pricing until ' + esc(Engine.formatDate(reg.current.until)) : '') + '. ' + (reg.tiers.find((t) => t.state === 'upcoming') ? 'Then ' + esc(UI.money(reg.tiers.find((t) => t.state === 'upcoming').price, reg.currency)) + '.' : '') + '</p></div>' : '') +
        '<div class="aside-card"><h3>Key dates</h3><dl class="kv"><dt>Conference</dt><dd>' + esc(fmtRange(c)) + '</dd>' + reg.tiers.filter((t) => t.until && t.state !== 'closed').map((t) => '<dt>' + esc(t.name) + ' ends</dt><dd>' + esc(Engine.formatDate(t.until)) + '</dd>').join('') + (c.hotels && c.hotels[0] && c.hotels[0].cutoff ? '<dt>Hotel block closes</dt><dd>' + esc(Engine.formatDate(c.hotels[0].cutoff)) + '</dd>' : '') + '</dl></div>' +
        '<div class="aside-card"><h3>Cancellations</h3><p class="small muted mb-0">Full refund up to 30 days before the event; 50 per cent up to 14 days before; substitutions accepted at any time at no charge.</p></div>' +
        '<div class="aside-card"><h3>Group bookings</h3><p class="small muted">Three or more delegates from one organisation save 15 per cent. For groups of ten or more, contact <a href="mailto:' + esc(MLS.ORG.emails.registration) + '">' + esc(MLS.ORG.emails.registration) + '</a>.</p></div>' +
      '</aside></div></section>');
    UI.bindForm($('#reg-form'), reg.open ? 'registration' : 'register-interest', { extra: { conferenceId: c.id, conference: c.title + ' — ' + c.edition }, successText: reg.open ? 'Your registration has been received. A confirmation and payment link will arrive by email within a few minutes, and your delegate badge will be ready for collection at the venue.' : 'Thank you. We will notify you as soon as registration opens, with access to early-bird pricing.' });
  };

  /* ------------------------------------------------------------------ */
  Pages.about = function () {
    UI.setMeta('About OOO', 'Orient Occidental Organisers Pte Ltd: independent legal conferences convening the profession across East and West since 2014.');
    const org = MLS.ORG;
    html('#story', org.story.map((p) => '<p class="lede" style="font-size:1.1rem">' + esc(p) + '</p>').join(''));
    html('#values', org.values.map((v) => '<div class="card"><div class="card-body"><h3>' + esc(v.title) + '</h3><p class="muted mb-0">' + esc(v.text) + '</p></div></div>').join(''));
    html('#stats', [[org.stats.conferences, 'Conferences delivered'], [org.stats.delegates, 'Delegates'], [org.stats.countries, 'Countries'], [org.stats.speakers, 'Speakers']].map(([n, l]) => '<div class="stat"><div class="num">' + esc(n) + '</div><div class="lbl">' + esc(l) + '</div></div>').join(''));
    html('#team', org.team.map((m) => '<div class="speaker-card" style="cursor:default">' + UI.avatar({ id: m.name, name: m.name }) + '<span><span class="name">' + esc(m.name) + '</span><span class="role" style="display:block">' + esc(m.role) + '</span><span class="small muted" style="display:block;margin-top:.35rem">' + esc(m.bio) + '</span></span></div>').join(''));
    const board = (org.advisoryBoard || []).map((id) => Store.speaker(id)).filter(Boolean);
    html('#advisory', board.map((s) => UI.speakerCard(s)).join(''));
    html('#offices', org.offices.map((o) => '<div class="card"><div class="card-body"><p class="eyebrow mb-1">' + esc(o.label) + '</p><h3>' + esc(o.city) + '</h3><p class="muted mb-0">' + esc(o.address) + '</p></div></div>').join(''));
  };

  /* ------------------------------------------------------------------ */
  Pages.contact = function () {
    UI.setMeta('Contact', 'Contact Orient Occidental Organisers: delegate enquiries, speaker proposals, partnerships and press.');
    const org = MLS.ORG;
    const upcoming = Store.upcoming();
    const speakerId = new URLSearchParams(location.search).get('speaker');
    const sp = speakerId ? Store.speaker(speakerId) : null;
    html('#offices', org.offices.map((o) => '<div class="card"><div class="card-body"><p class="eyebrow mb-1">' + esc(o.label) + '</p><h3>' + esc(o.city) + '</h3><p class="muted mb-0">' + esc(o.address) + '</p></div></div>').join(''));
    html('#emails', Object.entries({ 'General enquiries': org.emails.general, 'Delegates and registration': org.emails.registration, 'Sponsorship and partnerships': org.emails.sponsorship, 'Speakers and programme': org.emails.speakers, 'Press': org.emails.press }).map(([k, v]) => '<dt>' + esc(k) + '</dt><dd><a href="mailto:' + esc(v) + '">' + esc(v) + '</a></dd>').join(''));
    const general = $('#general-form');
    if (general) {
      general.innerHTML = '<div class="form-row">' + UI.field({ name: 'name', label: 'Your name', required: true }) + UI.field({ name: 'email', label: 'Email', type: 'email', required: true, error: 'Please enter a valid email address.' }) + '</div>' +
        '<div class="form-row">' + UI.field({ name: 'organisation', label: 'Organisation' }) + UI.field({ name: 'topic', label: 'Topic', type: 'select', options: [['delegate', 'Registration or delegate question'], ['speaker-intro', 'Request an introduction to a speaker'], ['partnership', 'Partnership'], ['venue', 'Venue or hotel'], ['other', 'Something else']], value: sp ? 'speaker-intro' : 'delegate' }) + '</div>' +
        UI.field({ name: 'message', label: 'Message', type: 'textarea', required: true, value: sp ? 'I would like to be introduced to ' + sp.name + ' (' + sp.title + ', ' + sp.org + ').' : '' }) +
        '<label class="check"><input type="checkbox" name="consent" required><span>I agree to the privacy notice.</span></label>' +
        '<div class="btn-row"><button class="btn btn-primary btn-lg" type="submit">Send message</button></div>';
      UI.bindForm(general, 'contact', { extra: sp ? { speakerId: sp.id } : {} });
    }
    const speak = $('#speak-form');
    if (speak) {
      speak.innerHTML = '<div class="form-row">' + UI.field({ name: 'name', label: 'Your name', required: true }) + UI.field({ name: 'email', label: 'Email', type: 'email', required: true, error: 'Please enter a valid email address.' }) + '</div>' +
        '<div class="form-row">' + UI.field({ name: 'role', label: 'Title and organisation', required: true }) + UI.field({ name: 'linkedin', label: 'LinkedIn profile', type: 'url', placeholder: 'https://www.linkedin.com/in/…' }) + '</div>' +
        UI.field({ name: 'conference', label: 'Programme', type: 'select', options: [['', 'Any suitable programme']].concat(upcoming.map((c) => [c.id, c.title + ' — ' + c.edition + (c.cfp && c.cfp.open ? ' (call open)' : '')])) }) +
        UI.field({ name: 'title', label: 'Proposed session title', required: true }) +
        UI.field({ name: 'abstract', label: 'Abstract (up to 300 words)', type: 'textarea', required: true, hint: 'What question will the session answer, and what will delegates take away?' }) +
        '<label class="check"><input type="checkbox" name="consent" required><span>I understand that speaking places are allocated on editorial merit and are not linked to sponsorship.</span></label>' +
        '<div class="btn-row"><button class="btn btn-primary btn-lg" type="submit">Submit proposal</button></div>';
      UI.bindForm(speak, 'speaker-proposal', { successText: 'Thank you. The programme team reviews proposals every two weeks and will respond within a month of the relevant call closing.' });
    }
    const press = $('#press-form');
    if (press) {
      press.innerHTML = '<div class="form-row">' + UI.field({ name: 'name', label: 'Your name', required: true }) + UI.field({ name: 'email', label: 'Email', type: 'email', required: true, error: 'Please enter a valid email address.' }) + '</div>' +
        '<div class="form-row">' + UI.field({ name: 'outlet', label: 'Publication', required: true }) + UI.field({ name: 'conference', label: 'Conference', type: 'select', options: [['', 'General']].concat(upcoming.map((c) => [c.id, c.title + ' — ' + c.edition])) }) + '</div>' +
        UI.field({ name: 'message', label: 'Request', type: 'textarea', required: true, placeholder: 'Press accreditation, interview requests, embargoed briefings…' }) +
        '<div class="btn-row"><button class="btn btn-primary btn-lg" type="submit">Send press request</button></div>';
      UI.bindForm(press, 'press', { successText: 'Thank you. Our press office will respond within one working day.' });
    }
    if (location.hash) { const el = $(location.hash); if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 50); }
  };

  Pages.notfound = function () { UI.setMeta('Page not found', ''); };

  function routeFromPath() {
    const path = location.pathname.replace(/\/+$/, '');
    let m = /^\/conferences\/[^/]+\/(agenda|register|hotels|sponsor)$/.exec(path);
    if (m) return m[1];
    if (/^\/conferences\/[^/]+$/.test(path)) return 'conference';
    if (/^\/speakers\/[^/]+$/.test(path)) return 'speaker';
    return null;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    let page = document.body.dataset.page;
    if (page === 'notfound') {
      // Served as the platform's 404 page for a deep link the rewrites did not catch: render the intended page anyway.
      const target = routeFromPath();
      if (target) { page = target; document.body.dataset.page = target; const main = $('#main'); if (main && !$('#app')) main.innerHTML = '<div id="app"></div>'; }
    }
    UI.renderChrome(NAV_FOR[page] || '');
    try {
      await Store.ready;
    } catch (_) { /* proceed with seed data */ }
    if (Pages[page]) {
      try { Pages[page](); }
      catch (err) { console.error(err); const app = $('#app'); if (app) app.innerHTML = '<section class="section"><div class="container"><div class="empty"><h2>Something went wrong</h2><p>' + esc(err.message) + '</p></div></div></section>'; }
    }
  });
})();
