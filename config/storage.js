// Storage abstraction for case images.
//
// Prod: uploads to a PRIVATE Supabase Storage bucket via its REST API using the
//       service-role key (kept server-side only). Reads return short-lived
//       signed URLs. No extra npm package — uses Node's built-in fetch.
// Dev:  if Supabase env vars are missing, files are saved to ./uploads and
//       served statically from /uploads (see main.js). Mirrors how
//       db_connection.js switches between Render/Supabase and local.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || 'images';

const useSupabase = Boolean(SUPABASE_URL && SERVICE_KEY);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_ROOT = path.join(__dirname, '..', 'uploads');

// encode each path segment but keep the "/" separators intact
function encodePath(objectPath) {
  return objectPath.split('/').map(encodeURIComponent).join('/');
}

async function uploadBuffer({ buffer, objectPath, contentType }) {
  if (useSupabase) {
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodePath(objectPath)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': contentType || 'application/octet-stream',
        'cache-control': '3600',
        'x-upsert': 'true',
      },
      body: buffer,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase upload failed (${res.status}): ${text}`);
    }
    return objectPath;
  }

  const full = path.join(LOCAL_ROOT, objectPath);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, buffer);
  return objectPath;
}

async function getSignedUrl(objectPath, expiresIn = 3600) {
  if (useSupabase) {
    const url = `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${encodePath(objectPath)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase sign failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    const signed = data.signedURL || data.signedUrl; // API casing has varied
    return `${SUPABASE_URL}/storage/v1${signed}`;
  }

  const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 1000}`;
  return `${base}/uploads/${encodePath(objectPath)}`;
}

async function removeObject(objectPath) {
  if (useSupabase) {
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodePath(objectPath)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase delete failed (${res.status}): ${text}`);
    }
    return;
  }

  const full = path.join(LOCAL_ROOT, objectPath);
  await fs.promises.rm(full, { force: true });
}

export default { uploadBuffer, getSignedUrl, removeObject, useSupabase, LOCAL_ROOT };
