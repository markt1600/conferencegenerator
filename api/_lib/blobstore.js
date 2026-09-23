'use strict';
/* Thin wrapper over Vercel Blob for the two collections the site persists:
 *   conferences/<id>.json   (public — read by every visitor)
 *   submissions/<id>.json   (private — read only by the organiser console)
 * Nothing here runs unless BLOB_READ_WRITE_TOKEN is configured. */

function configured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function sdk() {
  return require('@vercel/blob');
}

async function putJson(pathname, value, access) {
  const { put } = sdk();
  const res = await put(pathname, JSON.stringify(value), {
    access: access || 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
  return res;
}

async function listJson(prefix, access) {
  const { list, get } = sdk();
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      try {
        let text;
        if (access === 'private') {
          const r = await get(blob.pathname, { access: 'private', useCache: false });
          if (!r || r.statusCode !== 200) continue;
          text = await new Response(r.stream).text();
        } else {
          const resp = await fetch(blob.url + '?t=' + Date.now(), { cache: 'no-store' });
          if (!resp.ok) continue;
          text = await resp.text();
        }
        const value = JSON.parse(text);
        out.push({ pathname: blob.pathname, url: blob.url, uploadedAt: blob.uploadedAt, value });
      } catch (_) { /* skip unreadable blob */ }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

async function remove(pathname) {
  const { del } = sdk();
  await del(pathname);
}

module.exports = { configured, putJson, listJson, remove };
