'use strict';
/* Published conferences. GET is public and returns everything published from the organiser console.
 * POST publishes (or updates) a conference; DELETE removes one. Both require the admin passcode when set. */
const { send, body, requireAdmin, methodNotAllowed } = require('./_lib/util');
const store = require('./_lib/blobstore');
const Engine = require('../assets/js/engine.js');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    if (!store.configured()) return send(res, 200, { configured: false, conferences: [] });
    try {
      const items = await store.listJson('conferences/', 'public');
      const conferences = items.map((i) => i.value).filter((c) => c && c.id && c.start);
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=300');
      return send(res, 200, { configured: true, conferences });
    } catch (err) {
      return send(res, 500, { error: 'Could not read the conference store', detail: String(err.message || err) });
    }
  }

  if (req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    if (!store.configured()) return send(res, 503, { error: 'No server store configured. Add a Vercel Blob store (BLOB_READ_WRITE_TOKEN) to publish for all visitors; the console keeps drafts in this browser meanwhile.', code: 'store_unconfigured' });
    const data = body(req);
    let conf;
    try { conf = Engine.sanitiseConference(data.conference); }
    catch (err) { return send(res, 400, { error: 'Invalid conference: ' + err.message }); }
    if (!/^[a-z0-9-]{3,80}$/.test(conf.id)) return send(res, 400, { error: 'Invalid conference id' });
    conf.publishedAt = new Date().toISOString();
    conf.updatedAt = conf.publishedAt;
    conf.generated = true;
    try {
      await store.putJson('conferences/' + conf.id + '.json', conf, 'public');
      return send(res, 200, { ok: true, conference: conf });
    } catch (err) {
      return send(res, 500, { error: 'Could not write to the conference store', detail: String(err.message || err) });
    }
  }

  if (req.method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    if (!store.configured()) return send(res, 503, { error: 'No server store configured', code: 'store_unconfigured' });
    const id = String((req.query && req.query.id) || '');
    if (!/^[a-z0-9-]{3,80}$/.test(id)) return send(res, 400, { error: 'Invalid conference id' });
    try {
      await store.remove('conferences/' + id + '.json');
      return send(res, 200, { ok: true, id });
    } catch (err) {
      return send(res, 500, { error: 'Could not delete from the conference store', detail: String(err.message || err) });
    }
  }

  return methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
};
