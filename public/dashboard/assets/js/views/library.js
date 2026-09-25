export default {
  title: 'Library',
  template: `
    <div class="library-layout">
      <div class="library-header">
        <div>
          <h2>Gliimu Elite Library</h2>
          <p>Premium publications, documentaries, research, and bundles.</p>
        </div>
        <div class="subscription-badge">
          <span>Elite Sub: Active</span>
        </div>
      </div>

      <div class="library-tabs">
        <button class="lib-tab active">All</button>
        <button class="lib-tab">Documentaries</button>
        <button class="lib-tab">Publications</button>
        <button class="lib-tab">Audiobooks</button>
        <button class="lib-tab">Bundles</button>
      </div>

      <div class="masonry-grid" id="library-grid">

        <!-- Documentary (Horizontal) -->
        <div class="library-item lib-horizontal">
          <div class="lib-thumb" style="background: linear-gradient(135deg, #6366F1, #8B5CF6);">
            <span class="lib-type">DOCUMENTARY</span>
          </div>
          <div class="lib-info">
            <h4>Full Stack Media: The Documentary</h4>
            <p class="lib-author">by Gliimu Originals</p>
            <div class="lib-footer">
              <span class="lib-price">₦15,000</span>
              <button class="btn-primary btn-sm">Buy Now</button>
            </div>
          </div>
        </div>

        <!-- Publication / Book (Vertical) -->
        <div class="library-item lib-vertical">
          <div class="lib-thumb" style="background: linear-gradient(135deg, #10B981, #06B6D4);">
            <span class="lib-type">PUBLICATION</span>
          </div>
          <div class="lib-info">
            <h4>Business Services Playbook</h4>
            <p class="lib-author">by Captain A.</p>
            <div class="lib-footer">
              <span class="lib-price">₦7,500</span>
              <button class="btn-primary btn-sm">Buy Now</button>
            </div>
          </div>
        </div>

        <!-- Audiobook (Square) -->
        <div class="library-item lib-square">
          <div class="lib-thumb" style="background: linear-gradient(135deg, #3B82F6, #8B5CF6);">
            <span class="lib-type">AUDIOBOOK</span>
          </div>
          <div class="lib-info">
            <h4>Mindset of an Elite Gliimait</h4>
            <p class="lib-author">by Captain B.</p>
            <div class="lib-footer">
              <span class="lib-price">₦5,000</span>
              <button class="btn-primary btn-sm">Buy Now</button>
            </div>
          </div>
        </div>

        <!-- Publication / Book (Vertical) -->
        <div class="library-item lib-vertical">
          <div class="lib-thumb" style="background: linear-gradient(135deg, #F59E0B, #EF4444);">
            <span class="lib-type">PUBLICATION</span>
          </div>
          <div class="lib-info">
            <h4>Elite Freelancing Guide</h4>
            <p class="lib-author">by Gliimu Ltd</p>
            <div class="lib-footer">
              <span class="lib-price">₦6,000</span>
              <button class="btn-primary btn-sm">Buy Now</button>
            </div>
          </div>
        </div>

        <!-- Bundle (Square) -->
        <div class="library-item lib-square">
          <div class="lib-thumb" style="background: linear-gradient(135deg, #F97316, #F59E0B);">
            <span class="lib-type">BUNDLE</span>
          </div>
          <div class="lib-info">
            <h4>Ultimate Media Kit</h4>
            <p class="lib-author">by Gliimu Ltd</p>
            <div class="lib-footer">
              <span class="lib-price">₦45,000</span>
              <button class="btn-primary btn-sm">Buy Now</button>
            </div>
          </div>
        </div>

        <!-- Documentary (Horizontal) -->
        <div class="library-item lib-horizontal">
          <div class="lib-thumb" style="background: linear-gradient(135deg, #0F172A, #334155);">
            <span class="lib-type">DOCUMENTARY</span>
          </div>
          <div class="lib-info">
            <h4>Building from Scratch: No Code</h4>
            <p class="lib-author">by Captain C.</p>
            <div class="lib-footer">
              <span class="lib-price">₦12,000</span>
              <button class="btn-primary btn-sm">Buy Now</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  `,
  init() {
    console.log('Library View Loaded');
  }
};
