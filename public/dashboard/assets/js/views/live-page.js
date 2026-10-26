import liveView from './live.js?v=6';

export default {
  title: 'Live',
  get template() { return liveView.template; },
  init() { liveView.init(); },
  destroy() { /* liveView has no destroy method */ }
};
