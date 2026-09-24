// FIXED: Added an extra ../ to escape the dashboard folder
import { supabase } from '../../../shared/js/config.js';

export const store = {
  user: null,
  profile: null,

  async fetchUser() {
    const { data: { user } } = await supabase.auth.getUser();
    this.user = user;

    if (user) {
      // Extract data from the metadata we saved during signup
      this.profile = {
        username: user.user_metadata?.username || 'Gliimait',
        full_name: user.user_metadata?.full_name || 'User',
      };
    }

    return this.user;
  },

  async signOut() {
    await supabase.auth.signOut();
    window.location.href = '/auth.html';
  }
};
