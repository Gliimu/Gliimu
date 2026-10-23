import liveView from './live.js';

export default {
  title: 'Live',
  get template() { return liveView.template; },
  init() { liveView.init(); },
  destroy() { liveView.destroy(); }
};
