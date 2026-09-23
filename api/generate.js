'use strict';
/* POST /api/generate  { stage, payload }
 * Runs one stage of Claude-assisted conference planning (see _lib/ai.js). Requires the admin passcode when set.
 * Uses ANTHROPIC_API_KEY from the environment; an organiser may pass a session-only key in x-anthropic-key. */
const { send, body, requireAdmin, methodNotAllowed } = require('./_lib/util');
const ai = require('./_lib/ai');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireAdmin(req, res)) return;
  const data = body(req);
  const stage = String(data.stage || '');
  const override = req.headers['x-anthropic-key'] ? String(req.headers['x-anthropic-key']).trim() : '';
  if (!process.env.ANTHROPIC_API_KEY && !override) {
    return send(res, 503, { error: 'The AI generator is not configured. Add ANTHROPIC_API_KEY to the Vercel project environment variables, or enter a session key in the console settings.', code: 'ai_unconfigured' });
  }
  const started = Date.now();
  try {
    const result = await ai.runStage(stage, data.payload, override || undefined);
    return send(res, 200, { ok: true, stage, data: result.data, usage: result.usage, model: result.model, ms: Date.now() - started });
  } catch (err) {
    const d = ai.describeError(err);
    console.error('[generate]', stage, d.status, err && err.message);
    return send(res, d.status, { error: d.error, code: d.code, stage });
  }
};
