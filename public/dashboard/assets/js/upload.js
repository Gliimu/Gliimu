import { supabase, API_BASE_URL } from '/shared/js/config.js';
import { store } from './store.js';

// One upload path for every file the dashboard sends. The server signs a
// Cloudflare R2 PUT URL and the browser pushes the bytes straight to R2, so
// media never transits Express. While R2 is unconfigured the server answers
// R2_NOT_CONFIGURED and we fall back to Supabase Storage, which keeps uploads
// working through the migration.

const FALLBACK_BUCKET = {
  avatar: 'avatars',
  media: 'media',
  library: 'media',
  chat: 'chat_attachments',
  deal: 'deal_logos',
  site: 'site_assets'
};

// Sticky for the session: once the server says R2 is missing, don't ask again
// on every upload.
let r2Unavailable = false;

// Returns the signed PUT, or null when the server has no R2 configured.
// Throws only on a real rejection (bad type, oversize, signed out) so the
// caller can show the message.
async function presign(kind, file) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');

  let res;
  try {
    res = await fetch(`${API_BASE_URL}/api/upload/presign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        kind,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        filename: file.name
      })
    });
  } catch (e) {
    return null; // API unreachable — Supabase Storage still is
  }

  const data = await res.json().catch(() => ({}));

  if (res.status >= 400 && res.status < 500) {
    throw new Error(data.error || 'That upload was rejected.');
  }
  if (!res.ok) return null;
  if (data.ok === false || !data.url) return null;
  return data;
}

async function supabaseFallback(kind, file) {
  const bucket = FALLBACK_BUCKET[kind] || 'media';
  const who = (store.user && store.user.id) || 'anon';
  const path = `${who}/${Date.now()}_${file.name}`;
  const { error } = await supabase.storage.from(bucket)
    .upload(path, file, { cacheControl: '3600', upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// Uploads a file and resolves with its public URL.
// kind: 'media' | 'library' | 'avatar' | 'chat' | 'deal' | 'site'
export async function uploadFile(file, kind = 'media') {
  if (!file) throw new Error('No file selected.');

  if (!r2Unavailable) {
    const signed = await presign(kind, file);
    if (signed) {
      const put = await fetch(signed.url, {
        method: 'PUT',
        headers: { 'Content-Type': signed.contentType || file.type || 'application/octet-stream' },
        body: file
      });
      if (!put.ok) throw new Error('The upload did not complete. Please try again.');
      return signed.publicUrl;
    }
    r2Unavailable = true;
  }

  return supabaseFallback(kind, file);
}
