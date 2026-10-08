import { supabase, API_BASE_URL } from './config.js';

// Uploads for the admin app. The server signs a Cloudflare R2 PUT URL and the
// browser pushes the bytes straight to R2, so files never transit Express.
//
// Unlike the member dashboard there is no Supabase Storage fallback: site
// assets are images and video, which is exactly why R2 exists. If R2 is not
// configured the upload fails with a message that says so, rather than
// quietly filling Supabase's 1GB.

export async function uploadFile(file, kind = 'site') {
  if (!file) throw new Error('No file selected.');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Your session expired. Please sign in again.');

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
    throw new Error('Could not reach the upload API. Check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data.error || 'That upload was rejected.');
  if (data.ok === false) {
    throw new Error(data.code === 'R2_NOT_CONFIGURED'
      ? 'Cloudflare R2 is not configured on the API, so files cannot be uploaded yet.'
      : 'The API could not start the upload.');
  }
  if (!data.url) throw new Error('The API did not return an upload URL.');

  const put = await fetch(data.url, {
    method: 'PUT',
    headers: { 'Content-Type': data.contentType || file.type || 'application/octet-stream' },
    body: file
  });
  if (!put.ok) throw new Error('The upload did not complete. Please try again.');

  return data.publicUrl;
}
