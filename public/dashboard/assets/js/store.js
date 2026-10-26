import { supabase } from '/shared/js/config.js';

// Tier icon SVGs for display next to usernames based on GP
export function tierIcon(gp) {
  if (gp >= 10000) return '<svg class="tier-icon tier-star" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
  if (gp >= 5000) return '<svg class="tier-icon tier-tick" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#1DA1F2" stroke="#1DA1F2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
  if (gp >= 1000) return '<svg class="tier-icon tier-pen" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>';
  if (gp >= 500) return '<svg class="tier-icon tier-bulb" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg>';
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
      const baseCols = 'full_name, avatar_url, total_gp, wallet_balance, is_admin';
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
