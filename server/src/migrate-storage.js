// Manual .env loader (no dotenv dependency needed)
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valParts] = line.split('=');
      if (key && valParts.length) {
        process.env[key.trim()] = valParts.join('=').trim();
      }
    }
  });
}

const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'gliimu';
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

const BUCKETS = ['avatars', 'chat_attachments', 'media', 'site_assets'];
const SUPABASE_BASE = `${SUPABASE_URL}/storage/v1/object/public`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!R2_ACCOUNT_ID || !R2_KEY_ID || !R2_SECRET || !R2_PUBLIC_BASE) {
  console.error('Missing R2 env vars in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_KEY_ID, secretAccessKey: R2_SECRET }
});

async function listAll(bucket) {
  const { data, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
  if (error) throw new Error(`List ${bucket}: ${error.message}`);
  const files = [];
  for (const item of (data || [])) {
    if (item.id) {
      files.push(item.name);
    } else {
      const sub = await supabase.storage.from(bucket).list(item.name, { limit: 1000 });
      for (const f of (sub.data || [])) {
        files.push(`${item.name}/${f.name}`);
      }
    }
  }
  return files;
}

async function migrateFile(bucket, path) {
  const { data: fileData, error: dlErr } = await supabase.storage.from(bucket).download(path);
  if (dlErr) throw new Error(`Download ${bucket}/${path}: ${dlErr.message}`);
  const buffer = Buffer.from(await fileData.arrayBuffer());

  const key = `${bucket}/${path}`;
  const contentType = guessType(path);
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType
  }));
  return `${R2_PUBLIC_BASE}/${key}`;
}

function guessType(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'video/webm', mp4: 'video/mp4',
    pdf: 'application/pdf', json: 'application/json'
  };
  return map[ext] || 'application/octet-stream';
}

async function updateDbUrls(bucket) {
  const oldBase = `${SUPABASE_BASE}/${bucket}/`;
  const newBase = `${R2_PUBLIC_BASE}/${bucket}/`;

  const urlColumns = [
    { table: 'profiles', columns: ['avatar_url', 'portfolio_image_url'] },
    { table: 'feed_gliims', columns: ['cover_url', 'media_url'] },
    { table: 'feed_items', columns: ['cover_url', 'file_url', 'audio_url'] },
    { table: 'feed_submissions', columns: ['cover_url', 'file_url', 'audio_url'] },
    { table: 'site_settings', columns: ['hero_video_url', 'hero_fallback_image_url', 'squad_bg_url', 'app_download_bg_url'] },
    { table: 'messages', columns: ['file_url'] },
    { table: 'support_messages', columns: ['body'] },
    { table: 'partners', columns: ['logo_url', 'website_url'] },
    { table: 'feed_contents', columns: ['blocks', 'files'] },
    { table: 'feed_gliim_contents', columns: ['blocks'] },
  ];

  for (const { table, columns } of urlColumns) {
    for (const col of columns) {
      try {
        const { data: rows, error } = await supabase.from(table).select(`id, ${col}`).not(col, 'is', null);
        if (error || !rows) continue;
        for (const row of rows) {
          const val = row[col];
          if (typeof val === 'string' && val.includes(oldBase)) {
            const newVal = val.replace(new RegExp(oldBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newBase);
            await supabase.from(table).update({ [col]: newVal }).eq('id', row.id);
            console.log(`  Updated ${table}.id=${row.id} ${col}`);
          } else if (typeof val === 'string' && val.includes(SUPABASE_BASE) && val.includes(`/${bucket}/`)) {
            const newVal = val.replace(new RegExp(oldBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newBase);
            await supabase.from(table).update({ [col]: newVal }).eq('id', row.id);
            console.log(`  Updated ${table}.id=${row.id} ${col}`);
          }
        }
      } catch (e) {
        // Table or column might not exist, skip silently
      }
    }
  }
}

async function main() {
  console.log('=== Supabase Storage → Cloudflare R2 Migration ===\n');

  let totalFiles = 0;
  let totalUpdated = 0;

  for (const bucket of BUCKETS) {
    console.log(`\n--- Bucket: ${bucket} ---`);
    const files = await listAll(bucket);
    console.log(`Found ${files.length} files`);

    for (const file of files) {
      try {
        const cdnUrl = await migrateFile(bucket, file);
        console.log(`  ✓ ${file} → ${cdnUrl}`);
        totalFiles++;
      } catch (e) {
        console.error(`  ✗ ${file}: ${e.message}`);
      }
    }

    console.log(`\nUpdating DB URLs for ${bucket}...`);
    await updateDbUrls(bucket);
  }

  console.log(`\n=== Migration complete ===`);
  console.log(`Files migrated: ${totalFiles}`);
  console.log(`\nNext steps:`);
  console.log(`1. Verify files at ${R2_PUBLIC_BASE}`);
  console.log(`2. Delete the 4 Supabase buckets via Dashboard`);
  console.log(`3. Update upload code to use R2 presigned URLs only (remove Supabase fallback)`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
