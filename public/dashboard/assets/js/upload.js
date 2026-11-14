import { supabase, API_BASE_URL } from '/shared/js/config.js?v=2';

// One upload path for every file the dashboard sends. The server signs a
// Cloudflare R2 PUT URL and the browser pushes the bytes straight to R2, so
// media never transits Express.

// Sticky for the session: once the server says R2 is missing, don't ask again
// on every upload.
let r2Unavailable = false;

// Returns the signed PUT.
// Throws only on a real rejection (bad type, oversize, signed out) so the
// caller can show the message.
async function presign(kind, file) {
  // Refresh the session to avoid 401s on long-running pages (like live chats).
  await supabase.auth.refreshSession();
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
    throw new Error('Upload service is unreachable. Please try again.');
  }

  const data = await res.json().catch(() => ({}));

  if (res.status >= 400 && res.status < 500) {
    throw new Error(data.error || 'That upload was rejected.');
  }
  if (!res.ok) throw new Error('Upload failed. Please try again.');
  if (data.ok === false || !data.url) throw new Error('Upload service is not configured.');
  return data;
}

// R2 answers a PUT it rejects with an XML error body and *no* CORS headers, so
// the browser treats the rejection as a CORS failure: `status` 0 and nothing
// readable. Both shapes are reported here, with the evidence in the console.
function storageError(xhr, signed) {
  const body = String(xhr.responseText || '');
  const code = (body.match(/<Code>([^<]*)<\/Code>/) || [])[1];
  const detail = (body.match(/<Message>([^<]*)<\/Message>/) || [])[1];
  console.error('[upload] storage rejected the PUT', {
    key: signed.key,
    status: xhr.status,
    code: code || '(hidden by CORS)',
    message: detail || ''
  });
  if (code) return new Error(`Storage rejected the file: ${code}${detail ? ` — ${detail}` : ''}`);
  if (!xhr.status) {
    return new Error('Storage rejected the file and hid the reason from the browser. '
      + 'Try again; if it repeats, the console names the failed request.');
  }
  return new Error(`Storage rejected the file (HTTP ${xhr.status}).`);
}

// Uploads a file and resolves with its public URL.
// kind: 'media' | 'library' | 'avatar' | 'chat' | 'site'
// onProgress: optional callback(percent) where percent is 0-100
export async function uploadFile(file, kind = 'media', onProgress = null) {
  if (!file) throw new Error('No file selected.');

  const signed = await presign(kind, file);
  
  // Use XMLHttpRequest for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signed.url);
    xhr.setRequestHeader('Content-Type', signed.contentType || file.type || 'application/octet-stream');
    
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve(signed.publicUrl);
      } else {
        reject(storageError(xhr, signed));
      }
    };
    
    xhr.onerror = () => reject(storageError(xhr, signed));
    xhr.send(file);
  });
}
