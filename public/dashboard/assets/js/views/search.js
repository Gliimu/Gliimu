import feedView from './xplore.js?v=132';
import { createSearchEngine } from '../search-engine.js?v=7';

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
