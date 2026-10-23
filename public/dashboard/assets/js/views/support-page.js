import supportView from './support.js?v=34';

export default {
  title: 'Support',
  get template() { return supportView.template; },
  init() { supportView.init(); },
  destroy() { supportView.destroy(); }
};
