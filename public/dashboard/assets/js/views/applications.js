import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';
import { fetchBillingSummary, goToBilling } from '../billing.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fileExtension(file) {
  const raw = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return raw || 'png';
}

const DEAL_LOGO_BUCKET = 'deal_logos';

export default {
  title: 'Queue',
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
    this.applicants = [];
    this.appFilter = 'general';

    // Deals are subscription-only: wallet blocked, trial/payngo capped,
    // pro unlimited. Null tier = summary unavailable (pre-migration) → the
    // DB trigger is the backstop, so fail open here.
    this.billingTier = null;
    this.dealCap = 3;
    fetchBillingSummary().then(s => {
      if (!s || s.code) return;
      this.billingTier = s.tier;
      if (s.prices && s.prices.limit_deals_payngo) this.dealCap = Number(s.prices.limit_deals_payngo) || 3;
    });

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
      cancelMyDeal: (id) => this.cancelMyDeal(id),
      viewProfile: (userId) => this.viewProfile(userId)
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

    const { data: apps } = await supabase.from('applications').select('user_id, created_at, profiles:user_id(full_name, avatar_url, total_gp)').eq('type', 'apprentice').eq('status', 'pending');

    this.applicants = (apps || []).map(a => ({
      ...a,
      gp: (a.profiles && a.profiles.total_gp) || 0,
      name: (a.profiles && a.profiles.full_name) || 'Gliimait',
      avatar: (a.profiles && a.profiles.avatar_url) || ''
    })).sort((a, b) => b.gp - a.gp || new Date(a.created_at) - new Date(b.created_at));

    const filterIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>';

    container.innerHTML = `
      <div class="apprentice-head">
        <h2>Apprenticeship Requests</h2>
        <div class="apprentice-filter-wrap">
          <button type="button" class="apprentice-filter-btn" id="apprentice-filter-btn">${filterIcon}</button>
          <div class="apprentice-filter-menu" id="apprentice-filter-menu">
            <div class="apprentice-filter-item${this.appFilter === 'general' ? ' active' : ''}" data-filter="general">General</div>
            <div class="apprentice-filter-item${this.appFilter === 'triad' ? ' active' : ''}" data-filter="triad">Triad</div>
          </div>
        </div>
      </div>
      <div id="apprentice-view"></div>
    `;

    const filterBtn = document.getElementById('apprentice-filter-btn');
    const filterMenu = document.getElementById('apprentice-filter-menu');

    filterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      filterMenu.classList.toggle('active');
    });
    document.addEventListener('click', () => filterMenu.classList.remove('active'));
    filterMenu.querySelectorAll('.apprentice-filter-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        filterMenu.querySelectorAll('.apprentice-filter-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this.appFilter = item.dataset.filter;
        filterMenu.classList.remove('active');
        this.renderApprenticeView();
      });
    });

    this.renderApprenticeView();
  },

  renderApprenticeView() {
    const view = document.getElementById('apprentice-view');
    if (!view) return;

    if (this.appFilter === 'triad') {
      this.renderTriads(view);
    } else {
      this.renderGeneral(view);
    }
  },

  renderGeneral(view) {
    view.innerHTML = `
      <div class="card applicant-list">
        ${this.applicants.map((a, i) => {
          const avatar = a.avatar
            ? `<img src="${escapeHtml(a.avatar)}" class="applicant-avatar" alt="">`
            : `<div class="applicant-avatar applicant-avatar-fallback">${escapeHtml(a.name.charAt(0).toUpperCase() || 'G')}</div>`;
          return `
            <div class="applicant-row" title="View profile" onclick="reqInstance.viewProfile('${a.user_id}')">
              <span class="applicant-rank">${i + 1}</span>
              ${avatar}
              <div class="applicant-info">
                <span class="applicant-name">${escapeHtml(a.name)}</span>
                <span class="applicant-gp">${a.gp} GP</span>
              </div>
            </div>
          `;
        }).join('') || '<p class="text-muted">No applications yet.</p>'}
      </div>
    `;
  },

  renderTriads(view) {
    const triads = [
      { name: 'Team Dynamo', color: 'var(--brand-primary)', members: [] },
      { name: 'Team Sentinel', color: 'var(--success)', members: [] },
      { name: 'Team Ruminate', color: 'var(--warning)', members: [] }
    ];

    this.applicants.slice(0, 9).forEach((user, index) => {
      triads[index % 3].members.push(user);
    });

    triads.forEach(t => {
      t.members.sort((a, b) => b.gp - a.gp);
      t.total = t.members.reduce((sum, m) => sum + m.gp, 0);
    });
    triads.sort((a, b) => b.total - a.total);

    view.innerHTML = `
      <div class="triad-grid">
        ${triads.map(t => `
          <div class="triad-box">
            <div class="triad-head">
              <span class="triad-name" style="color: ${t.color};">${t.name}</span>
              <span class="triad-total">${t.total} GP</span>
            </div>
            <div class="triad-members">
              ${t.members.map((m, mi) => {
                const avatar = m.avatar
                  ? `<img src="${escapeHtml(m.avatar)}" class="triad-avatar" alt="">`
                  : `<div class="triad-avatar triad-avatar-fallback">${escapeHtml(m.name.charAt(0).toUpperCase() || 'G')}</div>`;
                return `
                <div class="triad-member" title="View profile" onclick="reqInstance.viewProfile('${m.user_id}')">
                  <span class="triad-rank">${mi + 1}</span>
                  ${avatar}
                  <div class="triad-member-info">
                    <span class="triad-member-name">${escapeHtml(m.name)}</span>
                    <span class="triad-gp">${m.gp} GP</span>
                  </div>
                </div>
              `}).join('') || '<span class="text-muted">Pending...</span>'}
            </div>
          </div>
        `).join('')}
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
                      ${isCorporate
                        ? `${logo
                            ? `<img src="${escapeHtml(logo)}" class="queue-logo" alt="">`
                            : `<div class="queue-logo queue-logo-fallback">${escapeHtml(name.charAt(0).toUpperCase())}</div>`
                          }<span class="queue-name">${escapeHtml(name)}</span>`
                        : `<span class="queue-user-link" title="View profile" onclick="reqInstance.viewProfile('${deal.user_id}')">${logo
                            ? `<img src="${escapeHtml(logo)}" class="queue-logo" alt="">`
                            : `<div class="queue-logo queue-logo-fallback">${escapeHtml(name.charAt(0).toUpperCase())}</div>`
                          }<span class="queue-name">${escapeHtml(name)}</span></span>`
                      }
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

  /* Returns true when the user may queue another gig. Trial and Pay n' Go are
     capped (dealCap, default 3 open gigs); Pro is unlimited; wallet blocked. */
  async dealAccessAllowed() {
    if (this.billingTier === 'wallet') {
      await appAlert("Deals and Projects are part of a subscription. Switch to Pay n' Go (up to " + this.dealCap + " active gigs) or Pro (unlimited) to bring us work.");
      goToBilling();
      return false;
    }
    if (this.billingTier === 'trial' || this.billingTier === 'payngo') {
      const mine = this.queue.filter(d => d.user_id === store.user.id).length;
      if (mine >= this.dealCap) {
        await appAlert(`You already have ${mine} active gig${mine === 1 ? '' : 's'} — your plan allows ${this.dealCap}. Finish or cancel one first, or go Pro for unlimited gigs.`);
        return false;
      }
    }
    return true;
  },

  async toggleDealForm() {
    const card = document.getElementById('deal-form-card');
    if (!card) return;
    const opening = card.style.display === 'none';
    if (opening && !await this.dealAccessAllowed()) return;
    card.style.display = opening ? 'block' : 'none';
    if (opening) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  async submitDeal() {
    const typeEl = document.querySelector('input[name="deal-type"]:checked');
    const dealType = typeEl ? typeEl.value : 'personal';
    const description = document.getElementById('deal-description').value.trim();
    const budget = document.getElementById('deal-budget').value.trim();
    const timeline = document.getElementById('deal-timeline').value.trim();

    if (!description) return alert("Please describe the job.");
    if (!await this.dealAccessAllowed()) return;

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
    if (error) {
      const msg = error.message || '';
      if (msg.includes('DEALS_REQUIRE_SUBSCRIPTION')) {
        return alert("Deals and Projects are part of a subscription. Switch to Pay n' Go or Pro to bring us work.");
      }
      if (msg.includes('DEAL_LIMIT_REACHED')) {
        return alert(`You've reached the ${this.dealCap} active gigs your plan allows. Finish or cancel one, or go Pro for unlimited gigs.`);
      }
      return alert("Error: " + error.message);
    }

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
  },

  viewProfile(userId) {
    if (!userId) return;
    sessionStorage.setItem('view_profile_id', userId);
    window.location.hash = '#/profile';
  }
};
