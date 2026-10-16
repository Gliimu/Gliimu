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
      // Own username comes from the JWT (user_metadata), never from profiles:
      // the profiles.username column is revoked from anon/authenticated so no
      // member can read another's handle. Selecting it here would error the
      // whole query, so it is deliberately omitted from baseCols.
      const baseCols = 'full_name, avatar_url, total_gp, wallet_balance, is_admin';
      let { data: profile } = await supabase
        .from('profiles')
        .select(`${baseCols}, tier, trial_ends_at, subscription_expires_at`)
        .eq('id', user.id)
        .single();

      if (!profile) {
        // Pre-migration fallback: billing columns may not exist yet.
        ({ data: profile } = await supabase
          .from('profiles')
          .select(baseCols)
          .eq('id', user.id)
          .single());
      }

      if (profile) {
        profile.username = user.user_metadata?.username || 'Gliimait';
        this.profile = profile;
      } else {
        // Fallback to metadata if profile table fetch fails
        this.profile = {
          username: user.user_metadata?.username || 'Gliimait',
          full_name: user.user_metadata?.full_name || 'User',
          total_gp: 0,
          avatar_url: null,
          wallet_balance: 0,
          is_admin: false,
          tier: 'trial',
          trial_ends_at: null,
          subscription_expires_at: null
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
