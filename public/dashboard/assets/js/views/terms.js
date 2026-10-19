import { supabase } from '/shared/js/config.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const termsView = {
  title: 'Terms and Policy',
  
  template: `
    <div style="max-width:800px;margin:0 auto;padding:24px;">
      <div id="terms-content">
        <p style="color:var(--text-muted);text-align:center;margin-top:40px;">Loading...</p>
      </div>
    </div>
  `,

  async init() {
    const { data, error } = await supabase.from('legal_documents')
      .select('content, updated_at')
      .eq('type', 'terms')
      .single();

    const container = document.getElementById('terms-content');
    if (!container) return;

    if (error || !data) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;">No terms document found.</p>';
      return;
    }

    const lastUpdated = new Date(data.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    container.innerHTML = `
      <div style="margin-bottom:16px;font-size:13px;color:var(--text-muted);">Last updated: ${lastUpdated}</div>
      <div style="line-height:1.6;">${data.content}</div>
    `;
  },

  destroy() {}
};

export default termsView;
