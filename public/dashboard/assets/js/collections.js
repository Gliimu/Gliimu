import { supabase } from '/shared/js/config.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function loadCollections() {
  const { data: rows, error } = await supabase.from('post_hashtags').select('hashtag, post_id');
  if (error) throw error;
  if (!rows.length) return [];

  const postIds = [...new Set(rows.map(row => row.post_id))];
  const { data: posts, error: postsError } = await supabase.from('feed_gliims')
    .select('id, user_id, views, cover_url, created_at').eq('status', 'approved').in('id', postIds)
    .order('views', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).order('id');
  if (postsError) throw postsError;
  if (!posts.length) return [];

  const userIds = [...new Set(posts.map(post => post.user_id).filter(Boolean))];
  const [interactionsResult, profilesResult] = await Promise.all([
    supabase.from('feed_interactions').select('post_id, interaction_type')
      .in('post_id', posts.map(post => post.id)).in('interaction_type', ['comment', 'share']),
    userIds.length ? supabase.from('profiles').select('id, avatar_url').in('id', userIds) : { data: [] }
  ]);
  if (interactionsResult.error) throw interactionsResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const avatars = new Map(profilesResult.data.map(profile => [profile.id, profile.avatar_url]));
  const interactions = new Map();
  for (const interaction of interactionsResult.data) {
    if (!interactions.has(interaction.post_id)) interactions.set(interaction.post_id, { comments: 0, shares: 0 });
    interactions.get(interaction.post_id)[interaction.interaction_type === 'comment' ? 'comments' : 'shares']++;
  }
  const tagsByPost = new Map();
  for (const row of rows) {
    const tag = (row.hashtag || '').toLowerCase();
    if (!tag) continue;
    if (!tagsByPost.has(row.post_id)) tagsByPost.set(row.post_id, new Set());
    tagsByPost.get(row.post_id).add(tag);
  }

  const collections = new Map();
  for (const post of posts) {
    for (const tag of tagsByPost.get(post.id) || []) {
      if (!collections.has(tag)) collections.set(tag, {
        tag, count: 0, cover_url: post.cover_url, contributors: new Map(), stats: { views: 0, comments: 0, shares: 0 }
      });
      const collection = collections.get(tag);
      collection.count++;
      if (post.user_id) collection.contributors.set(post.user_id, (collection.contributors.get(post.user_id) || 0) + 1);
      collection.stats.views += Number(post.views || 0);
      const postStats = interactions.get(post.id);
      collection.stats.comments += postStats?.comments || 0;
      collection.stats.shares += postStats?.shares || 0;
    }
  }
  return [...collections.values()].map(collection => ({
    ...collection,
    userIds: [...collection.contributors.keys()],
    contributors: [...collection.contributors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9)
      .map(([id]) => ({ id, avatar_url: avatars.get(id) }))
  })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function renderCollectionCard(collection) {
  const cover = collection.cover_url
    ? `<img class="collection-tag-cover" src="${escapeHtml(collection.cover_url)}" alt="" loading="lazy">` : '';
  const avatars = collection.contributors.filter(creator => creator.avatar_url)
    .map(creator => `<img src="${escapeHtml(creator.avatar_url)}" alt="" class="collection-tag-avatar" loading="lazy">`).join('');
  const icons = {
    views: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    comments: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    shares: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98m-.01-10.98-6.82 3.98"/>'
  };
  return `<a class="collection-tag-card" href="#/collection?name=${encodeURIComponent(collection.tag)}">
    ${cover}
    <div class="collection-tag-info">
      <span class="collection-tag-name">#${escapeHtml(collection.tag)}</span>
      <span class="collection-tag-count">${collection.count} ${collection.count === 1 ? 'gliim' : 'gliims'}</span>
      ${avatars ? `<div class="collection-tag-avatars">${avatars}</div>` : ''}
      <div class="collection-tag-stats">${Object.entries(icons).map(([key, icon]) => `<span class="collection-stat" title="${key}"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>${collection.stats[key].toLocaleString()}</span>`).join('')}</div>
    </div>
  </a>`;
}
