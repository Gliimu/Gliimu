// js/pages/hub.js - Creative Feed with Gliimu Brand Identity

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';

let currentUser = null;
let allPosts = [];
let currentFilter = 'all';
let currentSearch = '';

// Default feed content with WORKING image URLs
const DEFAULT_FEED = [
  {
    id: 'feed_1',
    type: 'video',
    title: '🎬 Motion Graphics: From Beginner to Pro',
    description: 'Watch how I created this stunning motion graphics project using After Effects. Full breakdown in comments! This is what you can achieve with dedication and the right guidance.',
    image: 'https://images.pexels.com/photos/4924135/pexels-photo-4924135.jpeg?w=800',
    author: 'Michael Chen',
    likes: 1234,
    comments: 89,
    createdAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'feed_2',
    type: 'design',
    title: '✨ UI Design Trends That Will Dominate 2025',
    description: 'Minimalism meets maximalism. Here are the top design trends shaping the creative industry. From glassmorphism to brutalist design, here\'s what you need to know.',
    image: 'https://images.pexels.com/photos/196644/pexels-photo-196644.jpeg?w=800',
    author: 'Sarah Johnson',
    likes: 3421,
    comments: 156,
    createdAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'feed_3',
    type: 'insight',
    title: '💡 From Zero to Media Architect: My Journey',
    description: '6 months ago I knew nothing about video production. Now I\'m working with major brands. Here\'s what I learned at Gliimu and how you can do it too.',
    image: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?w=800',
    author: 'David Okafor',
    likes: 5678,
    comments: 423,
    createdAt: new Date(Date.now() - 172800000).toISOString()
  },
  {
    id: 'feed_4',
    type: 'project',
    title: '🚀 Built a Streaming Platform in 30 Days',
    description: 'My final project at Gliimu - a fully functional streaming platform with React, Node.js, and Supabase. Live demo in comments!',
    image: 'https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?w=800',
    author: 'Tunde Adebayo',
    likes: 2345,
    comments: 178,
    createdAt: new Date(Date.now() - 259200000).toISOString()
  },
  {
    id: 'feed_5',
    type: 'video',
    title: '🎨 Speed Art: Digital Painting Process',
    description: 'Watch this digital artwork come to life from sketch to final render. 3 hours compressed into 60 seconds! Tools used: Procreate + Photoshop.',
    image: 'https://images.pexels.com/photos/2075802/pexels-photo-2075802.jpeg?w=800',
    author: 'Zoe Williams',
    likes: 8901,
    comments: 234,
    createdAt: new Date(Date.now() - 345600000).toISOString()
  },
  {
    id: 'feed_6',
    type: 'design',
    title: '🎯 Color Psychology in Branding',
    description: 'How the right colors can make or break your brand identity. A deep dive into color meanings, cultural associations, and practical applications.',
    image: 'https://images.pexels.com/photos/196645/pexels-photo-196645.jpeg?w=800',
    author: 'Grace Mbah',
    likes: 4567,
    comments: 267,
    createdAt: new Date(Date.now() - 432000000).toISOString()
  },
  {
    id: 'feed_7',
    type: 'insight',
    title: '📱 The Future of Content Creation',
    description: 'AI is changing everything. Here\'s how creators can adapt and thrive in the new era of content. Practical tips and tools you can use today.',
    image: 'https://images.pexels.com/photos/256514/pexels-photo-256514.jpeg?w=800',
    author: 'Emeka Nwosu',
    likes: 6789,
    comments: 345,
    createdAt: new Date(Date.now() - 518400000).toISOString()
  },
  {
    id: 'feed_8',
    type: 'project',
    title: '🎮 3D Game Environment Design',
    description: 'Check out my 3D game environment created in Unity. Open for freelance work! Portfolio link in bio.',
    image: 'https://images.pexels.com/photos/442576/pexels-photo-442576.jpeg?w=800',
    author: 'Alex Hunter',
    likes: 3456,
    comments: 198,
    createdAt: new Date(Date.now() - 604800000).toISOString()
  }
];

// Leaderboard data - Top 10 performing users by percentage
const LEADERBOARD_DATA = [
  { name: 'Michael Chen', score: 98.5, percentage: 98.5, rank: 1 },
  { name: 'Sarah Johnson', score: 95.2, percentage: 95.2, rank: 2 },
  { name: 'David Okafor', score: 92.8, percentage: 92.8, rank: 3 },
  { name: 'Tunde Adebayo', score: 88.4, percentage: 88.4, rank: 4 },
  { name: 'Zoe Williams', score: 85.1, percentage: 85.1, rank: 5 },
  { name: 'Grace Mbah', score: 82.6, percentage: 82.6, rank: 6 },
  { name: 'Emeka Nwosu', score: 79.3, percentage: 79.3, rank: 7 },
  { name: 'Alex Hunter', score: 76.8, percentage: 76.8, rank: 8 },
  { name: 'Oluwaseun Adeleke', score: 74.2, percentage: 74.2, rank: 9 },
  { name: 'Chioma Eze', score: 71.5, percentage: 71.5, rank: 10 }
];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Creative Feed initializing...');
  
  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user;
  
  if (currentUser) {
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    if (userName) userName.textContent = currentUser.user_metadata?.name || 'Creator';
    if (userRole) userRole.textContent = 'Student';
  }
  
  await loadFeed();
  loadLeaderboard();
  setupEventListeners();
});

function loadLeaderboard() {
  const container = document.getElementById('leaderboardList');
  if (!container) return;
  
  container.innerHTML = LEADERBOARD_DATA.map(user => `
    <div class="leaderboard-item">
      <div class="rank-badge rank-${user.rank === 1 ? '1' : user.rank === 2 ? '2' : user.rank === 3 ? '3' : 'other'}">
        ${user.rank}
      </div>
      <div class="leaderboard-avatar">
        <i class="fas fa-user-circle"></i>
      </div>
      <div class="leaderboard-info">
        <div class="leaderboard-name">${user.name}</div>
        <div class="leaderboard-score">${user.score}% completion</div>
      </div>
      <div class="leaderboard-percent">${user.percentage}%</div>
    </div>
  `).join('');
}

async function loadFeed() {
  const container = document.getElementById('feedContainer');
  if (!container) return;
  
  // Always show default posts first for immediate content
  allPosts = [...DEFAULT_FEED];
  
  // Try to fetch from database and merge
  try {
    const { data: posts, error } = await supabase
      .from('hub_posts')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    
    if (!error && posts && posts.length > 0) {
      const formattedPosts = posts.map(p => ({
        id: p.id,
        type: p.type,
        title: p.title,
        description: p.description,
        image: p.image_url || DEFAULT_FEED[0].image,
        author: p.author_name || 'Community Creator',
        likes: p.likes || 0,
        comments: p.comments || 0,
        createdAt: p.created_at
      }));
      
      // Merge and remove duplicates
      const allPostsMap = new Map();
      [...formattedPosts, ...DEFAULT_FEED].forEach(post => {
        if (!allPostsMap.has(post.id)) {
          allPostsMap.set(post.id, post);
        }
      });
      allPosts = Array.from(allPostsMap.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    renderFeed();
    
  } catch (error) {
    console.error('Error loading feed from Supabase, using defaults:', error);
    renderFeed();
  }
}

function renderFeed() {
  const container = document.getElementById('feedContainer');
  if (!container) return;
  
  let filtered = [...allPosts];
  
  if (currentFilter !== 'all') {
    filtered = filtered.filter(post => post.type === currentFilter);
  }
  
  if (currentSearch) {
    const searchLower = currentSearch.toLowerCase();
    filtered = filtered.filter(post => 
