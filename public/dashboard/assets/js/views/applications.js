import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Requests',
  template: `
    <div class="requests-layout" id="requests-container">
      <div class="sub-tabs">
        <button class="sub-tab active" data-tab="apprentice">Apprenticeship</button>
        <button class="sub-tab" data-tab="author">Authorship</button>
        <button class="sub-tab" data-tab="partner">Partnership</button>
      </div>
      <div id="tab-content"></div>
    </div>
  `,

  init() {
    this.currentTab = 'apprentice';

    // Mobile bottom bar hint
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    if (topbarDynamic) topbarDynamic.innerHTML = `<span class="mobile-bar-hint">Become a(n); Apprentice, Author, Partner</span>`;

    window.reqInstance = {
      switchTab: (tab) => this.switchTab(tab),
      submitApprentice: () => this.submitApprentice(),
      submitAuthor: () => this.submitAuthor(),
      submitPartner: () => this.submitPartner()
    };

    this.setupTabs();
    this.loadTab();
  },

  setupTabs() {
    document.querySelectorAll('.sub-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentTab = e.target.dataset.tab;
        this.loadTab();
      });
    });
  },

  async loadTab() {
    const content = document.getElementById('tab-content');
    content.innerHTML = `<p style="color: var(--text-muted); text-align: center;">Loading...</p>`;

    if (this.currentTab === 'apprentice') {
      await this.loadApprentice(content);
    } else if (this.currentTab === 'author') {
      this.loadAuthor(content);
    } else if (this.currentTab === 'partner') {
      this.loadPartner(content);
    }
  },

  // ============================================
  // APPRENTICESHIP
  // ============================================
  async loadApprentice(container) {
    const { data: myApp } = await supabase.from('applications').select('*').eq('user_id', store.user.id).eq('type', 'apprentice').maybeSingle();

    if (!myApp) {
      container.innerHTML = `
        <div class="card form-card">
          <h2>Apprenticeship Request</h2>
          <p class="text-muted">Join an elite Triad. We don't train employees; we train independent Full Stack Media Architects.</p>
          <form onsubmit="event.preventDefault(); reqInstance.submitApprentice()" style="margin-top: 24px;">
            <div class="form-group">
              <label>Why do you want to become a Gliimait? (Min. 50 chars)</label>
              <textarea id="apprentice-text" class="input" rows="5" required></textarea>
            </div>
            <button type="submit" class="btn-primary">Submit Request</button>
          </form>
        </div>
      `;
    } else {
      // Fetch all applicants with their profiles to build the leaderboard
      const { data: apps } = await supabase.from('applications').select('user_id, created_at, profiles:user_id(full_name, avatar_url, total_gp)').eq('type', 'apprentice').eq('status', 'pending');

      let ranked = (apps || []).map(a => ({
        ...a,
        gp: a.profiles?.total_gp || 0,
        name: a.profiles?.full_name || 'Gliimait',
        avatar: a.profiles?.avatar_url || ''
      })).sort((a, b) => b.gp - a.gp || new Date(a.created_at) - new Date(b.created_at));

      const myRank = ranked.findIndex(a => a.user_id === store.user.id) + 1;
      const top9 = ranked.slice(0, 9);

      // Triad logic
      const triads = [
        { name: 'Team Dynamo', color: 'var(--brand-primary)', members: [] },
        { name: 'Team Sentinel', color: 'var(--success)', members: [] },
        { name: 'Team Introspect', color: 'var(--warning)', members: [] }
      ];

      top9.forEach((user, index) => {
        if (index % 3 === 0) triads[0].members.push(user); // 1, 4, 7
        else if (index % 3 === 1) triads[1].members.push(user); // 2, 5, 8
        else triads[2].members.push(user); // 3, 6, 9
      });

      container.innerHTML = `
        <div class="card status-card">
          <h2>You are on the Waitlist!</h2>
          <div class="rank-grid">
            <div class="rank-box">
              <span class="rank-label">Your Rank</span>
              <span class="rank-value">#${myRank}</span>
            </div>
            <div class="rank-box">
              <span class="rank-label">Total Applicants</span>
              <span class="rank-value">${ranked.length}</span>
            </div>
          </div>
          <div class="info-banner">
            <p><strong>Rank Hint;</strong> post and engage in the hub &amp; library.</p>
          </div>
        </div>

        <div class="card" style="margin-top: 24px;">
          <h3>The Top 9 (Triad Projections)</h3>
          <div class="triad-grid">
            ${triads.map(t => `
              <div class="triad-box">
                <span class="triad-name" style="color: ${t.color};">${t.name}</span>
                <div class="triad-members">
                  ${t.members.map(m => {
                    const avatar = m.avatar
                      ? `<img src="${m.avatar}" class="triad-avatar" alt="">`
                      : `<div class="triad-avatar triad-avatar-fallback">${m.name?.charAt(0).toUpperCase() || 'G'}</div>`;
                    return `
                    <div class="triad-member">
                      ${avatar}
                      <span>${m.name}</span>
                      <span class="triad-gp">${m.gp} GP</span>
                    </div>
                  `}).join('') || '<span class="text-muted">Pending...</span>'}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  },

  async submitApprentice() {
    const text = document.getElementById('apprentice-text').value.trim();
    if (text.length < 50) return alert("Please write at least 50 characters.");

    const { error } = await supabase.from('applications').insert({ user_id: store.user.id, motivation: text, type: 'apprentice' });
    if (error) return alert("Error: " + error.message);
    this.loadTab();
  },

  // ============================================
  // AUTHORSHIP
  // ============================================
  loadAuthor(container) {
    container.innerHTML = `
      <div class="card form-card">
        <h2>Authorship Request</h2>
        <p class="text-muted">Publish your work in the Gliimu Library and earn from your content.</p>
        <form onsubmit="event.preventDefault(); reqInstance.submitAuthor()" style="margin-top: 24px;">
          <div class="form-group">
            <label>What type of content do you create? (Documentary, Research, Audiobook, etc.)</label>
            <input type="text" id="author-type" class="input" required>
          </div>
          <div class="form-group">
            <label>Provide a link to your best work</label>
            <input type="url" id="author-link" class="input" placeholder="https://...">
          </div>
          <div class="form-group">
            <label>OR Upload a Sample File (PDF, Doc, Audio, Video)</label>
            <input type="file" id="author-file" class="input" accept=".pdf,.doc,.docx,.mp3,.mp4,.wav">
          </div>
          <button type="submit" class="btn-primary">Submit Request</button>
        </form>
      </div>
    `;
  },

  async submitAuthor() {
    const type = document.getElementById('author-type').value.trim();
    const link = document.getElementById('author-link').value.trim();
    const fileInput = document.getElementById('author-file');
    const file = fileInput.files[0];

    if (!link && !file) return alert("Please provide a link or upload a file.");

    let fileUrl = null;
    if (file) {
      const fileName = `${store.user.id}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from('author_samples').upload(fileName, file);
      if (upErr) return alert("Upload failed.");
      fileUrl = supabase.storage.from('author_samples').getPublicUrl(fileName).data.publicUrl;
    }

    const { error } = await supabase.from('applications').insert({
      user_id: store.user.id,
      type: 'author',
      motivation: `Type: ${type} | Link: ${link || 'None'} | File: ${fileUrl || 'None'}`,
      file_url: fileUrl,
      metadata: { content_type: type, link: link }
    });

    if (error) return alert("Error: " + error.message);
    alert("Request submitted! We will review your sample.");
    this.loadTab();
  },

  // ============================================
  // PARTNERSHIP
  // ============================================
  loadPartner(container) {
    container.innerHTML = `
      <div class="card form-card">
        <h2>Partnership Request</h2>
        <p class="text-muted">For companies looking to hire Gliimaits or partner with the platform.</p>
        <form onsubmit="event.preventDefault(); reqInstance.submitPartner()" style="margin-top: 24px;">
          <div class="form-group">
            <label>Registered Business Name</label>
            <input type="text" id="partner-name" class="input" required>
          </div>
          <div class="form-group">
            <label>Business Address</label>
            <input type="text" id="partner-address" class="input" required>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex: 1; margin-right: 12px;">
              <label>Website Domain</label>
              <input type="url" id="partner-website" class="input" placeholder="https://">
            </div>
            <div class="form-group" style="flex: 1;">
              <label>Social Media Link</label>
              <input type="url" id="partner-social" class="input" placeholder="https://">
            </div>
          </div>
          <div class="form-group">
            <label>Purpose / Nature of Partnership</label>
            <textarea id="partner-purpose" class="input" rows="3" required></textarea>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex: 1; margin-right: 12px;">
              <label>Upload Business Logo</label>
              <input type="file" id="partner-logo" class="input" accept="image/*" required>
            </div>
            <div class="form-group" style="flex: 1;">
              <label>Upload Legal Proof (CAC, etc.)</label>
              <input type="file" id="partner-doc" class="input" accept=".pdf,.jpg,.png" required>
            </div>
          </div>
          <button type="submit" class="btn-primary">Submit Request</button>
        </form>
      </div>
    `;
  },

  async submitPartner() {
    const name = document.getElementById('partner-name').value.trim();
    const address = document.getElementById('partner-address').value.trim();
    const website = document.getElementById('partner-website').value.trim();
    const social = document.getElementById('partner-social').value.trim();
    const purpose = document.getElementById('partner-purpose').value.trim();

    const logoFile = document.getElementById('partner-logo').files[0];
    const docFile = document.getElementById('partner-doc').files[0];

    if (!logoFile || !docFile) return alert("Please upload both Logo and Legal Proof.");

    // Upload Logo
    const logoName = `${store.user.id}/logo_${Date.now()}.${logoFile.name.split('.').pop()}`;
    const { error: logoErr } = await supabase.storage.from('partner_docs').upload(logoName, logoFile);
    if (logoErr) return alert("Logo upload failed.");
    const logoUrl = supabase.storage.from('partner_docs').getPublicUrl(logoName).data.publicUrl;

    // Upload Doc
    const docName = `${store.user.id}/doc_${Date.now()}.${docFile.name.split('.').pop()}`;
    const { error: docErr } = await supabase.storage.from('partner_docs').upload(docName, docFile);
    if (docErr) return alert("Document upload failed.");
    const docUrl = supabase.storage.from('partner_docs').getPublicUrl(docName).data.publicUrl;

    const { error } = await supabase.from('applications').insert({
      user_id: store.user.id,
      type: 'partner',
      motivation: `Company: ${name} | Purpose: ${purpose}`,
      file_url: docUrl,
      metadata: { name, address, website, social, purpose, logo_url: logoUrl }
    });

    if (error) return alert("Error: " + error.message);
    alert("Partnership request submitted! We will review and reach out.");
    this.loadTab();
  }
};
