import hubView from './gliims.js?v=128';

export default {
  title: 'Publish',
  template: `
    <div class="publish-page-wrapper">
      <div id="publish-mount"></div>
    </div>
  `,

  init() {
    hubView.openCreateModal({ inline: true, mountPoint: '#publish-mount' });
  },

  destroy() {}
};
