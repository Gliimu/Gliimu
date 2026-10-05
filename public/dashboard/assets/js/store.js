import { supabase } from '/shared/js/config.js';

// GP tier border for avatars: 1000+ purple, 5000+ black (light) / white (dark)
export function tierClass(gp, base) {
  if (gp >= 5000) return `${base} tier-5000-avatar`;
  if (gp >= 1000) return `${base} glow-avatar`;
  return base;
}

export const store = {
  user: null,
  profile: null,

  async fetchUser() {
    const { data: { user } } = await supabase.auth.getUser();
    this.user = user;

    if (user) {
      // Fetch live data from the profiles table instead of just signup metadata
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('username, full_name, avatar_url, total_gp, wallet_balance, is_admin')
        .eq('id', user.id)
        .single();

      if (profile) {
        this.profile = profile;
      } else {
        // Fallback to metadata if profile table fetch fails
        this.profile = {
          username: user.user_metadata?.username || 'Gliimait',
          full_name: user.user_metadata?.full_name || 'User',
          total_gp: 0,
          avatar_url: null,
          wallet_balance: 0,
          is_admin: false
        };
      }
    }

    return this.user;
  },

  async signOut() {
    await supabase.auth.signOut();
    window.location.href = '/auth.html';
  }
};
