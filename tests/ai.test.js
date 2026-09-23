/* Tests the Claude stage plumbing with a fake client: schema generation, parsing, refusal and truncation handling. */
const assert = require('assert');
const path = require('path');
const ai = require(path.join(__dirname, '..', 'api', '_lib', 'ai.js'));
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok  ', name); }
  catch (e) { failed++; console.log('  FAIL', name, '\n       ', e.message); }
}

function fakeClient(reply, stopReason) {
  const calls = [];
  return {
    calls,
    beta: { messages: {
      stream(params) {
        calls.push(params);
        return { finalMessage: async () => ({ stop_reason: stopReason || 'end_turn', stop_details: stopReason === 'refusal' ? { category: 'cyber' } : null, model: params.model, content: [{ type: 'text', text: typeof reply === 'string' ? reply : JSON.stringify(reply) }], usage: { input_tokens: 100, output_tokens: 50 } }) };
      },
      async create(params) { calls.push(params); return { stop_reason: 'end_turn', model: params.model, content: [{ type: 'text', text: 'OK' }], usage: { input_tokens: 10, output_tokens: 1 } }; },
    } },
  };
}

(async () => {
  console.log('\nAI stage tests');

  await test('every stage schema converts to an Anthropic json_schema output format', () => {
    for (const [name, schema] of Object.entries(ai.schemas)) {
      const fmt = zodOutputFormat(schema);
      assert.strictEqual(fmt.type, 'json_schema', name);
      assert.strictEqual(fmt.schema.type, 'object', name);
      assert.strictEqual(fmt.schema.additionalProperties, false, name);
    }
  });

  await test('concept stage sends the brief, uses structured output, fallbacks and the configured model', async () => {
    const reply = { title: 'T', edition: 'Hong Kong 2027', tagline: 'x', summary: 'y', description: ['a', 'b', 'c'], tracks: [{ name: 'A', description: '' }], keyTopics: ['k'], highlights: ['h'], audiences: ['a'], hashtag: '#OOOT27', faq: [{ q: 'q', a: 'a' }] };
    const c = fakeClient(reply);
    const r = await ai.runStage('concept', { brief: { title: 'T', year: '2027', nDays: 3 } }, null, c);
    assert.strictEqual(r.data.edition, 'Hong Kong 2027');
    const p = c.calls[0];
    assert.strictEqual(p.model, 'claude-opus-5');
    assert.deepStrictEqual(p.betas, ['server-side-fallback-2026-07-01']);
    assert.strictEqual(p.fallbacks, 'default');
    assert.strictEqual(p.output_config.format.type, 'json_schema');
    assert.strictEqual(p.output_config.effort, 'medium');
    assert.ok(p.system[0].cache_control, 'system prompt is cached');
    assert.ok(p.messages[0].content.includes('"title": "T"'), 'brief is passed to the model');
    assert.strictEqual(r.usage.output_tokens, 50);
  });

  await test('agenda stage validates the session structure', async () => {
    const reply = { label: 'Day', items: [{ parallel: false, sessions: [{ type: 'keynote', title: 'K', abstract: 'a', speakerIds: ['x'], trackId: null, time: null, durationMinutes: null }] }, { parallel: true, sessions: [{ type: 'panel', title: 'P1', abstract: '', speakerIds: [], trackId: 't1', time: null, durationMinutes: null }, { type: 'workshop', title: 'W', abstract: '', speakerIds: [], trackId: 't2', time: null, durationMinutes: 90 }] }] };
    const r = await ai.runStage('agenda', { conference: {}, day: { kind: 'full' }, speakers: [] }, null, fakeClient(reply));
    assert.strictEqual(r.data.items.length, 2);
    assert.strictEqual(r.data.items[1].sessions[1].durationMinutes, 90);
  });

  await test('invalid session type is rejected as a structure error', async () => {
    const reply = { label: 'Day', items: [{ parallel: false, sessions: [{ type: 'party', title: 'K', abstract: 'a', speakerIds: [], trackId: null, time: null, durationMinutes: null }] }] };
    await assert.rejects(() => ai.runStage('agenda', {}, null, fakeClient(reply)), /did not match the expected structure/);
  });

  await test('refusal and truncation stop reasons become clear errors', async () => {
    await assert.rejects(() => ai.runStage('speakers', {}, null, fakeClient('{}', 'refusal')), /declined/);
    await assert.rejects(() => ai.runStage('speakers', {}, null, fakeClient('{"speakers": [', 'max_tokens')), /cut off/);
  });

  await test('malformed JSON is reported', async () => {
    await assert.rejects(() => ai.runStage('partners', {}, null, fakeClient('not json')), /malformed JSON/);
  });

  await test('test stage uses a tiny non-streaming call', async () => {
    const c = fakeClient();
    const r = await ai.runStage('test', {}, null, c);
    assert.strictEqual(r.data.reply, 'OK');
    assert.strictEqual(c.calls[0].max_tokens, 32);
  });

  await test('unknown stage and missing key are rejected', async () => {
    await assert.rejects(() => ai.runStage('nope', {}, null, fakeClient({})), /Unknown stage/);
    const saved = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    await assert.rejects(() => ai.runStage('test', {}), /not configured/);
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  });

  await test('describeError maps SDK errors to HTTP statuses', () => {
    const Anthropic = require('@anthropic-ai/sdk');
    const e = new Anthropic.AuthenticationError(401, { error: { message: 'bad key' } }, 'bad key', new Headers());
    assert.strictEqual(ai.describeError(e).status, 401);
    assert.strictEqual(ai.describeError(new Error('boom')).status, 500);
  });

  await test('faculty stage validates placeholder profiles', async () => {
    const reply = { speakers: [{ name: 'Test Person', title: 'Head of Compliance', org: 'Northbridge Bank', location: 'Bangkok, Thailand', expertise: ['AML'], bio: 'Two sentences. Here.' }] };
    const r = await ai.runStage('faculty', { brief: { region: 'Asia-Pacific' }, count: 1, existing: [] }, null, fakeClient(reply));
    assert.strictEqual(r.data.speakers[0].org, 'Northbridge Bank');
  });

  await test('research stage uses web tools, resumes pause_turn and keeps only sourced facts', async () => {
    const calls = [];
    let n = 0;
    const c = { beta: { messages: { stream(params) { calls.push(params); n++;
      const paused = n === 1;
      return { finalMessage: async () => ({ stop_reason: paused ? 'pause_turn' : 'end_turn', model: params.model, usage: { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 2 } },
        content: paused ? [{ type: 'server_tool_use', id: 'x', name: 'web_search', input: { query: 'q' } }] : [
          { type: 'web_search_tool_result', tool_use_id: 'x', content: [{ type: 'web_search_result', url: 'https://example.com/bio', title: 'Bio' }] },
          { type: 'text', text: 'Here is the result:\n```json\n{"speakers":[{"id":"ada","found":true,"headline":"Head of Compliance, Example Bank","facts":[{"text":"Leads compliance at Example Bank","source":"https://example.com/bio"},{"text":"unsourced claim","source":"none"}],"sources":["https://example.com/bio"],"note":null}]}\n```' }] }) }; } } } };
    const r = await ai.runStage('research', { speakers: [{ id: 'ada', name: 'Ada', linkedin: 'https://www.linkedin.com/in/ada' }] }, null, c);
    assert.strictEqual(calls.length, 2, 'resumed after pause_turn');
    assert.strictEqual(calls[1].messages.length, 2, 'assistant turn appended for the resume');
    assert.deepStrictEqual(calls[0].tools.map((t) => t.type), ['web_search_20260209', 'web_fetch_20260209']);
    assert.strictEqual(r.data.speakers[0].found, true);
    assert.strictEqual(r.data.speakers[0].facts.length, 1, 'unsourced fact dropped');
    assert.strictEqual(r.usage.web_searches, 4);
  });

  await test('research stage degrades gracefully when the reply is not JSON', async () => {
    const r = await ai.runStage('research', { speakers: [{ id: 'x', name: 'X', linkedin: 'https://www.linkedin.com/in/x' }] }, null, fakeClient('I could not find anything useful.'));
    assert.strictEqual(r.data.speakers[0].found, false);
    assert.ok(/could not be read/.test(r.data.speakers[0].note));
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
})();
