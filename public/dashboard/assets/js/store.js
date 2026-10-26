import { supabase } from '/shared/js/config.js';

// Verification badge icons displayed next to usernames
export function badgeIcon(badge) {
  if (badge === 'tick' || badge === 'pen' || badge === 'pod')
    return `<img src="/icons/${badge}.svg?v=3" alt="${badge}" class="badge-icon badge-${badge}" width="14" height="14">`;
  return '';
}

// Backward-compatible alias
export function tierIcon(badgeOrGp) {
  if (typeof badgeOrGp === 'string') return badgeIcon(badgeOrGp);
  return '';
}

// Returns just the base class (tier borders removed)
export function tierClass(gp, base) {
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
      const baseCols = 'full_name, avatar_url, total_gp, wallet_balance, is_admin, verification_badge';
      let { data: profile } = await supabase
        .from('profiles')
        .select(baseCols)
        .eq('id', user.id)
        .single();

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
          verification_badge: null
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
