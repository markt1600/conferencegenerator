'use strict';
/* Claude-powered conference planning. Each "stage" is one structured-output request so that no single
 * call approaches the serverless time limit:
 *   concept  -> title, tagline, description, tracks, key topics, highlights, FAQ
 *   agenda   -> one day's programme (called once per day by the console)
 *   speakers -> draft biographies for the supplied speakers (batches)
 *   partners -> candidate hotels, venue suggestion, sponsor prospects, travel notes
 *   test     -> connectivity check
 * Model defaults to claude-opus-5 (override with ANTHROPIC_MODEL); effort defaults to medium (ANTHROPIC_EFFORT). */
const Anthropic = require('@anthropic-ai/sdk');
const { z } = require('zod');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const EFFORT = () => process.env.ANTHROPIC_EFFORT || 'medium';

const SESSION_TYPES = ['opening', 'keynote', 'regulator-address', 'panel', 'fireside', 'debate', 'workshop', 'masterclass', 'roundtable', 'case-study', 'lightning', 'closing', 'networking', 'reception', 'gala', 'dinner', 'excursion', 'presentation'];

const SYSTEM = `You are the Programme Director of Orient Occidental Organisers (OOO), an independent, Singapore-headquartered organiser of legal and compliance conferences for regulators, in-house counsel, compliance officers and private practitioners across Asia-Pacific, Europe, the Americas, the Middle East and Africa.

House style:
- British English. Concrete, practitioner voice. Every session answers a question a delegate actually faces and names what they take away.
- No marketing superlatives ("world-class", "unparalleled", "cutting-edge"). No exclamation marks.
- Titles are specific and short. Abstracts are one or two sentences.
- Compliance programmes speak to the people who hold the compliance role: heads of compliance, MLROs, senior managers with regulatory responsibilities.
- Never invent facts about real, named people. Biographies rest only on the details supplied.
- Respect the organiser's independence: speaking places are editorial, partner sessions are labelled.

You return only the JSON the schema requires.`;

const ConceptSchema = z.object({
  title: z.string().describe('Conference title. If the brief supplies a title, repeat it exactly.'),
  edition: z.string().describe('Edition label, normally "<City> <Year>".'),
  tagline: z.string().describe('At most 18 words.'),
  summary: z.string().describe('One or two sentences (at most 60 words) saying who it is for and what it covers.'),
  description: z.array(z.string()).describe('Three paragraphs of 80-140 words: why now (accurate regulatory context for the year), how the programme is structured, the experience and audience.'),
  tracks: z.array(z.object({ name: z.string(), description: z.string() })).describe('Three to five tracks with one-sentence descriptions.'),
  keyTopics: z.array(z.string()).describe('Eight to twelve specific, session-worthy topics.'),
  highlights: z.array(z.string()).describe('Four to six programme highlights.'),
  audiences: z.array(z.string()).describe('Four to six delegate roles.'),
  hashtag: z.string().describe('Like #OOO<Initials><YY>.'),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).describe('Three to five practical questions and answers appropriate to the destination.'),
});

const SessionSchema = z.object({
  type: z.enum(SESSION_TYPES),
  title: z.string(),
  abstract: z.string(),
  speakerIds: z.array(z.string()).describe('Ids from the supplied roster only.'),
  trackId: z.string().nullable().describe('A track id for track sessions; null for plenaries and social events.'),
  time: z.string().nullable().describe('HH:MM start time for fixed or evening events only; otherwise null.'),
  durationMinutes: z.number().int().nullable().describe('Null to use defaults.'),
});
const AgendaSchema = z.object({
  label: z.string().describe('Short editorial label for the day, e.g. "Regulation Catches Up".'),
  items: z.array(z.object({ parallel: z.boolean(), sessions: z.array(SessionSchema) })).describe('Running order. A non-parallel item has exactly one session; a parallel item has one session per track running at the same time.'),
});

const SpeakersSchema = z.object({
  speakers: z.array(z.object({
    id: z.string(),
    bio: z.string().describe('Two or three sentences, 45-80 words, third person, based only on supplied details.'),
    expertise: z.array(z.string()).describe('Three to five short tags.'),
    location: z.string().nullable(),
  })),
});

const PartnersSchema = z.object({
  hotels: z.array(z.object({
    name: z.string(),
    category: z.enum(['Headquarters hotel', 'Partner hotel', 'Value option', 'Boutique option']),
    stars: z.number().int(),
    distance: z.string(),
    rateEstimate: z.string().describe('A typical corporate rate range in the brief currency, marked as an estimate.'),
    description: z.string(),
    amenities: z.array(z.string()),
    note: z.string(),
  })),
  venueSuggestion: z.object({ name: z.string(), description: z.string(), address: z.string() }).nullable(),
  sponsorProspects: z.array(z.object({ category: z.string(), rationale: z.string(), exampleTypes: z.array(z.string()) })),
  travelNotes: z.array(z.object({ q: z.string(), a: z.string() })),
});

function client(apiKeyOverride) {
  const apiKey = apiKeyOverride || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('The AI generator is not configured. Add ANTHROPIC_API_KEY to the Vercel project environment variables.');
    err.code = 'ai_unconfigured'; err.status = 503;
    throw err;
  }
  return new Anthropic({ apiKey, timeout: 55000, maxRetries: 1 });
}

function fence(label, obj) {
  return '<' + label + '>\n' + JSON.stringify(obj, null, 1) + '\n</' + label + '>';
}

async function structured(c, schema, prompt, maxTokens) {
  const stream = c.beta.messages.stream({
    model: MODEL(),
    max_tokens: maxTokens || 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: EFFORT(), format: zodOutputFormat(schema) },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') {
    const err = new Error('The model declined this request' + (msg.stop_details && msg.stop_details.category ? ' (' + msg.stop_details.category + ')' : '') + '.');
    err.status = 422; throw err;
  }
  if (msg.stop_reason === 'max_tokens') {
    const err = new Error('The response was cut off before it finished. Try again or reduce the size of the request.');
    err.status = 502; throw err;
  }
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  let json;
  try { json = JSON.parse(text); }
  catch (_) { const err = new Error('The model returned malformed JSON.'); err.status = 502; throw err; }
  const parsed = schema.safeParse(json);
  if (!parsed.success) { const err = new Error('The model response did not match the expected structure: ' + parsed.error.issues.slice(0, 3).map((i) => i.path.join('.') + ' ' + i.message).join('; ')); err.status = 502; throw err; }
  return { data: parsed.data, usage: { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens, cache_read_input_tokens: msg.usage.cache_read_input_tokens || 0 }, model: msg.model };
}

/* ---------------- Stages ---------------- */
async function concept(c, payload) {
  const brief = payload.brief || {};
  const prompt = `Design the concept for a conference.

${fence('brief', brief)}

Requirements:
- If brief.title is non-empty, use it exactly as the title. Edition is "<City> <Year>" unless brief.edition is supplied.
- The theme object describes the editorial focus; where it is marked compliance: true, address the people who hold compliance positions in financial institutions (heads of compliance, MLROs, senior managers with regulatory responsibilities) as well as their advisers.
- description: three paragraphs. Paragraph one explains why this topic matters in ${brief.year || 'the conference year'} with accurate regulatory context for the region; if unsure of a specific instrument, describe the development without naming it. Paragraph two explains how the programme is structured over ${brief.nDays || 'the'} day(s): tracks, session formats (keynotes, panels, workshops${brief.options && brief.options.roundtables ? ', closed-door roundtables' : ''}${brief.nDays >= 4 ? ', half-day masterclasses' : ''}). Paragraph three describes the destination, venue, social programme and who is in the room.
- tracks: three to five. Start from brief.theme.defaultTracks when present and adapt them to the city, region and year. Keep names under eight words.
- keyTopics: eight to twelve specific topics that could each become a session; reflect the region and the year.
- highlights: four to six; audiences: four to six roles; faq: three to five practical questions (entry requirements, time zone, dress code, livestream, group discounts) answered for this destination and format.
- hashtag: #OOO followed by the title initials and the two-digit year.`;
  return structured(c, ConceptSchema, prompt, 6000);
}

async function agenda(c, payload) {
  const conf = payload.conference || {};
  const day = payload.day || {};
  const roster = payload.speakers || [];
  const used = payload.usedTitles || [];
  const rules = day.kind === 'arrival'
    ? '- This is the arrival day. Return only the fixed events supplied in day.fixedEvents, each as a non-parallel item with the same type, title, time and durationMinutes. Do not add sessions.'
    : day.kind === 'masterclass'
      ? '- This is the masterclass day. Return one parallel item containing two or three "masterclass" sessions (durationMinutes 180) on different tracks, each with a specific title starting "Masterclass:" and a two-sentence abstract naming the toolkit delegates take home; then the fixed events from day.fixedEvents (e.g. an excursion) as non-parallel items with their times preserved.'
      : `- This is a full conference day. Return seven to nine items in running order:
  ${day.isFirstFull ? '1. an "opening" by the chairs (durationMinutes 15), then ' : ''}a "keynote" (one speaker, plenary), a plenary "panel" (three or four speakers), a parallel item with one session per track (two or three sessions mixing "panel", "case-study" and "workshop"), a second parallel item (mix of "workshop", "panel" and, if brief options allow, a "roundtable" described as closed-door under the Chatham House rule), a plenary "fireside" or "debate" or "panel"${day.isLastFull ? ', and finally a "closing" by the chairs (durationMinutes 30)' : ''}.
- Every track appears at least once during the day. Plenaries have trackId null.
- Then append the fixed events from day.fixedEvents as non-parallel items, preserving type, title, time and durationMinutes exactly.`;
  const prompt = `Write the programme for one day of the conference.

${fence('conference', conf)}
${fence('day', day)}
${fence('speaker_roster', roster)}
${fence('titles_already_used', used)}

Rules:
- Do not include registration, coffee breaks or lunch; the scheduler inserts them.
${rules}
- Titles: specific, at most 14 words, never generic ("Panel discussion", "Session 1"). Abstracts: one or two sentences (25-45 words) stating the question the session answers and what delegates take away. Do not repeat any title in titles_already_used.
- speakerIds: use ids from speaker_roster only. Keynote: one speaker. Fireside: two. Panel: three or four. Workshop and masterclass: one or two. Case study: one. Roundtable: two or three. Opening and closing: the chairs (conference.chairIds). Match speakers to their expertise; nobody appears twice within one parallel item; spread appearances evenly and do not overuse the chairs. If the roster is empty, use empty arrays.
- time: null for all sessions except the fixed events supplied. durationMinutes: null for defaults, except where stated.
- label: a short editorial label for the day (two to four words).`;
  return structured(c, AgendaSchema, prompt, 8000);
}

async function speakers(c, payload) {
  const prompt = `Write draft speaker biographies for the conference website.

${fence('conference', payload.conference || {})}
${fence('speakers', payload.speakers || [])}

Rules:
- One entry per supplied speaker, using the same id.
- Two or three sentences (45-80 words), third person, British English. Base the biography only on the details supplied: name, title, organisation, location, notes and the sessions they are speaking in. Do not invent employers, career history, education, awards, cases, clients or years of experience. Where only a name is supplied, write one or two neutral sentences about the perspective they bring to their sessions.
- A LinkedIn URL is a reference for the organiser only; do not describe or infer its contents.
- expertise: three to five short tags consistent with the title and sessions. location: copy the supplied location or return null.`;
  return structured(c, SpeakersSchema, prompt, 8000);
}

async function partners(c, payload) {
  const brief = payload.brief || {};
  const prompt = `Propose the hotel and partnership plan for the conference.

${fence('brief', brief)}

Rules:
- hotels: three or four candidate properties in ${brief.city || 'the host city'} that suit senior legal delegates and are close to the venue (or to the business district if the venue is unknown): one "Headquarters hotel" (five-star, with function space for a reception), one or two "Partner hotel" (four-star business hotels) and one "Value option". Name real, well-known properties only when you are confident they exist and operate there; otherwise describe the recommended profile in place of a name (e.g. "Five-star property on the waterfront"). distance: an estimate from the venue. rateEstimate: a typical corporate rate range in ${brief.currency || 'USD'}, explicitly marked as an estimate. description: two sentences on why it suits the delegation. amenities: three to five. note: "Candidate only - availability and delegate rate to be negotiated."
- venueSuggestion: if brief.venue is null, propose one suitable venue with a one-paragraph description and address (a real venue only when confident); otherwise null.
- sponsorProspects: six to eight categories of organisation likely to partner with this programme, each with a rationale tied to the audience and two or three example types. No company names.
- travelNotes: four or five practical questions and answers: entry requirements in general terms, time zone, airport and transfers, climate and dress code for the dates, local payment and etiquette.`;
  return structured(c, PartnersSchema, prompt, 6000);
}

async function test(c) {
  const started = Date.now();
  const msg = await c.beta.messages.create({
    model: MODEL(), max_tokens: 32,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
  });
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return { data: { reply: text, latencyMs: Date.now() - started }, usage: msg.usage, model: msg.model };
}

const STAGES = { concept, agenda, speakers, partners, test };

async function runStage(stage, payload, apiKeyOverride, injectedClient) {
  const fn = STAGES[stage];
  if (!fn) { const err = new Error('Unknown stage: ' + stage); err.status = 400; throw err; }
  const c = injectedClient || client(apiKeyOverride);
  return fn(c, payload || {});
}

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return { status: 401, error: 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.' };
  if (err instanceof Anthropic.PermissionDeniedError) return { status: 403, error: 'The API key does not have permission for this model.' };
  if (err instanceof Anthropic.NotFoundError) return { status: 404, error: 'Model not found: ' + MODEL() + '. Check ANTHROPIC_MODEL.' };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, error: 'Rate limited by the API. Wait a moment and try again.' };
  if (err instanceof Anthropic.BadRequestError) return { status: 400, error: 'The API rejected the request: ' + err.message };
  if (err instanceof Anthropic.APIConnectionTimeoutError) return { status: 504, error: 'The request timed out. Try again; long programmes are generated one day at a time.' };
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, error: 'Could not reach the Anthropic API: ' + err.message };
  if (err instanceof Anthropic.APIError) return { status: err.status || 502, error: 'API error: ' + err.message };
  return { status: err.status || 500, error: err.message || 'Generation failed', code: err.code };
}

module.exports = { runStage, describeError, SESSION_TYPES, MODEL, EFFORT, schemas: { ConceptSchema, AgendaSchema, SpeakersSchema, PartnersSchema } };
