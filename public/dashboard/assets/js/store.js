import { supabase } from '/shared/js/config.js';

const _badgeSvgs = {
  tick: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" class="badge-icon badge-tick"><path d="M7.29417 12.9577L10.5048 16.1681L17.6729 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/></svg>`,
  pen: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="badge-icon badge-pen"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.25 22C3.25 21.5858 3.58579 21.25 4 21.25H20C20.4142 21.25 20.75 21.5858 20.75 22C20.75 22.4142 20.4142 22.75 20 22.75H4C3.58579 22.75 3.25 22.4142 3.25 22Z"/><path d="M11.5201 14.929L11.5201 14.9289L17.4368 9.01225C16.6315 8.6771 15.6777 8.12656 14.7757 7.22455C13.8736 6.32238 13.323 5.36846 12.9879 4.56312L7.07106 10.4799L7.07101 10.48C6.60932 10.9417 6.37846 11.1725 6.17992 11.4271C5.94571 11.7273 5.74491 12.0522 5.58107 12.396C5.44219 12.6874 5.33894 12.9972 5.13245 13.6167L4.04356 16.8833C3.94194 17.1882 4.02128 17.5243 4.2485 17.7515C4.47573 17.9787 4.81182 18.0581 5.11667 17.9564L8.38334 16.8676C9.00281 16.6611 9.31256 16.5578 9.60398 16.4189C9.94775 16.2551 10.2727 16.0543 10.5729 15.8201C10.8275 15.6215 11.0584 15.3907 11.5201 14.929Z"/><path d="M19.0786 7.37044C20.3071 6.14188 20.3071 4.14999 19.0786 2.92142C17.85 1.69286 15.8581 1.69286 14.6296 2.92142L13.9199 3.63105C13.9296 3.6604 13.9397 3.69015 13.9502 3.72028C14.2103 4.47 14.701 5.45281 15.6243 6.37602C16.5475 7.29923 17.5303 7.78999 18.28 8.05009C18.31 8.0605 18.3396 8.07054 18.3688 8.08021L19.0786 7.37044Z"/></svg>`,
};

export function badgeIcon(badge) {
  return _badgeSvgs[badge] || '';
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
