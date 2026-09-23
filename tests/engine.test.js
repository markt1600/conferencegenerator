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
  assert.strictEqual(conf.speakers.filter((s) => s.supplied).length, 6, 'six supplied speakers kept');
  assert.strictEqual(conf.speakers.length, Engine.defaultFacultyTarget(5), 'faculty filled to the target');
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

test('plan(): a single supplied speaker is kept prominent and the faculty is filled with proposed placeholders', () => {
  const conf = Engine.plan({ theme: 'financial-services-regulatory-compliance', start: '2029-12-01', end: '2029-12-01', city: 'Bangkok', country: 'Thailand', speakers: [{ name: 'Somchai Prasert', title: 'Head of Compliance', org: 'Siam Example Bank', linkedin: 'https://www.linkedin.com/in/somchai-example' }] }, { themes: MLS.THEMES });
  assert.strictEqual(conf.speakers.length, Engine.defaultFacultyTarget(1));
  const supplied = conf.speakers.filter((s) => s.supplied);
  assert.strictEqual(supplied.length, 1);
  assert.strictEqual(supplied[0].name, 'Somchai Prasert');
  assert.ok(conf.speakers.filter((s) => s.proposed).length === conf.speakers.length - 1, 'others are proposed placeholders');
  assert.strictEqual(conf.chairs[0], supplied[0].id, 'supplied speaker chairs');
  const sched = Engine.schedule(conf, MLS.THEMES.find((t) => t.id === conf.themeId));
  const appearances = sched[0].flat.filter((s) => (s.speakers || []).indexOf(supplied[0].id) >= 0);
  assert.ok(appearances.some((s) => s.type === 'keynote'), 'supplied speaker gives the opening keynote');
  assert.ok(appearances.length >= 2, 'supplied speaker appears at least twice, got ' + appearances.length);
  const tba = sched[0].flat.filter((s) => Engine.CONTENT_TYPES.indexOf(s.type) >= 0 && !s.auto && s.type !== 'networking' && !(s.speakers || []).length);
  assert.strictEqual(tba.length, 0, 'no sessions left without speakers');
  const names = new Set(conf.speakers.map((s) => s.name));
  assert.strictEqual(names.size, conf.speakers.length, 'no duplicate names');
});

test('plan(): speakers flagged chair: true are the only chairs', () => {
  const conf = Engine.plan({ theme: 'privacy-data-protection', start: '2028-03-07', end: '2028-03-08', city: 'Amsterdam', country: 'Netherlands',
    speakers: [{ name: 'Not A Chair', title: 'General Counsel', org: 'Example NV' }, { name: 'The Chair', title: 'Partner', org: 'Chair LLP', chair: true }, { name: 'Also Not' }] }, { themes: MLS.THEMES });
  const chair = conf.speakers.find((s) => s.name === 'The Chair');
  assert.deepStrictEqual(conf.chairs, [chair.id], 'only the flagged speaker chairs');
  assert.ok(conf.speakers.every((s) => !('chair' in s)), 'chair flag is not duplicated on speaker records');
  assert.strictEqual(conf.speakers.filter((s) => s.supplied).length, 3, 'unflagged speakers stay supplied');
  const sched = Engine.schedule(conf, MLS.THEMES.find((t) => t.id === conf.themeId));
  const opening = sched[0].flat.find((s) => s.type === 'opening');
  assert.deepStrictEqual(opening.speakers, [chair.id], 'the flagged chair opens the programme');
  const first = conf.speakers.find((s) => s.name === 'Not A Chair');
  assert.ok(sched[0].flat.some((s) => s.type === 'keynote' && s.speakers[0] === first.id), 'the first supplied speaker still gives the opening keynote');
});

test('plan(): suppliedChairs false keeps the supplied speaker prominent without making them chair', () => {
  const conf = Engine.plan({ theme: 'financial-services-regulatory-compliance', start: '2029-12-01', end: '2029-12-01', city: 'Bangkok', country: 'Thailand', suppliedChairs: false,
    speakers: [{ name: 'Somchai Prasert', title: 'Head of Compliance', org: 'Siam Example Bank', supplied: true }] }, { themes: MLS.THEMES });
  const supplied = conf.speakers.find((s) => s.supplied);
  assert.strictEqual(conf.chairs.length, 2, 'two placeholder chairs proposed');
  assert.ok(conf.chairs.indexOf(supplied.id) < 0, 'supplied speaker is not a chair');
  assert.ok(conf.chairs.every((id) => conf.speakers.find((s) => s.id === id).proposed), 'chairs are proposed placeholders');
  const sched = Engine.schedule(conf, MLS.THEMES.find((t) => t.id === conf.themeId));
  const appearances = sched[0].flat.filter((s) => (s.speakers || []).indexOf(supplied.id) >= 0);
  assert.ok(appearances.some((s) => s.type === 'keynote'), 'supplied speaker still gives the opening keynote');
  assert.ok(appearances.length >= 2, 'supplied speaker still appears at least twice');
  assert.ok(!appearances.some((s) => s.type === 'opening' || s.type === 'closing'), 'supplied speaker does not open or close');
});

test('plan(): suppliedChairs false with no faculty fill leaves the chairs to be confirmed', () => {
  const conf = Engine.plan({ theme: 'esg-climate', start: '2027-05-04', end: '2027-05-05', city: 'Oslo', country: 'Norway', fillFaculty: false, suppliedChairs: false, speakers: ['One Person'] }, { themes: MLS.THEMES });
  assert.deepStrictEqual(conf.chairs, []);
  const sched = Engine.schedule(conf, MLS.THEMES.find((t) => t.id === conf.themeId));
  const opening = sched[0].flat.find((s) => s.type === 'opening');
  assert.ok(opening && opening.speakers.length === 0, 'opening has no chairs yet');
  assert.ok(sched[0].flat.some((s) => s.type === 'keynote' && s.speakers[0] === conf.speakers[0].id), 'the supplied speaker still keynotes');
});

test('plan(): fillFaculty false keeps only supplied speakers', () => {
  const conf = Engine.plan({ theme: 'esg-climate', start: '2027-05-04', end: '2027-05-05', city: 'Oslo', country: 'Norway', fillFaculty: false, speakers: ['One Person'] }, { themes: MLS.THEMES });
  assert.strictEqual(conf.speakers.length, 1);
});

test('generateFaculty produces plausible, unique placeholder profiles', () => {
  const theme = MLS.THEMES.find((t) => t.id === 'financial-crime-compliance');
  const list = Engine.generateFaculty({ theme, count: 12, region: 'Asia-Pacific', seed: 'x' });
  assert.strictEqual(list.length, 12);
  list.forEach((s) => { assert.ok(s.name && s.title && s.org && s.location, JSON.stringify(s)); assert.strictEqual(s.proposed, true); assert.ok(s.expertise.length >= 1); });
  assert.strictEqual(new Set(list.map((s) => s.name)).size, 12);
  const again = Engine.generateFaculty({ theme, count: 12, region: 'Asia-Pacific', seed: 'x' });
  assert.deepStrictEqual(again.map((s) => s.name), list.map((s) => s.name), 'deterministic for a seed');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
