import liveView from './live.js?v=22';

export default {
  title: 'Live',
  get template() { return liveView.template; },
  init() { liveView.init(); },
  destroy() { liveView.destroy(); }
};
