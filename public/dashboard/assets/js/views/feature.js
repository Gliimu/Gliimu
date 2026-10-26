import { supabase } from '/shared/js/config.js';
import { uploadFile } from '../upload.js';
import { store } from '../store.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function gliits(amount) {
  return 'G' + Number(amount || 0).toLocaleString();
}

export default {
  title: 'Feature Your Content',
  template: `
    <div class="feature-page-layout" id="feature-page-container">
      <p style="color: var(--text-muted); text-align: center; padding: 60px 20px;">Loading...</p>
    </div>
  `,

  async init() {
    window.featureInstance = this;
    this._imageFile = null;
    this._prices = { feature_1day: 5000, feature_1week: 30000, feature_1month: 110000 };
    await this.checkSlotsAndRender();
  },

  destroy() {
    this._imageFile = null;
  },

  async checkSlotsAndRender() {
    const container = document.getElementById('feature-page-container');
    if (!container) return;

    const { data, error } = await supabase.rpc('featured_slot_check');
    if (error) {
      container.innerHTML = `<div class="feature-page-card"><p>Could not check availability. Please try again.</p><a href="#/profile" class="feature-back-link">Back to profile</a></div>`;
      return;
    }

    const info = data || {};
    this._prices = info.prices || this._prices;

    if (!info.available) {
      container.innerHTML = `
        <div class="feature-page-card feature-unavailable">
          <div class="feature-unavailable-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <h2>Feature is Currently unavailable</h2>
          <p class="feature-unavailable-msg">All carousel slots are filled out at the moment. Please try again later or contact support in Ping.</p>
          <a href="#/profile" class="feature-back-link">Back to profile</a>
        </div>
      `;
      return;
    }

    this.renderForm(container, info);
  },

  renderForm(container, info) {
    const p1 = Number(this._prices.feature_1day || 5000);
    const p7 = Number(this._prices.feature_1week || 30000);
    const p30 = Number(this._prices.feature_1month || 110000);
    const balance = store.profile?.wallet_balance || 0;

    container.innerHTML = `
      <div class="feature-page-card">
        <a href="#/profile" class="feature-back-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          Back to profile
        </a>
        <h2>Feature Your Content</h2>
        <p class="feature-page-subtitle">Get your content in front of thousands of users on the XpLoRe carousel</p>
        <div class="feature-slots-info">
          <span class="feature-slots-dot available"></span>
          ${info.active || 0} of ${info.max_slots || 3} slots taken
        </div>

        <div class="feature-form">
          <label class="feature-label">Title <span class="feature-required">*</span></label>
          <input type="text" id="feature-title" class="feature-input" placeholder="What are you promoting?" maxlength="80">

          <label class="feature-label">Description <span class="feature-required">*</span></label>
          <textarea id="feature-desc" class="feature-input feature-textarea" placeholder="Describe your content in a few sentences..." maxlength="300"></textarea>

          <label class="feature-label">Image <span class="feature-required">*</span></label>
          <div class="feature-upload-area" id="feature-upload-area" onclick="document.getElementById('feature-image-input').click()">
            <input type="file" id="feature-image-input" accept="image/*" style="display:none" onchange="featureInstance.handleImage(this)">
            <div id="feature-upload-placeholder">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              <span>Click to upload an image</span>
            </div>
            <img id="feature-image-preview" style="display:none" alt="">
          </div>

          <label class="feature-label">Link URL</label>
          <input type="url" id="feature-link" class="feature-input" placeholder="https://example.com/your-content">

          <label class="feature-label">Link button text</label>
          <input type="text" id="feature-link-label" class="feature-input" placeholder="Learn more" maxlength="30">

          <label class="feature-label">Duration <span class="feature-required">*</span></label>
          <div class="feature-duration-options">
            <button type="button" class="feature-duration-btn active" data-days="1" data-price="${p1}" onclick="featureInstance.selectDuration(this)">
              <span class="feature-duration-period">1 Day</span>
              <span class="feature-duration-price">${gliits(p1)}</span>
            </button>
            <button type="button" class="feature-duration-btn" data-days="7" data-price="${p7}" onclick="featureInstance.selectDuration(this)">
              <span class="feature-duration-period">1 Week</span>
              <span class="feature-duration-price">${gliits(p7)}</span>
              ${p7 < p1 * 7 ? `<span class="feature-duration-save">Save ${gliits(p1 * 7 - p7)}</span>` : ''}
            </button>
            <button type="button" class="feature-duration-btn" data-days="30" data-price="${p30}" onclick="featureInstance.selectDuration(this)">
              <span class="feature-duration-period">1 Month</span>
              <span class="feature-duration-price">${gliits(p30)}</span>
              ${p30 < p1 * 30 ? `<span class="feature-duration-save">Save ${gliits(p1 * 30 - p30)}</span>` : ''}
            </button>
          </div>

          <div class="feature-wallet-info">
            Your wallet: <strong>${gliits(balance)}</strong>
          </div>

          <button class="feature-submit-btn" id="feature-submit-btn" onclick="featureInstance.submit()">
            Pay ${gliits(p1)} to submit for review
          </button>
          <p class="feature-page-note">Your submission will be reviewed by our team before going live. Payment is deducted from your wallet.</p>
        </div>
      </div>
    `;
  },

  handleImage(input) {
    const file = input.files[0];
    if (!file) return;
    this._imageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = document.getElementById('feature-image-preview');
      const placeholder = document.getElementById('feature-upload-placeholder');
      if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
      if (placeholder) placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  },

  selectDuration(btn) {
    document.querySelectorAll('.feature-duration-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const price = parseInt(btn.dataset.price, 10);
    const submitBtn = document.getElementById('feature-submit-btn');
    if (submitBtn) submitBtn.textContent = `Pay ${gliits(price)} to submit for review`;
  },

  async submit() {
    const title = document.getElementById('feature-title')?.value.trim();
    const desc = document.getElementById('feature-desc')?.value.trim();
    const link = document.getElementById('feature-link')?.value.trim();
    const linkLabel = document.getElementById('feature-link-label')?.value.trim();
    const activeBtn = document.querySelector('.feature-duration-btn.active');
    const days = activeBtn ? parseInt(activeBtn.dataset.days, 10) : 1;
    const price = activeBtn ? parseInt(activeBtn.dataset.price, 10) : 5000;

    if (!title) { appAlert('Please enter a title'); return; }
    if (!desc) { appAlert('Please enter a description'); return; }
    if (!this._imageFile) { appAlert('Please upload an image'); return; }

    const submitBtn = document.getElementById('feature-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Processing...'; }

    try {
      const imageUrl = await uploadFile(this._imageFile, 'media');

      const balance = store.profile?.wallet_balance || 0;
      if (balance < price) {
        appAlert(`Insufficient balance. You need ${gliits(price)} but have ${gliits(balance)}. Please top up your wallet.`);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = `Pay ${gliits(price)} to submit for review`; }
        return;
      }

      const { error: deductErr } = await supabase.rpc('deduct_wallet', { p_amount: price, p_description: `Featured content: ${title}` });
      if (deductErr) throw new Error('Payment failed: ' + deductErr.message);

      const startsAt = new Date().toISOString();
      const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      const { error: insertErr } = await supabase.from('featured_posts').insert({
        user_id: store.user.id,
        title,
        description: desc,
        image_url: imageUrl,
        link_url: link || null,
        link_label: linkLabel || null,
        price_paid: price,
        duration_days: days,
        starts_at: startsAt,
        ends_at: endsAt,
        status: 'pending'
      });
      if (insertErr) throw new Error('Submission failed: ' + insertErr.message);

      store.profile.wallet_balance = balance - price;
      appAlert('Your featured content has been submitted for review. You will be notified once it is approved.');
      window.location.hash = '#/profile';
    } catch (err) {
      appAlert(err.message || 'Something went wrong. Please try again.');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = `Pay ${gliits(price)} to submit for review`; }
    }
  }
};
