import { supabase } from '/shared/js/config.js';

export const store = {
  user: null,
  profile: null,

  async fetchUser() {
    const { data: { user } } = await supabase.auth.getUser();
    this.user = user;

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name, avatar_url, total_gp')
        .eq('id', user.id)
        .single();

      this.profile = profile || { username: 'Gliimait', full_name: 'User', total_gp: 0 };
    }

    return this.user;
  },

  async signOut() {
    await supabase.auth.signOut();
    window.location.href = '/auth.html';
  }
};
