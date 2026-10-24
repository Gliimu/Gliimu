import { supabase, API_BASE_URL } from '/shared/js/config.js';

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
        reject(new Error('The upload did not complete. Please try again.'));
      }
    };
    
    xhr.onerror = () => reject(new Error('The upload failed. Please try again.'));
    xhr.send(file);
  });
}
