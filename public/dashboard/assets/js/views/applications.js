import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const rest = n % 100;
  return n + (suffixes[(rest - 20) % 10] || suffixes[rest] || suffixes[0]);
}

function fileExtension(file) {
  const raw = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return raw || 'png';
}

const DEAL_LOGO_BUCKET = 'deal_logos';

export default {
  title: 'Requests',
  template: `
    <div class="requests-layout" id="requests-container">
      <div class="sub-tabs">
        <button class="sub-tab active" data-tab="apprentice">Apprenticeship</button>
        <button class="sub-tab" data-tab="deals">Deals</button>
      </div>
      <div id="tab-content"></div>
    </div>
  `,

  init() {
    const params = new URLSearchParams((window.location.hash.split('?')[1] || ''));
    this.currentTab = params.get('tab') === 'deals' ? 'deals' : 'apprentice';
    this.queue = [];

    document.querySelectorAll('.sub-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === this.currentTab);
    });

    // Mobile bottom bar hint
    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    if (topbarDynamic) topbarDynamic.innerHTML = `<span class="mobile-bar-hint">Become an Apprentice or bring us a Deal</span>`;

    window.reqInstance = {
      switchTab: (tab) => this.switchTab(tab),
      submitApprentice: () => this.submitApprentice(),
      submitDeal: () => this.submitDeal(),
      setDealType: (type) => this.setDealType(type),
      toggleDealForm: () => this.toggleDealForm(),
      markDealDone: (id) => this.markDealDone(id),
      removeDeal: (id) => this.removeDeal(id),
      cancelMyDeal: (id) => this.cancelMyDeal(id)
    };

    this.setupTabs();
    this.loadTab();
  },

  setupTabs() {
    document.querySelectorAll('.sub-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget;
        document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        this.currentTab = target.dataset.tab;
        this.loadTab();
      });
    });
  },

  switchTab(tab) {
    const btn = document.querySelector(`.sub-tab[data-tab="${tab}"]`);
    if (btn) btn.click();
  },

  async loadTab() {
    const content = document.getElementById('tab-content');
    content.innerHTML = `<p style="color: var(--text-muted); text-align: center;">Loading...</p>`;

    if (this.currentTab === 'deals') {
      await this.loadDeals(content);
    } else {
      await this.loadApprentice(content);
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
      return;
    }

    // Fetch all applicants with their profiles to build the leaderboard
    const { data: apps } = await supabase.from('applications').select('user_id, created_at, profiles:user_id(full_name, avatar_url, total_gp)').eq('type', 'apprentice').eq('status', 'pending');

    const ranked = (apps || []).map(a => ({
      ...a,
      gp: (a.profiles && a.profiles.total_gp) || 0,
      name: (a.profiles && a.profiles.full_name) || 'Gliimait',
      avatar: (a.profiles && a.profiles.avatar_url) || ''
    })).sort((a, b) => b.gp - a.gp || new Date(a.created_at) - new Date(b.created_at));

    const myIndex = ranked.findIndex(a => a.user_id === store.user.id);
    const rankText = myIndex >= 0 ? `${ordinal(myIndex + 1)} out of ${ranked.length}` : 'Awaiting review';
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
        <div class="rank-single">
          <span class="rank-label">Your Position</span>
          <span class="rank-value">${rankText}</span>
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
                    ? `<img src="${escapeHtml(m.avatar)}" class="triad-avatar" alt="">`
                    : `<div class="triad-avatar triad-avatar-fallback">${escapeHtml(m.name.charAt(0).toUpperCase() || 'G')}</div>`;
                  return `
                  <div class="triad-member">
                    ${avatar}
                    <span class="triad-member-name">${escapeHtml(m.name)}</span>
                    <span class="triad-gp">${m.gp} GP</span>
                  </div>
                `}).join('') || '<span class="text-muted">Pending...</span>'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  async submitApprentice() {
    const text = document.getElementById('apprentice-text').value.trim();
    if (text.length < 50) return alert("Please write at least 50 characters.");

    const { error } = await supabase.from('applications').insert({ user_id: store.user.id, motivation: text, type: 'apprentice' });
    if (error) return alert("Error: " + error.message);
    this.loadTab();
  },

  // ============================================
  // DEALS (queue board + submission form)
  // ============================================
  async loadDeals(container) {
    const { data, error } = await supabase
      .from('deals')
      .select('id, user_id, deal_type, relationship, company_name, company_logo_url, job_description, budget, timeline, status, created_at, profiles:profiles!deals_user_id_fkey(full_name, avatar_url)')
      .in('status', ['queued', 'in_progress'])
      .order('queue_position', { ascending: true });

    this.queue = error ? [] : (data || []);

    const isAdmin = !!(store.profile && store.profile.is_admin);
    const mine = this.queue.filter(d => d.user_id === store.user.id);
    const openForm = this.queue.length === 0;

    container.innerHTML = `
      ${this.renderQueueCard(isAdmin)}
      ${this.renderDealForm(openForm)}
      ${mine.length > 0 ? `
        <div class="card" style="margin-top: 24px;">
          <h3>Your Active Gigs</h3>
          <p class="text-muted" style="margin-top: 8px;">Cancel a gig to pull it out of the queue.</p>
          <div class="my-deal-list">
            ${mine.map(d => `
              <div class="my-deal-row">
                <span class="queue-desc clamp-2">${escapeHtml(d.job_description)}</span>
                <button type="button" class="btn-secondary btn-sm" onclick="reqInstance.cancelMyDeal('${d.id}')">Cancel</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  },

  renderQueueCard(isAdmin) {
    const total = this.queue.length;

    return `
      <div class="card queue-card">
        <div class="queue-card-head">
          <div>
            <h2>Deal Queue</h2>
            <p class="text-muted">Partners bring the work. We deliver it in order, first come first served.</p>
          </div>
          <button type="button" class="btn-primary btn-sm" onclick="reqInstance.toggleDealForm()">
            <i class="fas fa-plus"></i> Add New Gig
          </button>
        </div>

        ${total === 0 ? `
          <p class="text-muted" style="margin-top: 20px;">The queue is empty. Be the first to bring us a deal.</p>
        ` : `
          <div class="queue-list">
            ${this.queue.map((deal, index) => {
              const isCorporate = deal.deal_type === 'corporate';
              const logo = isCorporate ? deal.company_logo_url : (deal.profiles && deal.profiles.avatar_url);
              const name = isCorporate
                ? (deal.company_name || 'A Partner')
                : ((deal.profiles && deal.profiles.full_name) || 'A Gliimait');
              const isMine = deal.user_id === store.user.id;

              return `
                <div class="queue-item${index === 0 ? ' is-next' : ''}${isMine ? ' is-mine' : ''}">
                  <div class="queue-pos">${index + 1}</div>
                  <div class="queue-body">
                    <div class="queue-head">
                      ${logo
                        ? `<img src="${escapeHtml(logo)}" class="queue-logo" alt="">`
                        : `<div class="queue-logo queue-logo-fallback">${escapeHtml(name.charAt(0).toUpperCase())}</div>`
                      }
                      <span class="queue-name">${escapeHtml(name)}</span>
                      <span class="queue-tag">${isCorporate ? 'Corporate' : 'Personal'}</span>
                      ${index === 0 ? '<span class="queue-tag queue-tag-next">Next Up</span>' : ''}
                      ${isMine ? '<span class="queue-tag queue-tag-mine">Yours</span>' : ''}
                    </div>
                    ${isCorporate && deal.relationship ? `<p class="queue-relationship">${escapeHtml(deal.relationship)}</p>` : ''}
                    <p class="queue-desc">${escapeHtml(deal.job_description)}</p>
                    <div class="queue-meta">
                      ${deal.budget ? `<span><i class="fas fa-coins"></i> ${escapeHtml(deal.budget)}</span>` : ''}
                      ${deal.timeline ? `<span><i class="fas fa-clock"></i> ${escapeHtml(deal.timeline)}</span>` : ''}
                    </div>
                  </div>
                  ${isAdmin ? `
                    <div class="queue-actions">
                      <button type="button" class="btn-primary btn-sm" onclick="reqInstance.markDealDone('${deal.id}')">Mark Done</button>
                      <button type="button" class="btn-secondary btn-sm" onclick="reqInstance.removeDeal('${deal.id}')">Remove</button>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  },

  renderDealForm(open) {
    return `
      <div class="card form-card" id="deal-form-card" style="margin-top: 24px;${open ? '' : ' display: none;'}">
        <h2>Bring Us a Deal</h2>
        <p class="text-muted">A paid gig, a contract, a partnership idea. Tell us what you need built and we will put it in the queue.</p>

        <form onsubmit="event.preventDefault(); reqInstance.submitDeal()" style="margin-top: 24px;">
          <div class="form-group">
            <label>Who is this deal from?</label>
            <div class="deal-type-toggle">
              <label class="deal-type-opt">
                <input type="radio" name="deal-type" value="personal" checked onchange="reqInstance.setDealType('personal')">
                <span>Personal</span>
              </label>
              <label class="deal-type-opt">
                <input type="radio" name="deal-type" value="corporate" onchange="reqInstance.setDealType('corporate')">
                <span>Corporate</span>
              </label>
            </div>
          </div>

          <div id="corporate-fields" style="display: none;">
            <div class="form-group">
              <label>Your relationship with the company</label>
              <input type="text" id="deal-relationship" class="input" placeholder="e.g. Founder, Marketing Lead, Procurement Officer">
            </div>
            <div class="form-group">
              <label>Company / Organization Name</label>
              <input type="text" id="deal-company" class="input" placeholder="e.g. Northwind Studios">
            </div>
            <div class="form-group">
              <label>Company Logo</label>
              <input type="file" id="deal-logo" class="input" accept="image/*">
              <span class="text-muted">Shown on the queue board in place of your profile photo and name.</span>
            </div>
          </div>

          <div class="form-group">
            <label>Describe the job</label>
            <textarea id="deal-description" class="input" rows="4" placeholder="What needs to be built, delivered or partnered on?" required></textarea>
          </div>

          <div class="form-row">
            <div class="form-group" style="flex: 1; margin-right: 12px;">
              <label>Budget</label>
              <input type="text" id="deal-budget" class="input" placeholder="e.g. ₦250,000 or Negotiable" required>
            </div>
            <div class="form-group" style="flex: 1;">
              <label>How soon do you need it done?</label>
              <input type="text" id="deal-timeline" class="input" placeholder="e.g. Within 2 weeks" required>
            </div>
          </div>

          <button type="submit" class="btn-primary" id="deal-submit">Add to Queue</button>
        </form>
      </div>
    `;
  },

  setDealType(type) {
    const corporate = document.getElementById('corporate-fields');
    if (!corporate) return;
    corporate.style.display = type === 'corporate' ? 'block' : 'none';
  },

  toggleDealForm() {
    const card = document.getElementById('deal-form-card');
    if (!card) return;
    card.style.display = card.style.display === 'none' ? 'block' : 'none';
    if (card.style.display === 'block') card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  async submitDeal() {
    const typeEl = document.querySelector('input[name="deal-type"]:checked');
    const dealType = typeEl ? typeEl.value : 'personal';
    const description = document.getElementById('deal-description').value.trim();
    const budget = document.getElementById('deal-budget').value.trim();
    const timeline = document.getElementById('deal-timeline').value.trim();

    if (!description) return alert("Please describe the job.");

    let relationship = null;
    let companyName = null;
    let companyLogoUrl = null;

    if (dealType === 'corporate') {
      relationship = document.getElementById('deal-relationship').value.trim();
      companyName = document.getElementById('deal-company').value.trim();
      const logoFile = document.getElementById('deal-logo').files[0];

      if (!relationship) return alert("Please enter your relationship with the company.");
      if (!companyName) return alert("Please enter the company name.");
      if (!logoFile) return alert("Please upload the company logo.");

      const path = `${store.user.id}/logo_${Date.now()}.${fileExtension(logoFile)}`;
      const { error: uploadError } = await supabase.storage.from(DEAL_LOGO_BUCKET).upload(path, logoFile);
      if (uploadError) return alert("Logo upload failed: " + uploadError.message);
      companyLogoUrl = supabase.storage.from(DEAL_LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
    }

    const submitBtn = document.getElementById('deal-submit');
    if (submitBtn) submitBtn.disabled = true;

    const { error } = await supabase.from('deals').insert({
      user_id: store.user.id,
      deal_type: dealType,
      relationship,
      company_name: companyName,
      company_logo_url: companyLogoUrl,
      job_description: description,
      budget,
      timeline
    });

    if (submitBtn) submitBtn.disabled = false;
    if (error) return alert("Error: " + error.message);

    await alert("Your gig is in the queue. We will reach out with the next steps.");
    this.loadTab();
  },

  async markDealDone(id) {
    const deal = this.queue.find(d => d.id === id);
    if (!deal) return;

    const confirmed = await appConfirm("Mark this gig as done? It leaves the board and the next one moves up.", { okText: 'Mark Done' });
    if (!confirmed) return;

    const { error } = await supabase.from('deals').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: store.user.id
    }).eq('id', id);

    if (error) return alert("Error: " + error.message);

    if (deal.user_id !== store.user.id) {
      await supabase.from('messages').insert({
        sender_id: store.user.id,
        receiver_id: deal.user_id,
        content: 'Your deal has been completed and taken off the board. Thank you for building with Gliimu.',
        is_ai: false
      });
    }

    // Tell whoever is now first in line that their deal is up next.
    const { data: next } = await supabase.from('deals')
      .select('user_id')
      .eq('status', 'queued')
      .order('queue_position', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next && next.user_id !== store.user.id) {
      await supabase.from('messages').insert({
        sender_id: store.user.id,
        receiver_id: next.user_id,
        content: "You're up next on the deal board — your gig is now at the front of the queue.",
        is_ai: false
      });
    }

    await alert("Gig marked as done. The next gig is now up.");
    this.loadTab();
  },

  async removeDeal(id) {
    const confirmed = await appConfirm("Remove this gig from the queue? The poster will not be notified.", { okText: 'Remove', danger: true });
    if (!confirmed) return;

    const { error } = await supabase.from('deals').update({ status: 'cancelled' }).eq('id', id);
    if (error) return alert("Error: " + error.message);
    await alert("Gig removed from the queue.");
    this.loadTab();
  },

  async cancelMyDeal(id) {
    const confirmed = await appConfirm("Pull this gig out of the queue?", { okText: 'Cancel Gig', danger: true });
    if (!confirmed) return;

    const { error } = await supabase.from('deals').update({ status: 'cancelled' }).eq('id', id);
    if (error) return alert("Error: " + error.message);
    this.loadTab();
  }
};
