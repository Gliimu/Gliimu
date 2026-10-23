import supportView from './support.js?v=36';

export default {
  title: 'Support',
  get template() { return supportView.template; },
  init() { supportView.init(); },
  destroy() { supportView.destroy(); }
};
