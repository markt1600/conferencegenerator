# OOO — Orient Occidental Organisers Pte Ltd

Conference website and organiser console for **OOO**, an independent Singapore-headquartered organiser of legal and compliance conferences (hosted at `ooo.sg`). Static site plus Vercel serverless functions, with a Claude-assisted **conference generator** in the organiser console.

> All organisations, venues, hotels, sponsors, speakers and quotes in the seed dataset are fictional and exist for demonstration.

## What is in the box

**Public site**
- Home page with the next conference front and centre (Legal Fintech Summit, Bali, 25–29 October 2026): live countdown, current pricing, speaker and session counts.
- 20 conferences: 16 past programmes (2024–2026, including six compliance-based programmes), one further upcoming programme with registration open (Compliance Officers’ Leadership Forum, London, November 2026) and two announced 2027 editions.
- For every conference: overview, day-by-day itinerary with parallel tracks, speakers, venue and partner hotels with delegate rates and cut-off dates, sponsorship prospectus with package availability, registration with pricing tiers, FAQ and (for past events) a recap.
- 64 speaker profiles with biographies, expertise and every programme appearance.
- Working web forms: registration, register-interest, hotel booking, sponsorship enquiry, general contact, speaker proposal, press, newsletter.
- Light and dark themes, phone to desktop layouts, printable programmes, add-to-calendar files.

**Organiser console** (`/admin`)
- Dashboard, conference table (view, edit, publish, unpublish, export), inbox of form submissions with CSV export, settings with environment status and an AI connection test.
- **Conference generator** (`/admin/generator`): choose a pre-selected theme (18 themes; six compliance-focused, including *Compliance Officers & Accountability in Financial Institutions*) or define a custom theme, set dates, location and venue, add speakers with optional LinkedIn profiles, then generate:
  - **Intelligent planning with Claude** — writes the concept, a bespoke programme for each day, draft speaker biographies from the details supplied, candidate hotels, a venue recommendation and a partnership plan.
  - **Instant planner** — a deterministic engine that builds the same structure offline from the theme’s session bank.
  - **Faculty fill**: supply one speaker or twenty. Supplied speakers are kept and given the chair and keynote slots; the rest of the programme is filled to a target size with proposed placeholder profiles (fictional names and organisations, shown as “Invited · confirmation pending” on the site) that you replace as confirmations arrive. Turn it off or change the target in the Speakers step.
  - **LinkedIn research**: with the Claude generator, each supplied speaker with a LinkedIn URL is researched using Anthropic’s web search and web fetch tools. The biography uses only facts found in public sources, each source is listed in the console for review, and the bio is marked as a draft pending the speaker’s approval. Without an API key, the bio is drafted from the details you typed.
  - Review every part, edit the JSON if needed, then save a draft (live in your browser) or publish to the site (visible to everyone, when a server store is configured). Pages, booking, hotel and sponsorship links are created automatically.

## Architecture

```
index.html, conferences.html, conference.html, agenda.html, register.html, hotels.html,
sponsor.html, sponsors.html, speakers.html, speaker.html, about.html, contact.html, 404.html
admin/index.html, admin/generator.html
assets/css/site.css, assets/css/admin.css
assets/js/data.js          organisation, theme library, speaker roster
assets/js/conferences.js   conference dataset (programmes, hotels, sponsors, pricing)
assets/js/engine.js        planning engine: scheduling, autofill, pricing, generator (browser + Node)
assets/js/store.js         data layer: seed + browser drafts + server store; form submissions
assets/js/ui.js            chrome, theme toggle, routing helpers, components
assets/js/pages.js         public page renderers
assets/js/admin.js         organiser console and generator wizard
api/health.js              GET  environment status
api/conferences.js         GET published conferences · POST publish · DELETE (admin)
api/submissions.js         POST form submission · GET/DELETE (admin)
api/generate.js            POST one Claude planning stage (admin)
api/_lib/ai.js             Claude stages, schemas, prompts
api/_lib/blobstore.js      Vercel Blob wrapper
scripts/dev.js             local server mirroring Vercel routing and functions
tests/                     engine and AI-plumbing tests (node)
vercel.json                clean URLs, rewrites, function limits, headers
```

Clean URLs: `/conferences/<id>`, `/conferences/<id>/agenda|register|hotels|sponsor`, `/speakers/<id>`. Pages read the id from the path and render from the merged dataset. `404.html` also recognises these paths and renders the intended page, so deep links work even when a rewrite is not applied.

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000 — static pages, rewrites and /api functions
npm test             # engine + AI plumbing tests
```

Create a `.env` file (ignored by git) to test the AI generator locally:

```
ANTHROPIC_API_KEY=sk-ant-...
ADMIN_PASSWORD=choose-a-passcode
```

## Deploy to Vercel

1. Import the repository in Vercel. Framework preset **Other**, no build command, output directory left as the project root.
2. Add environment variables (Settings → Environment Variables):

| Variable | Purpose | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | Enables Claude-assisted generation in the console. | For AI mode |
| `ANTHROPIC_MODEL` | Model id. Default `claude-opus-5`. | No |
| `ANTHROPIC_EFFORT` | Reasoning effort: `low`, `medium` (default), `high`, `xhigh`, `max`. | No |
| `ADMIN_PASSWORD` | Passcode for the console and the admin endpoints. | Strongly recommended |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store for published conferences and form submissions. Created automatically when you add a Blob store to the project (Storage → Create → Blob). | For publishing to all visitors |

3. Deploy. Add a custom domain (`ooo.sg`) in the project’s Domains settings.

Without a Blob store the site still works: generated conferences are kept as drafts in the organiser’s browser and form submissions are kept in the visitor’s browser (and listed in the console on that browser). Add the store to make publishing and the inbox shared.

## How the AI generator works

The console calls `POST /api/generate` once per stage so that no single request approaches the serverless time limit (`maxDuration` is 60 seconds in `vercel.json`):

1. `faculty` — when fewer speakers are supplied than the faculty target, proposes fictional placeholder profiles matched to the theme and region.
2. `concept` — title, tagline, summary, three-paragraph description, tracks, key topics, highlights, audiences, hashtag, FAQ.
3. `agenda` — one call per conference day; content sessions in running order with speaker assignments from the roster, supplied speakers first. The engine then inserts registration, breaks and lunch and lays out timings and rooms.
4. `research` — for supplied speakers with a LinkedIn URL (batches of four), uses the `web_search` and `web_fetch` server tools to collect facts with source URLs; resumes `pause_turn` automatically. Web searches are billed by Anthropic in addition to tokens.
5. `speakers` — draft biographies in batches of eight, written from the details supplied plus researched facts where available; nothing unsourced is added.
6. `partners` — candidate hotels marked as proposals, a venue suggestion when none was given, sponsor prospect categories and travel notes.

Each stage uses the Anthropic SDK with structured outputs (`output_config.format` from a Zod schema), adaptive thinking at the configured effort, prompt caching on the system prompt, and Anthropic’s server-side refusal fallbacks (`fallbacks: "default"`). If a stage fails, the console keeps the instant planner’s version of that part and continues. Everything the model returns is validated (`Engine.sanitiseConference`) before it is saved.

## Customising the dataset

- Organisation, offices, team and the About page copy: `MLS.ORG` in `assets/js/data.js`.
- Themes (tracks, session banks, sponsor categories, base pricing): `MLS.THEMES` in `assets/js/data.js`.
- Speakers: `MLS.SPEAKERS` in `assets/js/data.js`.
- Conferences: `assets/js/conferences.js`. Programmes are authored as sessions per day; timings, breaks and rooms are computed by the engine. Short authored days are extended from the theme’s session bank (`autofill`), which Bali disables.

## Notes and limitations

- Payments are not processed; registration submissions are received and an invoice or payment link is described as following by email.
- Form submissions stored in Vercel Blob are private blobs. For production use with personal data, a database with retention controls is recommended.
- Speaker biographies produced by the generator are marked as drafts pending speaker approval.
