'use strict';
/* Web form submissions (contact, registration, sponsorship, hotel bookings, speaker proposals, press, newsletter).
 * POST is public. GET lists submissions for the organiser console (admin passcode when set).
 * Submissions are stored as private blobs when a Vercel Blob store is configured; otherwise the browser keeps them locally. */
const { send, body, requireAdmin, methodNotAllowed } = require('./_lib/util');
const store = require('./_lib/blobstore');

const KINDS = ['contact', 'registration', 'register-interest', 'sponsorship', 'hotel-booking', 'speaker-proposal', 'press', 'newsletter'];

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const data = body(req);
    const kind = KINDS.indexOf(data.kind) >= 0 ? data.kind : 'contact';
    const record = {
      id: String(data.id || ('sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7))).replace(/[^a-z0-9_]/gi, '').slice(0, 40),
      kind,
      data: data.data && typeof data.data === 'object' ? data.data : {},
      page: String(data.page || '').slice(0, 200),
      createdAt: new Date().toISOString(),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    };
    if (JSON.stringify(record).length > 20000) return send(res, 413, { error: 'Submission too large' });
    if (!store.configured()) return send(res, 200, { ok: true, stored: 'none', record });
    try {
      await store.putJson('submissions/' + record.createdAt.slice(0, 10) + '_' + record.kind + '_' + record.id + '.json', record, 'private');
      return send(res, 200, { ok: true, stored: 'server', record });
    } catch (err) {
      return send(res, 200, { ok: true, stored: 'none', record, warning: 'Server store unavailable: ' + String(err.message || err) });
    }
  }

  if (req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    if (!store.configured()) return send(res, 200, { configured: false, submissions: [] });
    try {
      const items = await store.listJson('submissions/', 'private');
      const submissions = items.map((i) => Object.assign({ _pathname: i.pathname }, i.value)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return send(res, 200, { configured: true, submissions });
    } catch (err) {
      return send(res, 500, { error: 'Could not read submissions', detail: String(err.message || err) });
    }
  }

  if (req.method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    if (!store.configured()) return send(res, 503, { error: 'No server store configured' });
    const pathname = String((req.query && req.query.pathname) || '');
    if (!pathname.startsWith('submissions/') || pathname.includes('..')) return send(res, 400, { error: 'Invalid pathname' });
    try { await store.remove(pathname); return send(res, 200, { ok: true }); }
    catch (err) { return send(res, 500, { error: 'Could not delete submission', detail: String(err.message || err) }); }
  }

  return methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
};
