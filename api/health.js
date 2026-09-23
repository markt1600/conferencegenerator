'use strict';
const { send, adminState } = require('./_lib/util');
const store = require('./_lib/blobstore');

module.exports = async (req, res) => {
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
  send(res, 200, {
    ok: true,
    ai: { configured: !!process.env.ANTHROPIC_API_KEY, model, effort: process.env.ANTHROPIC_EFFORT || 'medium' },
    store: { configured: store.configured(), kind: 'vercel-blob' },
    admin: adminState(),
    time: new Date().toISOString(),
  });
};
