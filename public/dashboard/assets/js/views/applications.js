import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Applications',
  template: `
    <div class="applications-layout" id="app-container">
      <p style="color: var(--text-muted); text-align: center;">Loading...</p>
    </div>
  `,
  init() {
    this.currentTab = 'apprenticeship';
    this.renderShell();
  },

  renderShell() {
    const container = document.getElementById('app-container');
    if (!container) return;

    container.innerHTML = `
      <div class="app-sub-tabs">
        <button class="app-tab-btn active" data-tab="apprenticeship">Apprenticeship</button>
        <button class="app-tab-btn" data-tab="authorship">Authorship</button>
        <button class="app-tab-btn" data-tab="partnership">Partnership</button>
      </div>
      <div id="app-content" style="margin-top: var(--space-6);"></div>
    `;

    document.querySelectorAll('.app-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.app-tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentTab = e.target.dataset.tab;
        this.loadTabContent();
      });
    });

    this.loadTabContent();
  },

  async loadTabContent() {
    const content = document.getElementById('app-content');
    if (!content) return;
    content.innerHTML = `<p style="color: var(--text-muted); text-align: center;">Loading ${this.currentTab}...</p>`;

    // FIXED: Use maybeSingle() to prevent 406 error when no application exists
    const { data: myApp } = await supabase
      .from('applications')
      .select('*')
      .eq('user_id', store.user.id)
      .eq('type', this.currentTab)
      .maybeSingle();

    if (this.currentTab === 'apprenticeship') {
      this.renderApprenticeship(content, myApp);
    } else if (this.currentTab === 'authorship') {
      this.renderAuthorship(content, myApp);
    } else if (this.currentTab === 'partnership') {
      this.renderPartnership(content, myApp);
    }
  },

  renderApprenticeship(container, myApp) {
    if (!myApp) {
      container.innerHTML = `
        <div class="card form-card">
          <h2>Apprenticeship Application</h2>
          <p class="text-muted">Join an elite Triad. We don't train employees; we train independent Full Stack Media Architects.</p>
          <form id="apply-form" style="margin-top: var(--space-6);">
            <div class="form-group">
              <label>Why do you want to become a Gliimait? (Min. 50 characters)</label>
              <textarea id="motivation-text" class="input" rows="5" required></textarea>
            </div>
            <button type="submit" class="btn-primary">Submit Application</button>
          </form>
        </div>
      `;
      document.getElementById('apply-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const motivation = document.getElementById('motivation-text').value.trim();
        if (motivation.length < 50) return alert("Please write at least 50 characters.");

        const { error } = await supabase.from('applications').insert({
          user_id: store.user.id, motivation: motivation, type: 'apprenticeship'
        });
        if (error) alert("Error: " + error.message);
        else this.loadTabContent();
      });
    } else if (myApp.status === 'pending') {
      this.renderWaitlist(container, myApp);
    } else {
      container.innerHTML = `<div class="card accepted-card"><h2>🎉 Accepted!</h2><p>You are in the apprenticeship program.</p></div>`;
    }
  },

  async renderWaitlist(container, myApp) {
    // FIXED: Explicit join syntax to prevent 400 Bad Request
    const { data: pendingApps } = await supabase
      .from('applications')
      .select('user_id, created_at, profiles:profiles!user_id(username, full_name)')
      .eq('status', 'pending')
      .eq('type', 'apprenticeship');

    const { data: allPosts } = await supabase.from('posts').select('user_id');

    const scores = {};
    allPosts.forEach(post => scores[post.user_id] = (scores[post.user_id] || 0) + 1);

    const rankedApplicants = (pendingApps || []).map(app => ({
      ...app, score: scores[app.user_id] || 0
    })).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.created_at) - new Date(b.created_at);
    });

    const myRank = rankedApplicants.findIndex(app => app.user_id === store.user.id) + 1;
    const myScore = rankedApplicants.find(app => app.user_id === store.user.id)?.score || 0;

    container.innerHTML = `
      <div class="waitlist-status-card card">
        <h2>You are on the Waitlist!</h2>
        <div class="rank-grid">
          <div class="rank-box"><span class="rank-label">Your Rank</span><span class="rank-value">#${myRank}</span></div>
          <div class="rank-box"><span class="rank-label">Activity Score</span><span class="rank-value">${myScore}</span></div>
        </div>
        <div class="info-banner"><p>💡 <strong>How to rank up:</strong> Post updates in the Hub to increase your activity score.</p></div>
      </div>
      <div class="card" style="margin-top: var(--space-6);">
        <h3>Leaderboard (Top 10)</h3>
        <div class="leaderboard-list">
          ${rankedApplicants.slice(0, 10).map((app, index) => `
            <div class="leaderboard-item ${app.user_id === store.user.id ? 'is-me' : ''}">
              <span class="lb-rank">#${index + 1}</span>
              <div class="lb-avatar">
                ${app.profiles?.avatar_url
                  ? `<img src="${app.profiles.avatar_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`
                  : (app.profiles?.full_name?.charAt(0).toUpperCase() || 'G')}
              </div>
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
  },

  renderAuthorship(container, myApp) {
    if (!myApp) {
      container.innerHTML = `
        <div class="card form-card">
          <h2>Authorship Application</h2>
          <p class="text-muted">Publish your work in the Gliimu Library and earn from your content.</p>
          <form id="apply-form" style="margin-top: var(--space-6);">
            <div class="form-group">
              <label>What type of content do you create? (Documentaries, Research, Audiobooks, etc.)</label>
              <input type="text" id="motivation-text" class="input" required>
            </div>
            <div class="form-group">
              <label>Provide a link to your best work</label>
              <input type="url" id="portfolio-link" class="input" placeholder="https://" required>
            </div>
            <button type="submit" class="btn-primary">Submit Request</button>
          </form>
        </div>
      `;
      document.getElementById('apply-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const motivation = document.getElementById('motivation-text').value.trim();
        const link = document.getElementById('portfolio-link').value.trim();
        const { error } = await supabase.from('applications').insert({
          user_id: store.user.id, motivation: `Type: ${motivation} | Link: ${link}`, type: 'authorship'
        });
        if (error) alert("Error: " + error.message);
        else this.loadTabContent();
      });
    } else {
      container.innerHTML = `<div class="card accepted-card"><h2>Request Received</h2><p>Your authorship application is currently under review.</p></div>`;
    }
  },

  renderPartnership(container, myApp) {
    if (!myApp) {
      container.innerHTML = `
        <div class="card form-card">
          <h2>Partnership Request</h2>
          <p class="text-muted">For companies looking to hire Gliimaits or partner with the platform.</p>
          <form id="apply-form" style="margin-top: var(--space-6);">
            <div class="form-group">
              <label>Company Name</label>
              <input type="text" id="company-name" class="input" required>
            </div>
            <div class="form-group">
              <label>What is the nature of the partnership?</label>
              <textarea id="motivation-text" class="input" rows="3" required></textarea>
            </div>
            <button type="submit" class="btn-primary">Submit Request</button>
          </form>
        </div>
      `;
      document.getElementById('apply-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const company = document.getElementById('company-name').value.trim();
        const motivation = document.getElementById('motivation-text').value.trim();
        const { error } = await supabase.from('applications').insert({
          user_id: store.user.id, motivation: `Company: ${company} | Details: ${motivation}`, type: 'partnership'
        });
        if (error) alert("Error: " + error.message);
        else this.loadTabContent();
      });
    } else {
      container.innerHTML = `<div class="card accepted-card"><h2>Request Received</h2><p>Your partnership request is currently under review.</p></div>`;
    }
  }
};
