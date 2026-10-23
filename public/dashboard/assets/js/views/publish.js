import hubView from './feed-gliims.js?v=76';

export default {
  title: 'Publish',
  template: `
    <div class="publish-page-wrapper" style="padding: 24px; max-width: 900px; margin: 0 auto;">
      <div id="publish-mount"></div>
    </div>
  `,

  init() {
    hubView.openCreateModal({ inline: true, mountPoint: '#publish-mount' });
  },

  destroy() {}
};
