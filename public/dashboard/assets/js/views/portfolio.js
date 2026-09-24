import { supabase } from '/shared/js/config.js';
import { store } from '../store.js';

export default {
  title: 'Portfolio',
  template: `
    <div class="portfolio-layout" id="portfolio-container">
      <p style="color: var(--text-muted); text-align: center;">Loading portfolio...</p>
    </div>
  `,
  async init() {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', store.user.id)
      .single();

    const container = document.getElementById('portfolio-container');

    // SAFETY CHECK: If user clicked away to another tab while loading, stop execution.
    if (!container) return;

    if (error || !profile) {
      container.innerHTML = '<p style="color: var(--error); text-align: center;">Failed to load portfolio.</p>';
      return;
    }

    const skills = profile.skills?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const interests = profile.interests?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const avatarHtml = profile.avatar_url
      ? `<img src="${profile.avatar_url}" class="portfolio-avatar" style="object-fit: cover;">`
      : `<div class="portfolio-avatar">${profile.full_name?.charAt(0).toUpperCase() || 'G'}</div>`;

    container.innerHTML = `
      <div class="card printable-portfolio">
        <div class="portfolio-header">
          ${avatarHtml}
          <div>
            <h1>${profile.full_name || 'Gliimait'}</h1>
            <p class="portfolio-username">@${profile.username}</p>
          </div>
          <button class="btn-primary print-btn" onclick="window.print()">Print / Save PDF</button>
        </div>

        <div class="portfolio-section">
          <h3>About</h3>
          <p>${profile.bio || 'No bio added yet.'}</p>
        </div>

        <div class="portfolio-section">
          <h3>Skills & Proficiency</h3>
          <div class="tag-group">
            ${skills.map(skill => `<span class="tag tag-primary">${skill}</span>`).join('')}
          </div>
        </div>

        <div class="portfolio-section">
          <h3>Interests</h3>
          <div class="tag-group">
            ${interests.map(interest => `<span class="tag tag-secondary">${interest}</span>`).join('')}
          </div>
        </div>

        <div class="portfolio-footer">
          <p>Gliimu Certified Full Stack Media Architect in Training</p>
        </div>
      </div>
    `;
  }
};
