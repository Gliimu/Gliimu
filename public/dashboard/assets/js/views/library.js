export default {
  title: 'Library',
  template: `
    <div class="library-layout">
      <div class="library-header">
        <div>
          <h2>Gliimu Elite Library</h2>
          <p>Premium publications, audiolites, and bundles.</p>
        </div>
        <div class="subscription-badge">
          <span>Elite Sub: Active</span>
        </div>
      </div>

      <div class="library-tabs">
        <button class="lib-tab active">All</button>
        <button class="lib-tab">Bundles</button>
        <button class="lib-tab">Publications</button>
        <button class="lib-tab">Audiolites</button>
      </div>

      <div class="lib-masonry-grid" id="library-grid">
        <!-- Items injected by JS -->
      </div>
    </div>
  `,
  init() {
    const items = [
      { id: 1, type: 'bundle', title: 'Ultimate Media Kit', author: 'Gliimu Ltd', color: 'linear-gradient(135deg, #F97316, #F59E0B)', desc: 'All the tools, presets, and templates you need to launch your media empire.' },
      { id: 2, type: 'publication', title: 'Business Services Playbook', author: 'Captain A.', color: 'linear-gradient(135deg, #10B981, #06B6D4)', desc: 'A comprehensive guide to structuring your freelance business for high-ticket clients.' },
      { id: 3, type: 'audiolite', title: 'Mindset of an Elite Gliimait', author: 'Captain B.', color: 'linear-gradient(135deg, #3B82F6, #8B5CF6)', desc: 'Audio series on building the mental resilience required for independent success.' },
      { id: 4, type: 'publication', title: 'Elite Freelancing Guide', author: 'Gliimu Ltd', color: 'linear-gradient(135deg, #F59E0B, #EF4444)', desc: 'How to find, pitch, and close premium clients globally.' },
      { id: 5, type: 'bundle', title: 'Full Stack Media Architecture', author: 'Gliimu Originals', color: 'linear-gradient(135deg, #6366F1, #8B5CF6)', desc: 'The complete blueprint for building media empires from scratch.' },
      { id: 6, type: 'audiolite', title: 'Creative Flow States', author: 'Captain C.', color: 'linear-gradient(135deg, #0F172A, #334155)', desc: 'Audio guides for entering deep work and creative flow.' }
    ];

    const grid = document.getElementById('library-grid');
    grid.innerHTML = items.map(item => `
      <div class="lib-card lib-${item.type}" onclick="libraryInstance.openDetails('${item.title}', '${item.author}', '${item.desc}')">
        <div class="lib-thumb" style="background: ${item.color};">
          <span class="lib-type">${item.type}</span>
        </div>
        <div class="lib-overlay">
          <h4>${item.title}</h4>
        </div>
      </div>
    `).join('');

    window.libraryInstance = {
      openDetails: (title, author, desc) => this.openDetails(title, author, desc)
    };
  },
  openDetails(title, author, desc) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        <h2 style="margin-bottom: var(--space-2); font-size: var(--fs-xl);">${title}</h2>
        <p style="color: var(--text-muted); margin-bottom: var(--space-6); font-size: var(--fs-sm);">by ${author}</p>
        <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: var(--space-6);">${desc}</p>
        <button class="btn-primary" style="width: 100%;" onclick="alert('Purchase logic will go here'); this.parentElement.parentElement.remove();">Unlock with Wallet</button>
      </div>
    `;
    document.body.appendChild(modal);
  }
};
