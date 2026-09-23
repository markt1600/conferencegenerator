/* Node test suite for the planning engine. Run: npm test */
const assert = require('assert');
const path = require('path');

require(path.join(__dirname, '..', 'assets', 'js', 'data.js'));
require(path.join(__dirname, '..', 'assets', 'js', 'conferences.js'));
const Engine = require(path.join(__dirname, '..', 'assets', 'js', 'engine.js'));
const MLS = globalThis.MLS;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ', name); }
  catch (e) { failed++; console.log('  FAIL', name, '\n       ', e.message); }
}
const themeOf = (c) => MLS.THEMES.find((t) => t.id === c.themeId);
const NOW = new Date('2026-09-23T10:00:00Z');

console.log('\nEngine tests');

test('formatRange handles same-month, cross-month and cross-year ranges', () => {
  assert.strictEqual(Engine.formatRange('2026-10-25', '2026-10-29'), '25–29 October 2026');
  assert.strictEqual(Engine.formatRange('2026-01-30', '2026-02-02'), '30 January – 2 February 2026');
  assert.strictEqual(Engine.formatRange('2026-12-30', '2027-01-02'), '30 December 2026 – 2 January 2027');
  assert.strictEqual(Engine.formatRange('2026-05-01', '2026-05-01'), '1 May 2026');
});

test('weekday: 25 October 2026 is a Sunday', () => {
  assert.strictEqual(Engine.weekday('2026-10-25'), 'Sunday');
});

test('status classification against the dataset', () => {
  const byId = Object.fromEntries(MLS.CONFERENCES.map((c) => [c.id, c]));
  assert.strictEqual(Engine.status(byId['legal-fintech-summit-bali-2026'], NOW), 'upcoming');
  assert.strictEqual(Engine.status(byId['compliance-officers-leadership-forum-2026'], NOW), 'upcoming');
  assert.strictEqual(Engine.status(byId['international-arbitration-summit-2027'], NOW), 'announced');
  assert.strictEqual(Engine.status(byId['global-financial-crime-compliance-summit-2026'], NOW), 'past');
  const past = MLS.CONFERENCES.filter((c) => Engine.status(c, NOW) === 'past');
  assert.ok(past.length >= 10, 'at least ten past conferences, got ' + past.length);
  const compliancePast = past.filter((c) => themeOf(c).compliance);
  assert.ok(compliancePast.length >= 5, 'several past compliance conferences, got ' + compliancePast.length);
});

test('Bali schedule: five days, arrival day has no auto registration, fixed evening events keep their times', () => {
  const conf = MLS.CONFERENCES.find((c) => c.id === 'legal-fintech-summit-bali-2026');
  const sched = Engine.schedule(conf, themeOf(conf));
  assert.strictEqual(sched.length, 5);
  assert.strictEqual(sched[0].date, '2026-10-25');
  assert.strictEqual(sched[4].date, '2026-10-29');
  assert.ok(!sched[0].flat.some((s) => s.auto), 'arrival day must not get auto items');
  const reception = sched[0].flat.find((s) => s.type === 'reception');
  assert.strictEqual(reception.start, '18:30');
  const reg = sched[1].flat.find((s) => s.type === 'registration');
  assert.strictEqual(reg.start, '08:00');
  assert.ok(sched[1].flat.some((s) => s.type === 'lunch'), 'day one has lunch');
  const gala = sched[2].flat.find((s) => s.type === 'gala');
  assert.strictEqual(gala.start, '19:00');
});

test('Parallel blocks share a start time and get distinct rooms', () => {
  const conf = MLS.CONFERENCES.find((c) => c.id === 'legal-fintech-summit-bali-2026');
  const sched = Engine.schedule(conf, themeOf(conf));
  const block = sched[1].slots.find((s) => s.parallel);
  assert.ok(block, 'has a parallel block');
  assert.strictEqual(block.parallel.length, 3, 'three sessions run side by side');
  assert.strictEqual(sched[1].slots.filter((s) => s.parallel).length, 2, 'day one has exactly two parallel blocks');
  const starts = new Set(block.parallel.map((s) => s.start));
  assert.strictEqual(starts.size, 1);
  const rooms = new Set(block.parallel.map((s) => s.room));
  assert.strictEqual(rooms.size, block.parallel.length);
});

test('No overlapping non-parallel sessions within a day', () => {
  for (const conf of MLS.CONFERENCES) {
    const sched = Engine.schedule(conf, themeOf(conf));
    for (const day of sched) {
      const seq = day.slots.filter((s) => !s.parallel && Engine.EVENING_TYPES.indexOf(s.type) < 0);
      for (let i = 1; i < seq.length; i++) {
        assert.ok(seq[i].startMin >= seq[i - 1].endMin, conf.id + ' ' + day.label + ': ' + seq[i - 1].title + ' overlaps ' + seq[i].title);
      }
    }
  }
});

test('Autofill lengthens short authored days to a full working day without duplicating titles', () => {
  const conf = MLS.CONFERENCES.find((c) => c.id === 'healthcare-pharma-regulatory-conference-2026');
  const sched = Engine.schedule(conf, themeOf(conf));
  for (const day of sched) {
    assert.ok(day.lastEnd >= 16 * 60, day.label + ' ends at ' + Engine.minutesToTime(day.lastEnd));
    const titles = day.flat.map((s) => s.title.toLowerCase());
    assert.strictEqual(new Set(titles).size, titles.length, 'duplicate titles in ' + day.label);
    const filled = day.flat.filter((s) => s.filled);
    filled.forEach((s) => assert.ok(s.speakers.length > 0, 'filled session has speakers'));
    const closingIdx = day.flat.findIndex((s) => s.type === 'closing');
    if (closingIdx >= 0) {
      const after = day.flat.slice(closingIdx + 1).filter((s) => Engine.EVENING_TYPES.indexOf(s.type) < 0);
      assert.strictEqual(after.length, 0, 'closing must be the last daytime session');
    }
  }
});

test('Bali is not autofilled (autofill: false honoured via program authoring)', () => {
  const conf = MLS.CONFERENCES.find((c) => c.id === 'legal-fintech-summit-bali-2026');
  const sched = Engine.schedule(Object.assign({}, conf, { autofill: false }), themeOf(conf));
  assert.ok(!sched.some((d) => d.flat.some((s) => s.filled)));
});

test('registrationState marks early bird closed and standard current on 23 Sept 2026', () => {
  const conf = MLS.CONFERENCES.find((c) => c.id === 'legal-fintech-summit-bali-2026');
  const st = Engine.registrationState(conf, NOW);
  assert.strictEqual(st.open, true);
  assert.strictEqual(st.tiers[0].state, 'closed');
  assert.strictEqual(st.tiers[1].state, 'current');
  assert.strictEqual(st.tiers[2].state, 'upcoming');
  assert.strictEqual(st.current.price, 1950);
  assert.strictEqual(Engine.formatMoney(st.current.price, 'USD'), '$1,950');
});

test('daysUntil Bali from 23 Sept 2026 is 32', () => {
  const conf = MLS.CONFERENCES.find((c) => c.id === 'legal-fintech-summit-bali-2026');
  assert.strictEqual(Engine.daysUntil(conf, NOW), 32);
});

test('plan(): five-day compliance conference with arrival day, three full days and masterclasses', () => {
  const conf = Engine.plan({
    theme: 'financial-crime-compliance', start: '2027-02-08', end: '2027-02-12', city: 'Hong Kong', country: 'Hong Kong SAR', expected: 350,
    speakers: [
      { name: 'Ada Lovelace', title: 'Head of Financial Crime', org: 'Example Bank', linkedin: 'linkedin.com/in/ada' },
      { name: 'Grace Hopper', title: 'Partner', org: 'Hopper LLP' },
      'Alan Turing', 'Katherine Johnson', 'Mary Jackson', 'Dorothy Vaughan',
    ],
  }, { themes: MLS.THEMES });
  assert.strictEqual(conf.program.length, 5);
  assert.strictEqual(conf.program[0].label, 'Arrival & Welcome');
  assert.ok(/Masterclasses/.test(conf.program[4].label));
  assert.strictEqual(conf.currency, undefined);
  assert.strictEqual(conf.registration.currency, 'HKD');
  assert.strictEqual(conf.region, 'Asia-Pacific');
  assert.strictEqual(conf.speakers.length, 6);
  assert.strictEqual(conf.speakers[0].linkedin, 'https://linkedin.com/in/ada');
  assert.strictEqual(conf.chairs.length, 2);
  assert.strictEqual(conf.hotels.length, 3);
  assert.ok(conf.hotels.every((h) => h.proposed));
  assert.strictEqual(conf.registration.tiers[0].until, '2026-12-10');
  assert.ok(conf.id.startsWith('global-financial-crime-compliance-summit-2027-hong-kong'));
  const sched = Engine.schedule(conf, MLS.THEMES.find((t) => t.id === conf.themeId));
  assert.strictEqual(sched.length, 5);
  assert.ok(Engine.countSessions(sched) >= 20, 'rich programme, got ' + Engine.countSessions(sched));
  // Every content session with speakers references a generated speaker id
  const ids = new Set(conf.speakers.map((s) => s.id));
  sched.forEach((d) => d.flat.forEach((s) => (s.speakers || []).forEach((id) => assert.ok(ids.has(id), 'unknown speaker ' + id))));
  // Full days end at a reasonable hour
  sched.slice(1, 4).forEach((d) => assert.ok(d.lastEnd >= 15 * 60 + 30 && d.lastEnd <= 18 * 60 + 30, d.label + ' ends ' + Engine.minutesToTime(d.lastEnd)));
});

test('plan(): one-day custom theme with no speakers still produces a coherent day', () => {
  const conf = Engine.plan({ theme: { name: 'Space Law & Satellite Regulation', tracks: ['Licensing', 'Liability'] }, start: '2027-06-01', city: 'Luxembourg', country: 'Luxembourg' }, { themes: MLS.THEMES });
  assert.strictEqual(conf.program.length, 1);
  assert.strictEqual(conf.registration.currency, 'EUR');
  assert.strictEqual(conf.tracks.length, 2);
  assert.ok(conf.customTheme && conf.customTheme.custom);
  const sched = Engine.schedule(conf, conf.customTheme);
  assert.ok(sched[0].flat.some((s) => s.type === 'keynote'));
  assert.ok(sched[0].flat.some((s) => s.type === 'closing'));
  assert.ok(/Space Law/.test(sched[0].flat.find((s) => s.type === 'keynote').title));
});

test('plan(): rejects invalid dates', () => {
  assert.throws(() => Engine.plan({ theme: 'esg-climate', start: 'not-a-date', city: 'Oslo' }, { themes: MLS.THEMES }));
});

test('sanitiseConference cleans an untrusted structure', () => {
  const out = Engine.sanitiseConference({ id: 'Weird ID!!', title: 'Test', start: '2027-01-01', program: [{ label: 'D1', sessions: [{ type: 'nonsense', title: 'X', speakers: ['a', 5] }, { parallel: [{ type: 'panel', title: 'P' }] }, null] }], speakers: [{ name: 'Someone', linkedin: 'www.linkedin.com/in/x' }] });
  assert.strictEqual(out.id, 'weird-id');
  assert.strictEqual(out.program[0].sessions.length, 2);
  assert.strictEqual(out.program[0].sessions[0].type, 'panel');
  assert.deepStrictEqual(out.program[0].sessions[0].speakers, ['a']);
  assert.strictEqual(out.speakers[0].linkedin, 'https://www.linkedin.com/in/x');
});

test('bioFor falls back to a templated bio', () => {
  const bio = Engine.bioFor({ name: 'Test Person', title: 'Head of Compliance', org: 'Acme Bank', location: 'Zurich', expertise: ['AML', 'Sanctions'] });
  assert.ok(bio.startsWith('Test Person is Head of Compliance at Acme Bank, based in Zurich.'));
  assert.ok(/aml and sanctions/.test(bio));
});

test('defaultSponsorship scales with attendance and formats in currency', () => {
  const sp = Engine.defaultSponsorship({ expected: 600, sponsorship: { currency: 'GBP' } });
  assert.strictEqual(sp.tiers[0].name, 'Platinum');
  assert.ok(sp.tiers[0].price > sp.tiers[1].price);
  assert.strictEqual(Engine.formatMoney(sp.tiers[0].price, 'GBP').charAt(0), '£');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
