import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';
import { uploadFile } from '../upload.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CATEGORIES = [
  'Branding',
  'Business Services',
  'Publishing',
  'Editing & Proofreading',
  'Writing',
  'Bulk Purchase',
  'WebApp Development',
  'Marketing',
  'Deep Mentorship',
  'Others'
];

const filterIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>';

export default {
  title: 'Gigs',
  template: `
    <div class="requests-layout" id="requests-container">
      <div id="tab-content"></div>
    </div>
  `,

  init() {
    this.queue = [];
    this.categoryFilter = 'all';
    this.filterOpen = false;

    const topbarDynamic = document.getElementById('topbar-dynamic-content');
    if (topbarDynamic) topbarDynamic.innerHTML = '';
    const topbarRight = document.getElementById('topbar-right-actions');
    if (topbarRight) topbarRight.innerHTML = '';

    window.reqInstance = {
      submitDeal: () => this.submitDeal(),
      setDealType: (type) => this.setDealType(type),
      toggleDealForm: () => this.toggleDealForm(),
      markDealDone: (id) => this.markDealDone(id),
      removeDeal: (id) => this.removeDeal(id),
      cancelMyDeal: (id) => this.cancelMyDeal(id),
      viewProfile: (userId) => this.viewProfile(userId),
      toggleFilter: () => this.toggleFilter(),
      setCategoryFilter: (cat) => this.setCategoryFilter(cat)
    };

    this.loadDeals();
  },

  toggleFilter() {
    this.filterOpen = !this.filterOpen;
    this.renderFilter();
    this.renderQueue();
  },

  setCategoryFilter(cat) {
    this.categoryFilter = cat;
    this.filterOpen = false;
    this.renderFilter();
    this.renderQueue();
  },

  renderFilter() {
    const right = document.getElementById('topbar-right-actions');
    if (!right) return;

    const label = this.categoryFilter === 'all' ? 'All Categories' : this.categoryFilter;
    right.innerHTML = `
      <div class="apprentice-filter-wrap">
        <button type="button" class="apprentice-filter-btn" id="queue-filter-btn" onclick="reqInstance.toggleFilter()">${filterIcon}<span class="queue-filter-label">${escapeHtml(label)}</span></button>
        ${this.filterOpen ? `
          <div class="apprentice-filter-menu active" id="queue-filter-menu">
            <div class="apprentice-filter-item${this.categoryFilter === 'all' ? ' active' : ''}" onclick="reqInstance.setCategoryFilter('all')">All Categories</div>
            ${CATEGORIES.map(c => `
              <div class="apprentice-filter-item${this.categoryFilter === c ? ' active' : ''}" onclick="reqInstance.setCategoryFilter('${escapeHtml(c)}')">${escapeHtml(c)}</div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  },

  renderQueue() {
    const container = document.getElementById('tab-content');
    if (!container) return;

    const isAdmin = !!(store.profile && store.profile.is_admin);
    const mine = this.queue.filter(d => d.user_id === store.user.id);

    const filtered = this.categoryFilter === 'all'
      ? this.queue
      : this.queue.filter(d => (d.category || 'Others') === this.categoryFilter);

    container.innerHTML = `
      ${this.renderQueueCard(filtered, isAdmin)}
      ${this.renderDealForm(false)}
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

  async loadDeals() {
    const content = document.getElementById('tab-content');
    content.innerHTML = `<p style="color: var(--text-muted); text-align: center;">Loading...</p>`;

    const right = document.getElementById('topbar-right-actions');
    if (right) right.innerHTML = '';

    const { data, error } = await supabase
      .from('deals')
      .select('id, user_id, deal_type, category, relationship, company_name, company_logo_url, job_description, budget, timeline, status, created_at, profiles:profiles!deals_user_id_fkey(full_name, avatar_url)')
      .in('status', ['queued', 'in_progress'])
      .order('queue_position', { ascending: true });

    this.queue = error ? [] : (data || []);
    this.renderFilter();
    this.renderQueue();
  },

  renderQueueCard(filtered, isAdmin) {
    const total = this.queue.length;
    const showingFiltered = this.categoryFilter !== 'all' && filtered.length !== total;

    return `
      <div class="card queue-card">
        <div class="queue-card-head">
          <div>
            <h2>Gig Queue</h2>
            <p class="text-muted">Bring us a gig. We deliver in order, first come first served.</p>
          </div>
          <button type="button" class="btn-primary btn-sm" onclick="reqInstance.toggleDealForm()">
            <i class="fas fa-plus"></i> Add New Gig
          </button>
        </div>

        ${total === 0 ? `
          <p class="text-muted" style="margin-top: 20px;">The queue is empty. Be the first to bring us a gig.</p>
        ` : `
          ${showingFiltered ? `<p class="text-muted" style="margin-top: 12px;">Showing ${filtered.length} of ${total} gigs in <strong>${escapeHtml(this.categoryFilter)}</strong></p>` : ''}
          ${filtered.length === 0 ? `
            <p class="text-muted" style="margin-top: 12px;">No gigs in this category yet.</p>
          ` : `
            <div class="queue-list">
              ${filtered.map((deal, index) => {
                const isCorporate = deal.deal_type === 'corporate';
                const logo = isCorporate ? deal.company_logo_url : null;
                const name = isCorporate
                  ? (deal.company_name || 'A Partner')
                  : null;
                const isMine = deal.user_id === store.user.id;
                const globalIndex = this.queue.indexOf(deal);

                return `
                  <div class="queue-item${globalIndex === 0 ? ' is-next' : ''}${isMine ? ' is-mine' : ''}">
                    <div class="queue-pos">${globalIndex + 1}</div>
                    <div class="queue-body">
                      <div class="queue-head">
                        ${isCorporate
                          ? `${logo
                              ? `<img src="${escapeHtml(logo)}" class="queue-logo" alt="">`
                              : `<div class="queue-logo queue-logo-fallback">${escapeHtml(name.charAt(0).toUpperCase())}</div>`
                            }<span class="queue-name">${escapeHtml(name)}</span>`
                          : `<span class="queue-tag queue-tag-personal">Personal</span>`
                        }
                        <span class="queue-tag">${isCorporate ? 'Corporate' : 'Personal'}</span>
                        ${deal.category ? `<span class="queue-tag queue-tag-category">${escapeHtml(deal.category)}</span>` : ''}
                        ${globalIndex === 0 ? '<span class="queue-tag queue-tag-next">Next Up</span>' : ''}
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
        `}
      </div>
    `;
  },

  renderDealForm(open) {
    return `
      <div class="card form-card" id="deal-form-card" style="margin-top: 24px;${open ? '' : ' display: none;'}">
        <h2>Bring Us a Gig</h2>
        <p class="text-muted">A paid gig, a contract, a partnership idea. Tell us what you need built and we will put it in the queue.</p>

        <form onsubmit="event.preventDefault(); reqInstance.submitDeal()" style="margin-top: 24px;">
          <div class="form-group">
            <label>Who is this gig from?</label>
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
              <span class="text-muted">Shown on the gig board in place of your profile photo and name.</span>
            </div>
          </div>

          <div class="form-group">
            <label>Category</label>
            <select id="deal-category" class="input" required>
              <option value="">Select a category</option>
              ${CATEGORIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
            </select>
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

  async toggleDealForm() {
    const card = document.getElementById('deal-form-card');
    if (!card) return;
    const opening = card.style.display === 'none';
    card.style.display = opening ? 'block' : 'none';
    if (opening) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  async submitDeal() {
    const typeEl = document.querySelector('input[name="deal-type"]:checked');
    const dealType = typeEl ? typeEl.value : 'personal';
    const category = document.getElementById('deal-category').value.trim();
    const description = document.getElementById('deal-description').value.trim();
    const budget = document.getElementById('deal-budget').value.trim();
    const timeline = document.getElementById('deal-timeline').value.trim();

    if (!category) return alert("Please select a category.");
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

      try {
        companyLogoUrl = await uploadFile(logoFile, 'deal');
      } catch (err) {
        return alert("Logo upload failed: " + (err.message || err));
      }
    }

    const submitBtn = document.getElementById('deal-submit');
    if (submitBtn) submitBtn.disabled = true;

    const { error } = await supabase.from('deals').insert({
      user_id: store.user.id,
      deal_type: dealType,
      category,
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
        return alert("You need an active account to post gigs.");
      }
      return alert("Error: " + error.message);
    }

    await alert("Your gig is in the queue. We will reach out with the next steps.");
    this.loadDeals();
  },

  async markDealDone(id) {
    const deal = this.queue.find(d => d.id === id);
    if (!deal) return;

    const confirmed = await appConfirm("Mark this gig as done? It leaves the queue and the next one moves up.", { okText: 'Mark Done' });
    if (!confirmed) return;

    const { error } = await supabase.from('deals').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: store.user.id
    }).eq('id', id);

    if (error) return alert("Error: " + error.message);

    // Sent from the member dashboard, so these stay ordinary member-to-member
    // messages: flagging them would brand the sender as admin staff.
    const notices = [await supabase.from('messages').insert({
      sender_id: store.user.id,
      receiver_id: deal.user_id,
      content: 'Your gig has been completed and taken off the queue. Thank you for building with Gliimu.',
      is_ai: false
    }).select('id').single()];

    const { data: next, error: nextError } = await supabase.from('deals')
      .select('user_id')
      .eq('status', 'queued')
      .order('queue_position', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) {
      notices.push(await supabase.from('messages').insert({
        sender_id: store.user.id,
        receiver_id: next.user_id,
        content: "You're up next on the gig queue — your gig is now at the front of the queue.",
        is_ai: false
      }).select('id').single());
    }

    const failed = nextError || notices.some(result => result.error || !result.data?.id);
    await alert(failed
      ? 'Gig marked as done, but one or more notifications could not be confirmed. Check Ping before resending.'
      : 'Gig marked as done. The next gig is now up.');
    this.loadDeals();
  },

  async removeDeal(id) {
    const confirmed = await appConfirm("Remove this gig from the queue? The poster will not be notified.", { okText: 'Remove', danger: true });
    if (!confirmed) return;

    const { error } = await supabase.from('deals').update({ status: 'cancelled' }).eq('id', id);
    if (error) return alert("Error: " + error.message);
    await alert("Gig removed from the queue.");
    this.loadDeals();
  },

  async cancelMyDeal(id) {
    const confirmed = await appConfirm("Pull this gig out of the queue?", { okText: 'Cancel Gig', danger: true });
    if (!confirmed) return;

    const { error } = await supabase.from('deals').update({ status: 'cancelled' }).eq('id', id);
    if (error) return alert("Error: " + error.message);
    this.loadDeals();
  },

  viewProfile(userId) {
    if (!userId) return;
    sessionStorage.setItem('view_profile_id', userId);
    window.location.hash = '#/profile';
  }
};
