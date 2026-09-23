/* OOO conference planning engine.
 * Runs in the browser (window.Engine) and in Node (module.exports) so the same
 * logic drives the public site, the admin generator and the serverless fallback.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Utilities                                                           */
  /* ------------------------------------------------------------------ */
  const DAY_MS = 86400000;
  const pad = (n) => String(n).padStart(2, '0');

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Small deterministic PRNG (mulberry32) so generated plans are stable for a given seed.
  function rng(seed) {
    let a = hash(String(seed)) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function slugify(str) {
    return String(str || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[’'"]/g, '')
      .replace(/&/g, ' and ')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function parseDate(str) {
    if (str instanceof Date) return new Date(Date.UTC(str.getFullYear(), str.getMonth(), str.getDate()));
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }

  function isoDate(d) {
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function addDays(dateStr, n) {
    const d = parseDate(dateStr);
    return isoDate(new Date(d.getTime() + n * DAY_MS));
  }

  function daysBetween(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / DAY_MS);
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function formatDate(dateStr, opts) {
    const d = parseDate(dateStr);
    if (!d) return '';
    opts = opts || {};
    const parts = [];
    if (opts.weekday) parts.push(WEEKDAYS[d.getUTCDay()] + (opts.short ? '' : ','));
    parts.push(d.getUTCDate() + ' ' + (opts.short ? MONTHS[d.getUTCMonth()].slice(0, 3) : MONTHS[d.getUTCMonth()]));
    if (!opts.noYear) parts.push(String(d.getUTCFullYear()));
    return parts.join(' ');
  }

  function formatRange(start, end) {
    const a = parseDate(start), b = parseDate(end || start);
    if (!a) return '';
    if (!b || a.getTime() === b.getTime()) return formatDate(start);
    if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
      return a.getUTCDate() + '–' + b.getUTCDate() + ' ' + MONTHS[a.getUTCMonth()] + ' ' + a.getUTCFullYear();
    }
    if (a.getUTCFullYear() === b.getUTCFullYear()) {
      return a.getUTCDate() + ' ' + MONTHS[a.getUTCMonth()] + ' – ' + b.getUTCDate() + ' ' + MONTHS[b.getUTCMonth()] + ' ' + a.getUTCFullYear();
    }
    return formatDate(start) + ' – ' + formatDate(end);
  }

  function weekday(dateStr) {
    const d = parseDate(dateStr);
    return d ? WEEKDAYS[d.getUTCDay()] : '';
  }

  function todayIso(now) {
    const d = now ? new Date(now) : new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function minutesToTime(m) {
    return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
  }

  function timeToMinutes(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }

  const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', SGD: 'S$', AUD: 'A$', CAD: 'C$', CHF: 'CHF ', HKD: 'HK$', JPY: '¥', AED: 'AED ', IDR: 'Rp ', INR: '₹', DKK: 'DKK ', SEK: 'SEK ', NOK: 'NOK ', ZAR: 'R', BRL: 'R$', MXN: 'MX$', NZD: 'NZ$', KRW: '₩', CNY: '¥' };

  function formatMoney(amount, currency) {
    if (amount === null || amount === undefined || amount === '') return '';
    if (typeof amount === 'string') return amount;
    currency = currency || 'USD';
    const sym = CURRENCY_SYMBOLS[currency] !== undefined ? CURRENCY_SYMBOLS[currency] : currency + ' ';
    const n = Math.round(amount).toLocaleString('en-US');
    return sym + n;
  }

  function roundTo(n, step) {
    return Math.round(n / step) * step;
  }

  function fill(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null && vars[k] !== '' ? vars[k] : m));
  }

  /* ------------------------------------------------------------------ */
  /* Geography helpers                                                   */
  /* ------------------------------------------------------------------ */
  const EUROZONE = ['Austria', 'Belgium', 'Croatia', 'Cyprus', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Portugal', 'Slovakia', 'Slovenia', 'Spain', 'Bulgaria'];
  const REGIONS = {
    'Europe': ['United Kingdom', 'UK', 'England', 'Scotland', 'Ireland', 'France', 'Germany', 'Netherlands', 'Belgium', 'Luxembourg', 'Switzerland', 'Austria', 'Italy', 'Spain', 'Portugal', 'Denmark', 'Sweden', 'Norway', 'Finland', 'Poland', 'Czech Republic', 'Czechia', 'Hungary', 'Greece', 'Malta', 'Cyprus', 'Estonia', 'Latvia', 'Lithuania', 'Iceland', 'Croatia', 'Romania', 'Bulgaria', 'Slovakia', 'Slovenia', 'Monaco', 'Liechtenstein'],
    'Asia-Pacific': ['Singapore', 'Indonesia', 'Malaysia', 'Thailand', 'Vietnam', 'Philippines', 'Japan', 'South Korea', 'Korea', 'China', 'Hong Kong', 'Hong Kong SAR', 'Taiwan', 'Australia', 'New Zealand', 'India', 'Sri Lanka', 'Bangladesh', 'Pakistan', 'Cambodia', 'Macau', 'Brunei', 'Fiji'],
    'Americas': ['United States', 'USA', 'US', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Panama', 'Costa Rica', 'Uruguay', 'Bermuda', 'Cayman Islands', 'Bahamas', 'Barbados', 'Jamaica'],
    'Middle East': ['United Arab Emirates', 'UAE', 'Saudi Arabia', 'Qatar', 'Bahrain', 'Kuwait', 'Oman', 'Israel', 'Jordan', 'Türkiye', 'Turkey', 'Lebanon', 'Egypt'],
    'Africa': ['South Africa', 'Nigeria', 'Kenya', 'Ghana', 'Morocco', 'Rwanda', 'Mauritius', 'Tanzania', 'Ethiopia', 'Senegal', 'Côte d’Ivoire', 'Ivory Coast', 'Uganda', 'Botswana', 'Namibia', 'Zambia'],
  };
  const CURRENCIES = { 'United Kingdom': 'GBP', 'UK': 'GBP', 'England': 'GBP', 'Scotland': 'GBP', 'Singapore': 'SGD', 'Australia': 'AUD', 'New Zealand': 'NZD', 'Canada': 'CAD', 'Switzerland': 'CHF', 'Hong Kong': 'HKD', 'Hong Kong SAR': 'HKD', 'Japan': 'JPY', 'Denmark': 'DKK', 'Sweden': 'SEK', 'Norway': 'NOK', 'South Africa': 'ZAR', 'United Arab Emirates': 'AED', 'UAE': 'AED', 'India': 'INR' };
  const TIMEZONES = { 'United Kingdom': 'Greenwich Mean Time / British Summer Time (UTC+0/+1)', 'Ireland': 'Irish Standard Time (UTC+0/+1)', 'Portugal': 'Western European Time (UTC+0/+1)', 'Singapore': 'Singapore Time (SGT, UTC+8)', 'Indonesia': 'Western/Central Indonesia Time (UTC+7/+8)', 'Hong Kong': 'Hong Kong Time (HKT, UTC+8)', 'Hong Kong SAR': 'Hong Kong Time (HKT, UTC+8)', 'Japan': 'Japan Standard Time (JST, UTC+9)', 'South Korea': 'Korea Standard Time (KST, UTC+9)', 'Australia': 'Australian Eastern Time (UTC+10/+11)', 'New Zealand': 'New Zealand Time (UTC+12/+13)', 'India': 'India Standard Time (IST, UTC+5:30)', 'United Arab Emirates': 'Gulf Standard Time (GST, UTC+4)', 'UAE': 'Gulf Standard Time (GST, UTC+4)', 'Saudi Arabia': 'Arabia Standard Time (AST, UTC+3)', 'Qatar': 'Arabia Standard Time (AST, UTC+3)', 'United States': 'Local US time zone', 'Canada': 'Local Canadian time zone', 'Brazil': 'Brasília Time (BRT, UTC−3)', 'Mexico': 'Central Standard Time (UTC−6)', 'South Africa': 'South Africa Standard Time (SAST, UTC+2)', 'Kenya': 'East Africa Time (EAT, UTC+3)', 'Nigeria': 'West Africa Time (WAT, UTC+1)' };

  function regionFor(country) {
    const c = String(country || '').trim();
    for (const region of Object.keys(REGIONS)) {
      if (REGIONS[region].some((x) => x.toLowerCase() === c.toLowerCase())) return region;
    }
    return 'International';
  }

  function currencyFor(country) {
    const c = String(country || '').trim();
    if (CURRENCIES[c]) return CURRENCIES[c];
    if (EUROZONE.some((x) => x.toLowerCase() === c.toLowerCase())) return 'EUR';
    return 'USD';
  }

  function timezoneFor(country) {
    const c = String(country || '').trim();
    if (TIMEZONES[c]) return TIMEZONES[c];
    if (EUROZONE.some((x) => x.toLowerCase() === c.toLowerCase()) || regionFor(c) === 'Europe') return 'Central European Time (UTC+1/+2)';
    return 'Local time';
  }

  /* ------------------------------------------------------------------ */
  /* Status                                                              */
  /* ------------------------------------------------------------------ */
  function status(conf, now) {
    const today = todayIso(now);
    if (!conf.start) return 'draft';
    if (conf.end && today > conf.end) return 'past';
    if (today >= conf.start && (!conf.end || today <= conf.end)) return 'live';
    const hasProgram = (conf.program || []).length > 0;
    const regOpen = conf.registration && conf.registration.open;
    if (!hasProgram && !regOpen) return 'announced';
    return 'upcoming';
  }

  function daysUntil(conf, now) {
    return daysBetween(todayIso(now), conf.start);
  }

  /* ------------------------------------------------------------------ */
  /* Scheduling                                                          */
  /* ------------------------------------------------------------------ */
  const DURATIONS = {
    registration: 60, opening: 15, keynote: 45, 'regulator-address': 30, panel: 60, fireside: 40, debate: 45,
    workshop: 90, masterclass: 180, roundtable: 75, 'case-study': 40, lightning: 45, closing: 30, networking: 60,
    sponsor: 20, break: 30, lunch: 75, reception: 120, gala: 180, dinner: 150, excursion: 240, presentation: 30,
  };
  const CONTENT_TYPES = ['opening', 'keynote', 'regulator-address', 'panel', 'fireside', 'debate', 'workshop', 'masterclass', 'roundtable', 'case-study', 'lightning', 'closing', 'sponsor', 'presentation', 'networking'];
  const EVENING_TYPES = ['reception', 'gala', 'dinner', 'excursion'];
  const NO_BREAK_BEFORE = ['networking', 'closing', 'reception', 'gala', 'dinner', 'excursion', 'lunch', 'break', 'registration', 'opening'];

  const TYPE_LABELS = {
    registration: 'Registration', opening: 'Opening', keynote: 'Keynote', 'regulator-address': 'Regulator address', panel: 'Panel',
    fireside: 'Fireside chat', debate: 'Debate', workshop: 'Workshop', masterclass: 'Masterclass', roundtable: 'Roundtable',
    'case-study': 'Case study', lightning: 'Lightning talks', closing: 'Closing', networking: 'Networking', sponsor: 'Partner showcase',
    break: 'Break', lunch: 'Lunch', reception: 'Reception', gala: 'Gala dinner', dinner: 'Dinner', excursion: 'Excursion', presentation: 'Presentation',
  };

  function durationOf(item) {
    if (item.duration) return item.duration;
    return DURATIONS[item.type] || 45;
  }

  function blockDuration(item) {
    if (item.parallel) return Math.max.apply(null, item.parallel.map(durationOf));
    return durationOf(item);
  }

  function isContent(item) {
    return item.parallel || CONTENT_TYPES.indexOf(item.type) >= 0;
  }

  // Lays out one day's sessions into timed slots, inserting registration, breaks and lunch.
  function layoutDay(day, dayIndex, isFirstFullDay, venueRooms) {
    const items = day.sessions || [];
    const fixed = items.filter((it) => !it.parallel && it.time);
    const flow = items.filter((it) => it.parallel || !it.time);
    const rooms = venueRooms && venueRooms.length ? venueRooms : ['Plenary Hall', 'Breakout Room A', 'Breakout Room B', 'Breakout Room C', 'Breakout Room D', 'Breakout Room E'];
    const out = [];
    let seq = 0;

    const place = (item, start, dur, extra) => {
      const slot = Object.assign({}, item, extra || {}, { start: minutesToTime(start), end: minutesToTime(start + dur), startMin: start, endMin: start + dur, seq: seq++ });
      out.push(slot);
      return slot;
    };

    if (flow.length) {
      let t = isFirstFullDay ? 8 * 60 : 8 * 60 + 30;
      const regDur = isFirstFullDay ? 60 : 30;
      place({ type: 'registration', title: isFirstFullDay ? 'Registration, badge collection and welcome coffee' : 'Registration and morning coffee', abstract: '', speakers: [], track: null, auto: true }, t, regDur, { room: 'Foyer' });
      t += regDur;
      let blocksSinceBreak = 0;
      let lunchDone = false;
      for (const it of flow) {
        const dur = blockDuration(it);
        const type = it.parallel ? 'parallel' : it.type;
        const noBreak = NO_BREAK_BEFORE.indexOf(type) >= 0;
        if (!lunchDone && t >= 12 * 60 + 15 && type !== 'closing') {
          place({ type: 'lunch', title: 'Networking lunch', abstract: '', speakers: [], track: null, auto: true }, t, 75, { room: rooms[rooms.length - 1] });
          t += 75; lunchDone = true; blocksSinceBreak = 0;
        } else if (!lunchDone && t >= 11 * 60 + 45 && t + dur > 13 * 60 + 15 && type !== 'closing') {
          place({ type: 'lunch', title: 'Networking lunch', abstract: '', speakers: [], track: null, auto: true }, t, 75, { room: rooms[rooms.length - 1] });
          t += 75; lunchDone = true; blocksSinceBreak = 0;
        } else if (blocksSinceBreak >= 2 && dur >= 40 && !noBreak) {
          place({ type: 'break', title: t < 12 * 60 ? 'Coffee break' : 'Afternoon break', abstract: '', speakers: [], track: null, auto: true }, t, 30, { room: 'Foyer' });
          t += 30; blocksSinceBreak = 0;
        }
        if (it.parallel) {
          const started = t;
          const group = seq;
          it.parallel.forEach((s, i) => {
            place(s, started, durationOf(s), { room: s.room || rooms[Math.min(i + 1, rooms.length - 1)], parallelGroup: group, parallelIndex: i, parallelCount: it.parallel.length });
          });
          t += dur;
        } else {
          place(it, t, dur, { room: it.room || rooms[0] });
          t += dur;
        }
        blocksSinceBreak += dur >= 40 ? 1 : 0.5;
      }
    }

    for (const f of fixed) {
      const start = timeToMinutes(f.time);
      if (start === null) continue;
      place(f, start, durationOf(f), { room: f.room || (EVENING_TYPES.indexOf(f.type) >= 0 ? f.venue || 'Off site' : rooms[0]) });
    }

    out.sort((a, b) => a.startMin - b.startMin || a.seq - b.seq);
    // Group parallel slots
    const grouped = [];
    const seen = new Set();
    for (const slot of out) {
      if (slot.parallelGroup !== undefined) {
        const key = slot.startMin + ':' + slot.parallelGroup;
        if (seen.has(key)) continue;
        seen.add(key);
        const members = out.filter((s) => s.parallelGroup === slot.parallelGroup && s.startMin === slot.startMin);
        grouped.push({ parallel: members, start: slot.start, end: minutesToTime(Math.max.apply(null, members.map((m) => m.endMin))), startMin: slot.startMin });
      } else {
        grouped.push(slot);
      }
    }
    const contentSlots = out.filter((s) => isContent(s) && !s.auto);
    const lastEnd = out.length ? Math.max.apply(null, out.filter((s) => EVENING_TYPES.indexOf(s.type) < 0).map((s) => s.endMin).concat([0])) : 0;
    return { slots: grouped, flat: out, contentCount: contentSlots.length, lastEnd };
  }

  // Adds sessions from a theme's bank when an authored day would otherwise end early.
  function autofillDay(day, conf, theme, usedTitles, random) {
    if (!theme || !theme.sessionBank) return day;
    const flow = (day.sessions || []).filter((it) => it.parallel || !it.time);
    if (!flow.length) return day;
    const estimate = () => {
      const l = layoutDay({ sessions: day.sessions }, 0, false, []);
      return l.lastEnd;
    };
    const roster = allSpeakerIds(conf);
    const tracks = conf.tracks || [];
    const vars = { city: conf.city, country: conf.country, region: conf.region, year: (conf.start || '').slice(0, 4) };
    const candidates = shuffle(theme.sessionBank.map((t) => fill(t, vars)).filter((t) => !usedTitles.has(t.toLowerCase())), random);
    let guard = 0;
    let speakerCursor = hash(conf.id || 'x') % Math.max(roster.length, 1);
    while (estimate() < 16 * 60 + 10 && candidates.length && guard < 4) {
      const title = candidates.shift();
      usedTitles.add(title.toLowerCase());
      const speakers = [];
      const count = roster.length ? Math.min(3, roster.length) : 0;
      for (let i = 0; i < count; i++) speakers.push(roster[(speakerCursor + i) % roster.length]);
      speakerCursor += count;
      const track = tracks.length ? tracks[guard % tracks.length].id : null;
      const session = { type: 'panel', title, abstract: '', speakers, track, filled: true };
      // Insert before the closing session if present, else at the end of the flow items (before fixed evening items).
      const sessions = day.sessions.slice();
      let idx = sessions.findIndex((s) => !s.parallel && s.type === 'closing');
      if (idx < 0) {
        idx = sessions.length;
        while (idx > 0 && sessions[idx - 1].time && !sessions[idx - 1].parallel) idx--;
      }
      sessions.splice(idx, 0, session);
      day = Object.assign({}, day, { sessions });
      guard++;
    }
    return day;
  }

  function collectTitles(conf) {
    const set = new Set();
    const walk = (s) => { if (s.parallel) return s.parallel.forEach(walk); if (s.title) set.add(s.title.toLowerCase()); };
    (conf.program || []).forEach((d) => (d.sessions || []).forEach(walk));
    return set;
  }

  function allSpeakerIds(conf) {
    const ids = [];
    const push = (id) => { if (id && ids.indexOf(id) < 0) ids.push(id); };
    (conf.chairs || []).forEach(push);
    const walk = (s) => { if (s.parallel) return s.parallel.forEach(walk); (s.speakers || []).forEach(push); };
    (conf.program || []).forEach((d) => (d.sessions || []).forEach(walk));
    (conf.speakerIds || []).forEach(push);
    return ids;
  }

  // Full schedule for a conference: [{ date, label, weekday, slots, ... }]
  function schedule(conf, theme) {
    const program = conf.program || [];
    if (!program.length) return [];
    const random = rng(conf.id || conf.title || 'conf');
    const usedTitles = collectTitles(conf);
    let firstFullSeen = false;
    return program.map((day, i) => {
      let d = day;
      if (conf.autofill !== false) d = autofillDay(d, conf, theme, usedTitles, random);
      const hasFlow = (d.sessions || []).some((it) => it.parallel || !it.time);
      const isFirstFull = hasFlow && !firstFullSeen;
      if (hasFlow) firstFullSeen = true;
      const laid = layoutDay(d, i, isFirstFull, conf.venue && conf.venue.rooms);
      const date = conf.start ? addDays(conf.start, i) : null;
      return {
        index: i,
        number: i + 1,
        date,
        weekday: date ? weekday(date) : '',
        label: d.label || ('Day ' + (i + 1)),
        slots: laid.slots,
        flat: laid.flat,
        contentCount: laid.contentCount,
        lastEnd: laid.lastEnd,
      };
    });
  }

  function countSessions(sched) {
    let n = 0;
    sched.forEach((d) => d.flat.forEach((s) => { if (isContent(s) && !s.auto) n++; }));
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Registration & sponsorship                                          */
  /* ------------------------------------------------------------------ */
  function registrationState(conf, now) {
    const today = todayIso(now);
    const reg = conf.registration || {};
    const tiers = (reg.tiers || []).map((t) => Object.assign({}, t));
    let currentFound = false;
    tiers.forEach((t) => {
      if (t.until && today > t.until) t.state = 'closed';
      else if (!currentFound) { t.state = 'current'; currentFound = true; }
      else t.state = 'upcoming';
    });
    const st = status(conf, now);
    const current = tiers.find((t) => t.state === 'current') || null;
    return {
      open: !!reg.open && st !== 'past',
      opensOn: reg.opensOn || null,
      currency: reg.currency || 'USD',
      tiers,
      special: reg.special || [],
      includes: reg.includes || [],
      groupDiscount: reg.groupDiscount || '',
      current,
      status: st,
    };
  }

  const TIER_BENEFITS = {
    Platinum: ['Opening keynote introduction and a 20-minute plenary showcase', 'Host of the welcome reception', 'Ten delegate passes and a private meeting suite', 'Premium exhibition position and branding on all materials', 'Access to the opt-in delegate list'],
    Gold: ['Speaking place on a track panel, subject to editorial approval', 'Host of a track dinner', 'Six delegate passes', 'Exhibition stand', 'Branding on the app and signage'],
    Silver: ['Four delegate passes', 'Exhibition stand', 'Branding on the website and app', 'One piece of thought leadership distributed to delegates'],
    Exhibitor: ['Two delegate passes', 'Exhibition table', 'Logo on the website'],
    'Gala dinner host': ['Naming of the gala dinner', 'Welcome address at the dinner', 'Four delegate passes', 'Table of ten at the dinner'],
    'Lanyard and badge sponsor': ['Logo on every delegate lanyard and badge', 'Two delegate passes'],
    'Wi-Fi sponsor': ['Branded network name and landing page', 'Two delegate passes'],
    'Masterclass partner': ['Co-branding of one masterclass', 'Three delegate passes', 'Distribution of the masterclass toolkit under your brand'],
  };

  function defaultSponsorship(conf) {
    const expected = conf.expected || (conf.stats && conf.stats.attendees) || 300;
    const f = Math.max(0.5, Math.min(2.5, expected / 300));
    const cur = (conf.sponsorship && conf.sponsorship.currency) || (conf.registration && conf.registration.currency) || 'USD';
    const fx = { USD: 1, EUR: 0.92, GBP: 0.8, SGD: 1.35, AUD: 1.5, CAD: 1.36, CHF: 0.9, HKD: 7.8, JPY: 150, AED: 3.67, DKK: 6.9, SEK: 10.5, NOK: 10.8, INR: 84, ZAR: 18, NZD: 1.65, KRW: 1350 }[cur] || 1;
    const price = (usd) => roundTo(usd * f * fx, cur === 'JPY' || cur === 'KRW' || cur === 'INR' ? 10000 : 500);
    const mk = (name, usd, slots) => ({ name, price: price(usd), slots, remaining: slots, benefits: TIER_BENEFITS[name] || [] });
    return {
      currency: cur,
      tiers: [mk('Platinum', 50000, 1), mk('Gold', 28000, 4), mk('Silver', 14000, 6), mk('Exhibitor', 6500, 10), mk('Gala dinner host', 20000, 1), mk('Lanyard and badge sponsor', 9000, 1), mk('Wi-Fi sponsor', 6500, 1)],
      generated: true,
    };
  }

  function sponsorship(conf) {
    if (conf.sponsorship && conf.sponsorship.tiers && conf.sponsorship.tiers.length) return conf.sponsorship;
    return defaultSponsorship(conf);
  }

  /* ------------------------------------------------------------------ */
  /* Speaker bios                                                        */
  /* ------------------------------------------------------------------ */
  function bioFor(sp) {
    if (sp.bio) return sp.bio;
    const exp = (sp.expertise || []).slice(0, 3);
    const where = sp.location ? ', based in ' + sp.location : '';
    let s1 = sp.name + ' is ' + (sp.title ? (/^(head|chief|partner|general|managing|director|senior|founder|principal|professor|independent|global)/i.test(sp.title) ? sp.title : 'the ' + sp.title) : 'a speaker') + (sp.org ? ' at ' + sp.org : '') + where + '.';
    let s2 = '';
    if (exp.length === 1) s2 = ' Their work focuses on ' + exp[0].toLowerCase() + '.';
    else if (exp.length === 2) s2 = ' Their work focuses on ' + exp[0].toLowerCase() + ' and ' + exp[1].toLowerCase() + '.';
    else if (exp.length >= 3) s2 = ' Their work focuses on ' + exp[0].toLowerCase() + ', ' + exp[1].toLowerCase() + ' and ' + exp[2].toLowerCase() + '.';
    const s3 = ' A regular contributor to OOO programmes, they bring practical experience to every session they join.';
    return s1 + s2 + s3;
  }

  /* ------------------------------------------------------------------ */
  /* Conference generator (offline planner)                              */
  /* ------------------------------------------------------------------ */
  const GENERIC_BANK = [
    'The {theme} Landscape {year}: What Has Changed and What Comes Next',
    'Regulatory Priorities in {region}: A Practitioner’s Reading',
    'Case Studies in {theme}: What Worked, What Did Not and Why',
    'Cross-Border Practice in {theme}: Managing Divergent Rules',
    'Technology and Data in {theme}: Tools That Change the Work',
    'Enforcement and Litigation Trends in {theme}',
    'The In-House Perspective: What General Counsel Need From Their Advisers on {theme}',
    'Board Reporting and Governance for {theme}',
    'Emerging Risks in {theme}: A Horizon Scan',
    'Drafting and Negotiating in {theme}: Clauses Under Pressure',
    'Talent, Teams and Operating Models for {theme} Functions',
    'Regulator Dialogue: Expectations for {theme} in {country}',
  ];
  const GENERIC_WORKSHOPS = [
    'Workshop: Building a {theme} Framework From First Principles',
    'Workshop: A Practical Toolkit for {theme}',
    'Masterclass: Advanced Problems in {theme}',
  ];

  function normaliseSpeakers(list, seedPrefix) {
    const out = [];
    const seen = new Set();
    (list || []).forEach((raw, i) => {
      if (!raw) return;
      const sp = typeof raw === 'string' ? { name: raw } : Object.assign({}, raw);
      sp.name = String(sp.name || '').trim();
      if (!sp.name) return;
      let id = sp.id || slugify(sp.name) || ('speaker-' + (i + 1));
      let n = 2;
      while (seen.has(id)) id = slugify(sp.name) + '-' + (n++);
      seen.add(id);
      sp.id = id;
      sp.title = String(sp.title || '').trim();
      sp.org = String(sp.org || sp.organisation || sp.organization || sp.company || '').trim();
      sp.location = String(sp.location || '').trim();
      sp.linkedin = sp.linkedin ? String(sp.linkedin).trim() : null;
      if (sp.linkedin && !/^https?:\/\//i.test(sp.linkedin)) sp.linkedin = 'https://' + sp.linkedin.replace(/^\/+/, '');
      sp.expertise = Array.isArray(sp.expertise) ? sp.expertise : String(sp.expertise || '').split(',').map((s) => s.trim()).filter(Boolean);
      sp.bio = sp.bio || null;
      sp.generated = true;
      out.push(sp);
    });
    return out;
  }

  function resolveTheme(themeInput, themes) {
    if (!themeInput) return null;
    if (typeof themeInput === 'string') {
      const t = (themes || []).find((x) => x.id === themeInput);
      return t || null;
    }
    if (themeInput.id && themes) {
      const t = themes.find((x) => x.id === themeInput.id);
      if (t) return Object.assign({}, t, themeInput.name ? { name: themeInput.name } : {});
    }
    // Custom theme
    const name = String(themeInput.name || 'Legal Practice').trim();
    const tracks = (themeInput.tracks || []).filter(Boolean);
    return {
      id: themeInput.id || slugify(name),
      name,
      custom: true,
      compliance: /compliance|aml|sanction|regulat/i.test(name + ' ' + (themeInput.description || '')),
      color: themeInput.color || '#1F3A5F',
      short: themeInput.short || themeInput.description || '',
      description: themeInput.description || ('A programme for practitioners working in ' + name.toLowerCase() + '.'),
      titlePattern: themeInput.titlePattern || (name + ' Summit {year}'),
      keywords: themeInput.keywords || [],
      audiences: themeInput.audiences || ['General Counsel', 'Heads of Compliance', 'Private practitioners', 'Regulators'],
      tracks: tracks.length ? tracks : ['Regulation & Policy', 'Practice & Transactions', 'Disputes & Enforcement', 'Technology & Operations'],
      sessionBank: GENERIC_BANK.map((t) => t.replace(/\{theme\}/g, name)),
      workshopBank: GENERIC_WORKSHOPS.map((t) => t.replace(/\{theme\}/g, name)),
      sponsorCategories: themeInput.sponsorCategories || ['Law firms with relevant practices', 'Technology vendors', 'Advisory firms', 'Data providers', 'Professional bodies'],
      basePrice: themeInput.basePrice || 1795,
    };
  }

  function plan(brief, ctx) {
    ctx = ctx || {};
    const themes = ctx.themes || [];
    const theme = resolveTheme(brief.theme, themes) || resolveTheme({ name: brief.themeName || 'Legal Practice' }, themes);
    const start = brief.start;
    const end = brief.end || brief.start;
    if (!start || !parseDate(start)) throw new Error('A valid start date (YYYY-MM-DD) is required.');
    const nDays = Math.max(1, daysBetween(start, end) + 1);
    if (nDays > 7) throw new Error('Conferences longer than seven days are not supported.');
    const year = start.slice(0, 4);
    const city = String(brief.city || 'the host city').trim();
    const country = String(brief.country || '').trim();
    const region = brief.region || regionFor(country);
    const currency = brief.currency || currencyFor(country);
    const expected = Number(brief.expected) || 300;
    const options = Object.assign({ welcomeReception: true, gala: nDays >= 2, workshopsDay: nDays >= 4, excursion: nDays >= 4, roundtables: true, livestream: false }, brief.options || {});
    const speakers = normaliseSpeakers(brief.speakers);
    const speakerIds = speakers.map((s) => s.id);
    const title = String(brief.title || fill(theme.titlePattern, { year })).trim();
    const edition = brief.edition || (city.split(',')[0] + ' ' + year);
    const id = brief.id || slugify(title + ' ' + city.split(',')[0] + ' ' + year);
    const random = rng(id);
    const vars = { city: city.split(',')[0], country: country || region, region, year, n: nDays };

    // Tracks
    const trackNames = (brief.tracks && brief.tracks.length ? brief.tracks : theme.tracks).slice(0, 5);
    const tracks = trackNames.map((name) => ({ id: slugify(name), name, description: '' }));

    // Session titles
    const bank = shuffle(theme.sessionBank.map((t) => fill(t, vars)), random);
    const workshops = shuffle((theme.workshopBank || GENERIC_WORKSHOPS).map((t) => fill(t.replace(/\{theme\}/g, theme.name), vars)), random);
    let bankCursor = 0, wsCursor = 0;
    const nextTitle = () => bank[bankCursor++ % bank.length];
    const nextWorkshop = () => workshops[wsCursor++ % workshops.length];

    // Speaker assignment (round robin, avoiding repeats within a block)
    let cursor = 0;
    const take = (n, exclude) => {
      const out = [];
      if (!speakerIds.length) return out;
      let guard = 0;
      while (out.length < Math.min(n, speakerIds.length) && guard < speakerIds.length * 2) {
        const id = speakerIds[cursor++ % speakerIds.length];
        guard++;
        if (out.indexOf(id) >= 0 || (exclude && exclude.indexOf(id) >= 0)) continue;
        out.push(id);
      }
      return out;
    };
    const chairs = speakerIds.slice(0, Math.min(2, speakerIds.length));

    // Day structure
    const arrivalDay = nDays >= 4;
    const workshopDay = nDays >= 4 || (nDays === 3 && options.workshopsDay === true && brief.options && brief.options.workshopsDay);
    let fullDays = nDays - (arrivalDay ? 1 : 0) - (workshopDay ? 1 : 0);
    if (fullDays < 1) fullDays = 1;
    const program = [];
    const S = (type, t, abstract, sp, track, extra) => Object.assign({ type, title: t, abstract: abstract || '', speakers: sp || [], track: track || null }, extra || {});

    if (arrivalDay) {
      program.push({ label: 'Arrival & Welcome', sessions: [
        S('registration', 'Badge collection and delegate lounge open', 'Collect your badge at the venue or the headquarters hotel. The delegate lounge and networking app open at 14:00.', [], null, { time: '14:00', duration: 240 }),
        options.welcomeReception ? S('reception', 'Welcome Reception', 'An informal opening reception hosted by the Platinum partner. Dress code: smart casual.', chairs, null, { time: '18:30', duration: 120 }) : null,
      ].filter(Boolean) });
    }

    const dayLabels = ['Setting the Agenda', 'Deep Dives', 'Practice & Implementation', 'What Comes Next', 'Perspectives'];
    for (let d = 0; d < fullDays; d++) {
      const sessions = [];
      const isFirst = d === 0, isLast = d === fullDays - 1;
      if (isFirst) sessions.push(S('opening', 'Chairs’ Welcome and Framing', 'The programme chairs set out the questions the conference will address.', chairs));
      sessions.push(S('keynote', (isFirst ? 'Opening Keynote: ' : 'Keynote: ') + nextTitle(), '', take(1, chairs)));
      sessions.push(S('panel', nextTitle(), '', take(3), tracks[0] ? tracks[0].id : null));
      // Parallel block one
      const block1 = [];
      const usedInBlock = [];
      tracks.slice(0, Math.min(3, tracks.length)).forEach((tr, i) => {
        const sp = take(i === 0 && speakerIds.length > 6 ? 3 : 2, usedInBlock);
        usedInBlock.push.apply(usedInBlock, sp);
        block1.push(S(i === 2 ? 'case-study' : 'panel', nextTitle(), '', sp, tr.id));
      });
      if (block1.length > 1) sessions.push({ parallel: block1 }); else if (block1.length) sessions.push(block1[0]);
      // Parallel block two (workshop + panel + roundtable)
      const block2 = [];
      const used2 = [];
      const types2 = ['workshop', 'panel', options.roundtables ? 'roundtable' : 'panel'];
      tracks.slice(0, Math.min(3, tracks.length)).forEach((tr, i) => {
        const sp = take(2, used2);
        used2.push.apply(used2, sp);
        const type = types2[i % types2.length];
        const t = type === 'workshop' ? nextWorkshop() : type === 'roundtable' ? 'Closed-Door Roundtable: ' + nextTitle() : nextTitle();
        block2.push(S(type, t, type === 'roundtable' ? 'Under the Chatham House rule. Limited places; registration required.' : '', sp, tr.id));
      });
      if (block2.length > 1) sessions.push({ parallel: block2 }); else if (block2.length) sessions.push(block2[0]);
      sessions.push(S(isLast ? 'panel' : 'fireside', nextTitle(), '', take(isLast ? 3 : 2), tracks[tracks.length - 1] ? tracks[tracks.length - 1].id : null));
      if (isLast) sessions.push(S('closing', 'Closing Remarks and Chairs’ Synthesis', 'The chairs draw together the conclusions of the programme.', chairs));
      // Evening
      if (isFirst && !arrivalDay && options.welcomeReception) sessions.push(S('reception', 'Opening Reception', 'Hosted by the Platinum partner.', [], null, { time: '18:00', duration: 120 }));
      const galaDay = fullDays >= 2 ? fullDays - 2 : 0;
      if (options.gala && d === galaDay && !(isFirst && !arrivalDay && options.welcomeReception && fullDays === 1)) sessions.push(S('gala', 'Conference Gala Dinner', 'The conference dinner, hosted by the Gala dinner partner. Dress code: lounge suit or national dress.', [], null, { time: '19:00', duration: 180 }));
      program.push({ label: dayLabels[d] || ('Day ' + (d + 1)), sessions });
    }

    if (workshopDay) {
      const block = [];
      const used = [];
      tracks.slice(0, Math.min(3, tracks.length)).forEach((tr) => {
        const sp = take(2, used);
        used.push.apply(used, sp);
        block.push(S('masterclass', nextWorkshop().replace(/^Workshop: /, 'Masterclass: '), 'A half-day working session with a take-home toolkit.', sp, tr.id, { duration: 180 }));
      });
      const sessions = [];
      if (block.length > 1) sessions.push({ parallel: block }); else if (block.length) sessions.push(block[0]);
      if (options.excursion) sessions.push(S('excursion', 'Optional Cultural Programme', 'A guided afternoon programme for registered delegates and guests. Places are limited.', [], null, { time: '13:00', duration: 300 }));
      program.push({ label: 'Masterclasses' + (options.excursion ? ' & Cultural Programme' : ''), sessions });
    }

    // Registration
    const base = Number(brief.basePrice) || theme.basePrice || 1795;
    const fx = { USD: 1, EUR: 0.92, GBP: 0.8, SGD: 1.35, AUD: 1.5, CAD: 1.36, CHF: 0.9, HKD: 7.8, JPY: 150, AED: 3.67, DKK: 6.9, SEK: 10.5, NOK: 10.8, INR: 84, ZAR: 18, NZD: 1.65, KRW: 1350 }[currency] || 1;
    const step = currency === 'JPY' || currency === 'KRW' || currency === 'INR' ? 1000 : 5;
    const p = (mult) => roundTo(base * mult * fx, step);
    const registration = {
      currency,
      open: brief.registrationOpen !== false,
      tiers: [
        { name: 'Early bird', price: p(0.85), until: addDays(start, -60) },
        { name: 'Standard', price: p(1), until: addDays(start, -14) },
        { name: 'Late and on-site', price: p(1.15), until: end },
      ],
      special: [
        { name: 'In-house counsel and compliance officers', price: p(0.75), note: 'Employed by a non-law-firm organisation' },
        { name: 'Regulators, central banks and academics', price: p(0.5) },
      ].concat(options.livestream ? [{ name: 'Livestream pass (plenary sessions only)', price: p(0.25) }] : []),
      includes: ['All conference sessions' + (workshopDay ? ' and one masterclass' : ''), options.welcomeReception ? 'Welcome reception' : null, options.gala ? 'Gala dinner' : null, 'Lunches and refreshments', 'Session slides and post-conference report', 'Delegate app with meeting scheduler'].filter(Boolean),
      groupDiscount: 'Groups of three or more from the same organisation receive 15 per cent off.',
    };

    // Hotels: a partner plan the organiser can turn into contracts
    const hotelRate = (mult) => formatMoney(roundTo(base * mult * fx, step === 5 ? 5 : step), currency);
    const hotels = [
      { name: 'Headquarters hotel', category: 'Headquarters hotel', stars: 5, distance: 'On site or within 5 minutes of the venue', rate: 'Target delegate rate ' + hotelRate(0.14) + '–' + hotelRate(0.19) + ' per night', cutoff: addDays(start, -30), proposed: true,
        description: 'Recommended profile for ' + city.split(',')[0] + ': a five-star property with a block of at least ' + Math.max(40, Math.round(expected * 0.35)) + ' rooms, function space for the ' + (options.welcomeReception ? 'welcome reception' : 'opening reception') + (options.gala ? ' and gala dinner' : '') + ', and a rate that includes breakfast, Wi-Fi and airport transfers.', amenities: ['Breakfast included', 'Delegate lounge', 'Airport transfer'] },
      { name: 'Partner hotel', category: 'Partner hotel', stars: 4, distance: 'Within 10 minutes of the venue', rate: 'Target delegate rate ' + hotelRate(0.09) + '–' + hotelRate(0.12) + ' per night', cutoff: addDays(start, -21), proposed: true,
        description: 'A four-star business hotel with a block of around ' + Math.max(25, Math.round(expected * 0.25)) + ' rooms, generous work desks and a complimentary shuttle during conference hours.', amenities: ['Breakfast included', 'Conference shuttle'] },
      { name: 'Value option', category: 'Value option', stars: 3, distance: 'Within 15 minutes of the venue', rate: 'Target delegate rate ' + hotelRate(0.06) + '–' + hotelRate(0.08) + ' per night', cutoff: addDays(start, -21), proposed: true,
        description: 'A well-run three- or four-star hotel with a block of around ' + Math.max(15, Math.round(expected * 0.15)) + ' rooms for delegates travelling on tighter budgets.', amenities: ['Breakfast available'] },
    ];

    const conf = {
      id, generated: true, createdAt: new Date().toISOString(),
      series: brief.series || title, title, edition,
      themeId: theme.id, themeName: theme.name, customTheme: theme.custom ? theme : undefined,
      tagline: brief.tagline || (theme.short ? theme.short.replace(/\.$/, '') + '.' : 'A programme for practitioners in ' + theme.name.toLowerCase() + '.'),
      summary: brief.summary || (nDays + ' day' + (nDays > 1 ? 's' : '') + ' in ' + city.split(',')[0] + ' for ' + (theme.audiences || []).slice(0, 3).map((a) => a.toLowerCase()).join(', ') + ' on ' + theme.name.toLowerCase() + '.'),
      description: brief.description && brief.description.length ? (Array.isArray(brief.description) ? brief.description : [brief.description]) : [
        theme.description,
        'The ' + edition + ' edition runs over ' + nDays + ' day' + (nDays > 1 ? 's' : '') + (brief.venue ? ' at ' + brief.venue : '') + ' in ' + city + (country ? ', ' + country : '') + '. The programme combines keynotes, structured panels, workshops' + (options.roundtables ? ', closed-door roundtables' : '') + (workshopDay ? ' and half-day masterclasses' : '') + ', organised around ' + tracks.length + ' tracks: ' + tracks.map((t) => t.name).join(', ') + '.',
        'Sessions are designed around the questions delegates face in practice. Speakers are asked to bring frameworks, precedents and checklists rather than commentary, and every workshop produces a toolkit that delegates take home.',
      ],
      start, end, timezone: brief.timezone || timezoneFor(country), city, country, region,
      venue: { name: brief.venue || 'Venue to be confirmed', address: brief.venueAddress || (city + (country ? ', ' + country : '')), description: brief.venueDescription || ('Venue selection in ' + city.split(',')[0] + ' should provide a plenary hall for ' + expected + ' delegates, at least ' + Math.min(3, tracks.length) + ' breakout rooms and an exhibition area.'), rooms: brief.venueRooms || [] },
      palette: [theme.color || '#1F3A5F', shade(theme.color || '#1F3A5F', -0.45)],
      format: options.livestream ? 'In person, with a livestream pass for plenary sessions' : 'In person',
      expected, hashtag: brief.hashtag || ('#OOO' + initials(title) + year.slice(2)),
      tracks, chairs, program, autofill: false,
      speakers, speakerIds,
      hotels, sponsors: brief.sponsors || [],
      sponsorship: defaultSponsorship({ expected, sponsorship: { currency } }),
      sponsorCategories: theme.sponsorCategories || [],
      audiences: theme.audiences || [],
      registration,
      cfp: { open: brief.cfpOpen !== false, deadline: addDays(start, -90), note: 'Proposals of up to 300 words are invited from practitioners, regulators and academics. Sponsor proposals are considered separately.' },
      highlights: [
        tracks.length + ' tracks across ' + fullDays + ' full day' + (fullDays > 1 ? 's' : ''),
        options.roundtables ? 'Closed-door roundtables under the Chatham House rule' : null,
        workshopDay ? 'Half-day masterclasses with take-home toolkits' : 'Practical workshops with take-home toolkits',
        options.welcomeReception ? (options.gala ? 'Welcome reception and gala dinner' : 'Welcome reception') : (options.gala ? 'Gala dinner' : null),
        options.livestream ? 'Livestream pass for delegates who cannot travel' : null,
      ].filter(Boolean),
      faq: [
        { q: 'Who should attend?', a: (theme.audiences || []).join(', ') + '.' },
        { q: 'What is the dress code?', a: 'Business casual for sessions' + (options.gala ? ' and lounge suit or national dress for the gala dinner' : '') + '.' },
        { q: 'Are group rates available?', a: registration.groupDiscount },
      ],
    };
    return conf;
  }

  function initials(title) {
    return String(title || '').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(and|of|the|for|in|&)$/i.test(w)).map((w) => w[0].toUpperCase()).join('').slice(0, 4);
  }

  function shade(hex, amount) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
    return '#' + [f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Validation of externally produced conference objects (AI output)    */
  /* ------------------------------------------------------------------ */
  function sanitiseConference(conf) {
    if (!conf || typeof conf !== 'object') throw new Error('Conference must be an object');
    const out = Object.assign({}, conf);
    out.id = slugify(out.id || out.title || 'conference');
    out.title = String(out.title || 'Untitled conference');
    if (!parseDate(out.start)) throw new Error('Invalid start date');
    out.end = parseDate(out.end) ? out.end : out.start;
    out.program = Array.isArray(out.program) ? out.program.map((d) => ({ label: String(d.label || ''), sessions: (Array.isArray(d.sessions) ? d.sessions : []).map(sanitiseSession).filter(Boolean) })) : [];
    out.tracks = Array.isArray(out.tracks) ? out.tracks.map((t) => ({ id: slugify(t.id || t.name), name: String(t.name || ''), description: String(t.description || '') })) : [];
    out.speakers = normaliseSpeakers(out.speakers);
    out.speakerIds = out.speakers.map((s) => s.id);
    out.chairs = Array.isArray(out.chairs) ? out.chairs.filter((c) => typeof c === 'string') : [];
    out.hotels = Array.isArray(out.hotels) ? out.hotels : [];
    out.sponsors = Array.isArray(out.sponsors) ? out.sponsors : [];
    out.highlights = Array.isArray(out.highlights) ? out.highlights.map(String) : [];
    out.description = Array.isArray(out.description) ? out.description.map(String) : out.description ? [String(out.description)] : [];
    return out;
  }

  function sanitiseSession(s) {
    if (!s || typeof s !== 'object') return null;
    if (Array.isArray(s.parallel)) {
      const members = s.parallel.map(sanitiseSession).filter(Boolean);
      return members.length ? { parallel: members } : null;
    }
    const type = DURATIONS[s.type] ? s.type : 'panel';
    const out = { type, title: String(s.title || TYPE_LABELS[type] || 'Session'), abstract: String(s.abstract || ''), speakers: Array.isArray(s.speakers) ? s.speakers.filter((x) => typeof x === 'string') : [], track: s.track ? String(s.track) : null };
    if (s.time && timeToMinutes(s.time) !== null) out.time = s.time;
    if (s.duration && Number(s.duration) > 0) out.duration = Math.min(600, Number(s.duration));
    if (s.room) out.room = String(s.room);
    return out;
  }

  return {
    hash, rng, shuffle, slugify, parseDate, isoDate, addDays, daysBetween, formatDate, formatRange, weekday, todayIso,
    minutesToTime, timeToMinutes, formatMoney, fill, regionFor, currencyFor, timezoneFor,
    status, daysUntil, schedule, layoutDay, countSessions, allSpeakerIds, registrationState, sponsorship, defaultSponsorship,
    bioFor, plan, resolveTheme, normaliseSpeakers, sanitiseConference, initials, shade,
    DURATIONS, TYPE_LABELS, CONTENT_TYPES, EVENING_TYPES, TIER_BENEFITS,
  };
});
