import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Applications',
  template: `
    <div class="applications-layout" id="app-container">
      <p style="color: var(--text-muted); text-align: center;">Loading application status...</p>
    </div>
  `,
  async init() {
    const container = document.getElementById('app-container');
    if (!container) return;

    // 1. Check if current user has already applied
    const { data: myApp } = await supabase
      .from('applications')
      .select('*')
      .eq('user_id', store.user.id)
      .single();

    if (!myApp) {
      // --- RENDER: Application Form ---
      container.innerHTML = `
        <div class="card form-card">
          <h2>Apprenticeship Application</h2>
          <p class="text-muted">Join an elite Triad. We don't train employees; we train independent Full Stack Media Architects. Complete the form below to enter the waitlist.</p>

          <form id="apply-form" style="margin-top: var(--space-6);">
            <div class="form-group">
              <label>Why do you want to become a Gliimait? (Min. 50 characters)</label>
              <textarea id="motivation-text" class="input" rows="5" placeholder="Share your mindset, your goals, and why you want to be your own boss..." required></textarea>
            </div>
            <button type="submit" class="btn-primary">Submit Application</button>
          </form>
        </div>
      `;

      document.getElementById('apply-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const motivation = document.getElementById('motivation-text').value.trim();
        if (motivation.length < 50) return alert("Please write at least 50 characters for your motivation.");

        const { error } = await supabase.from('applications').insert({
          user_id: store.user.id,
          motivation: motivation
        });

        if (error) {
          alert("Error submitting application: " + error.message);
        } else {
          alert("Application submitted! You are now on the waitlist.");
          this.init(); // Reload the view
        }
      });

    } else if (myApp.status === 'pending') {
      // --- RENDER: Waitlist Leaderboard ---

      // Fetch all pending applications and profiles
      const { data: pendingApps } = await supabase
        .from('applications')
        .select('user_id, created_at, profiles:profiles(username, full_name)')
        .eq('status', 'pending');

      // Fetch all posts to calculate activity score
      const { data: allPosts } = await supabase.from('posts').select('user_id');

      // Calculate scores
      const scores = {};
      allPosts.forEach(post => {
        scores[post.user_id] = (scores[post.user_id] || 0) + 1;
      });

      // Merge scores into applicants and sort
      const rankedApplicants = pendingApps.map(app => ({
        ...app,
        score: scores[app.user_id] || 0
      })).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(a.created_at) - new Date(b.created_at); // Tie-breaker: earlier application ranks higher
      });

      const myRank = rankedApplicants.findIndex(app => app.user_id === store.user.id) + 1;
      const myScore = rankedApplicants.find(app => app.user_id === store.user.id)?.score || 0;

      container.innerHTML = `
        <div class="waitlist-status-card card">
          <h2>You are on the Waitlist!</h2>
          <div class="rank-grid">
            <div class="rank-box">
              <span class="rank-label">Your Rank</span>
              <span class="rank-value">#${myRank}</span>
            </div>
            <div class="rank-box">
              <span class="rank-label">Activity Score</span>
              <span class="rank-value">${myScore}</span>
            </div>
          </div>
          <div class="info-banner">
            <p>💡 <strong>How to rank up:</strong> Your position is based on your activity. Post updates in the Hub, upload projects, and engage with the community. When a spot opens in a Triad, the top ranks are pulled in.</p>
          </div>
        </div>

        <div class="card" style="margin-top: var(--space-6);">
          <h3>Leaderboard (Top 10)</h3>
          <div class="leaderboard-list">
            ${rankedApplicants.slice(0, 10).map((app, index) => `
              <div class="leaderboard-item ${app.user_id === store.user.id ? 'is-me' : ''}">
                <span class="lb-rank">#${index + 1}</span>
                <div class="lb-avatar">${app.profiles?.full_name?.charAt(0).toUpperCase() || 'G'}</div>
                <div class="lb-info">
                  <span class="lb-name">${app.profiles?.full_name || 'Unknown'}</span>
                  <span class="lb-username">@${app.profiles?.username || 'gliimait'}</span>
                </div>
                <span class="lb-score">${app.score} pts</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;

    } else if (myApp.status === 'accepted') {
      // --- RENDER: Accepted ---
      container.innerHTML = `
        <div class="card accepted-card">
          <h2>🎉 Welcome to the Hub!</h2>
          <p>You have been accepted into the apprenticeship program. Check your Messages tab to meet your Triad Captain.</p>
        </div>
      `;
    }
  }
};
