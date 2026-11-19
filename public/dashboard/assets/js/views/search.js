import feedView from './xplore.js?v=133';
import { createSearchEngine } from '../search-engine.js?v=8';

const engine = createSearchEngine({ feedView });

export default {
  title: 'Search',
  template: engine.template,
  init() {
    engine.init();
  },
  destroy() {
    engine.destroy();
  }
};
