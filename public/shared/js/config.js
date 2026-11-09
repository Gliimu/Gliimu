import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://vsgvscemqtqgolrindcx.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_5csTtIuipKucVlYncRGG0Q_VrokRdoD';

// Session storage: cookies scoped to .gliimu.com so every subdomain shares one
// login. localStorage is used only where cookies are unavailable (probed below),
// and a one-time migration moves an old localStorage session into the cookie.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // 400 days, the longest browsers honour — Supabase Auth governs real token validity
const CHUNK_SIZE = 3180; // keeps name + attributes inside the 4096-byte per-cookie cap

const IS_GLIIMU_HOST = window.location.hostname === 'gliimu.com' || window.location.hostname.endsWith('.gliimu.com');

function cookieEnabled() {
  try {
    document.cookie = 'gliimu_storage_probe=1; path=/; samesite=lax';
    const ok = document.cookie.split('; ').includes('gliimu_storage_probe=1');
    document.cookie = 'gliimu_storage_probe=; path=/; max-age=0';
    return ok;
  } catch {
    return false;
  }
}

const cookieMode = cookieEnabled();

function cookieAttrs(maxAge) {
  let attrs = `path=/; max-age=${maxAge}; samesite=lax; secure`;
  if (IS_GLIIMU_HOST) attrs += '; domain=.gliimu.com';
  return attrs;
}

function readCookie(name) {
  const found = document.cookie.split('; ').find(c => c.startsWith(name + '='));
  return found ? found.slice(name.length + 1) : null;
}

function writeCookie(name, value) {
  document.cookie = `${name}=${value}; ${cookieAttrs(COOKIE_MAX_AGE)}`;
}

function eraseCookie(name) {
  document.cookie = `${name}=; ${cookieAttrs(0)}`;
}

function existingNames(key) {
  return document.cookie.split('; ')
    .map(c => c.slice(0, c.indexOf('=')))
    .filter(name => name && (name === key || name.startsWith(key + '.')));
}

// btoa is Latin-1 only; route UTF-8 through percent-encoding first, then use
// the cookie-safe base64url alphabet. The prefix marks a value as encoded.
function encode(value) {
  return 'base64-' + btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(encoded) {
  if (!encoded.startsWith('base64-')) return encoded;
  let b64 = encoded.slice(7).replace(/-/g, '+').replace(/_/g, '/');
  b64 += '='.repeat((4 - (b64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(b64)));
}

function readValue(key) {
  try {
    const single = readCookie(key);
    if (single !== null) return decode(single);
    const parts = [];
    for (let i = 0; ; i++) {
      const part = readCookie(`${key}.${i}`);
      if (part === null) break;
      parts.push(part);
    }
    return parts.length ? decode(parts.join('')) : null;
  } catch {
    return null;
  }
}

function writeValue(key, value) {
  const encoded = encode(value);
  const previous = existingNames(key);
  const fresh = [];
  if (encoded.length <= CHUNK_SIZE) {
    writeCookie(key, encoded);
    fresh.push(key);
  } else {
    encoded.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'g')).forEach((part, i) => {
      const name = `${key}.${i}`;
      writeCookie(name, part);
      fresh.push(name);
    });
  }
  for (const name of previous) {
    if (!fresh.includes(name)) eraseCookie(name);
  }
}

const gliimuStorage = {
  async getItem(key) {
    if (cookieMode) {
      const value = readValue(key);
      if (value !== null) return value;
      const legacy = localStorage.getItem(key);
      if (legacy === null) return null;
      writeValue(key, legacy);
      if (readValue(key) === legacy) localStorage.removeItem(key);
      return legacy;
    }
    return localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (cookieMode) writeValue(key, value);
    else localStorage.setItem(key, value);
  },
  async removeItem(key) {
    for (const name of existingNames(key)) eraseCookie(name);
    localStorage.removeItem(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: gliimuStorage },
});

// Backend API URL (Replace with your actual Render URL)
export const API_BASE_URL = 'https://gliimu-api.onrender.com';
