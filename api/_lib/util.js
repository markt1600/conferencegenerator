'use strict';
const crypto = require('crypto');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function body(req) {
  const b = req.body;
  if (b === undefined || b === null) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (_) { return {}; } }
  if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString('utf8')); } catch (_) { return {}; } }
  return b;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* Admin protection: when ADMIN_PASSWORD is set, admin endpoints require a matching x-admin-token header. */
function adminState() {
  return { protected: !!process.env.ADMIN_PASSWORD };
}

function requireAdmin(req, res) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true; // unprotected deployment; the console shows a warning
  const token = req.headers['x-admin-token'] || '';
  if (safeEqual(token, pw)) return true;
  send(res, 401, { error: 'Admin passcode required', code: 'admin_required' });
  return false;
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  send(res, 405, { error: 'Method not allowed' });
}

module.exports = { send, body, requireAdmin, adminState, methodNotAllowed, safeEqual };
