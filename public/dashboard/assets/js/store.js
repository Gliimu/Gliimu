import { supabase } from '/shared/js/config.js';

const _badgeSvgs = {
  tick: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="badge-icon badge-tick"><path d="M12,2A10,10,0,1,0,22,12,10,10,0,0,0,12,2Zm5.676,8.237-6,5.5a1,1,0,0,1-1.383-.03l-3-3a1,1,0,1,1,1.414-1.414l2.323,2.323,5.294-4.853a1,1,0,1,1,1.352,1.474Z"/></svg>`,
  pen: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="badge-icon badge-pen"><path d="M21.1938 2.80624C22.2687 3.88124 22.2687 5.62415 21.1938 6.69914L20.6982 7.19469C20.5539 7.16345 20.3722 7.11589 20.1651 7.04404C19.6108 6.85172 18.8823 6.48827 18.197 5.803C17.5117 5.11774 17.1483 4.38923 16.956 3.8349C16.8841 3.62781 16.8366 3.44609 16.8053 3.30179L17.3009 2.80624C18.3759 1.73125 20.1188 1.73125 21.1938 2.80624Z"/><path d="M14.5801 13.3128C14.1761 13.7168 13.9741 13.9188 13.7513 14.0926C13.4886 14.2975 13.2043 14.4732 12.9035 14.6166C12.6485 14.7381 12.3775 14.8284 11.8354 15.0091L8.97709 15.9619C8.71035 16.0508 8.41626 15.9814 8.21744 15.7826C8.01862 15.5837 7.9492 15.2897 8.03811 15.0229L8.99089 12.1646C9.17157 11.6225 9.26191 11.3515 9.38344 11.0965C9.52679 10.7957 9.70249 10.5114 9.90743 10.2487C10.0812 10.0259 10.2832 9.82394 10.6872 9.41993L15.6033 4.50385C15.867 5.19804 16.3293 6.05663 17.1363 6.86366C17.9434 7.67069 18.802 8.13296 19.4962 8.39674L14.5801 13.3128Z"/><path d="M12 22C17.5228 22 22 17.5228 22 12C22 10.8082 21.7915 9.66511 21.409 8.60519L15.586 14.4283C15.2347 14.7797 14.9708 15.0437 14.6738 15.2753C14.3252 15.5473 13.948 15.7804 13.5488 15.9706C13.2088 16.1327 12.8546 16.2506 12.3833 16.4076L9.45143 17.3849C8.64568 17.6535 7.75734 17.4438 7.15678 16.8432C6.55621 16.2427 6.34651 15.3543 6.61509 14.5486L7.59236 11.6167C7.74936 11.1453 7.86732 10.7912 8.02935 10.4512C8.21958 10.052 8.45272 9.6748 8.72466 9.32615C8.9563 9.02918 9.22033 8.76527 9.57173 8.41403L15.3948 2.59098C14.3349 2.20849 13.1918 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"/></svg>`,
  pod: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="badge-icon badge-pod"><path d="M10.8372 10.5455C10.8372 10.1438 10.5248 9.81818 10.1395 9.81818H8.58141C8.90462 8.15837 10.3124 6.90909 12 6.90909C13.6876 6.90909 15.0954 8.15837 15.4186 9.81818H12.9302C12.5449 9.81818 12.2326 10.1438 12.2326 10.5455C12.2326 10.9471 12.5449 11.2727 12.9302 11.2727H15.4884V12.7273H12.9302C12.5449 12.7273 12.2326 13.0529 12.2326 13.4545C12.2326 13.8562 12.5449 14.1818 12.9302 14.1818H15.4186C15.1411 15.6066 14.0645 16.7289 12.6977 17.0182V19.2727C12.6977 19.6744 12.3853 20 12 20C11.6147 20 11.3023 19.6744 11.3023 19.2727V17.0182C9.93549 16.7289 8.85886 15.6066 8.58141 14.1818H10.1395C10.5248 14.1818 10.8372 13.8562 10.8372 13.4545C10.8372 13.0529 10.5248 12.7273 10.1395 12.7273H8.51163V11.2727H10.1395C10.5248 11.2727 10.8372 10.9471 10.8372 10.5455Z"/><path d="M12 4C8.67054 4 5.94634 6.70128 5.73422 10.1161C5.38211 9.92573 4.98218 9.81818 4.55814 9.81818C3.14532 9.81818 2 11.0121 2 12.4848V14.4242C2 15.897 3.14532 17.0909 4.55814 17.0909C4.60616 17.0909 4.65388 17.0895 4.70125 17.0868V17.0909C6.03503 17.0909 7.11628 15.9638 7.11628 14.5734V10.5454C7.11628 7.73382 9.30279 5.45455 12 5.45455C14.6972 5.45455 16.8837 7.73382 16.8837 10.5454V14.5734C16.8837 15.9638 17.9649 17.0909 19.2987 17.0909V17.0868C19.3461 17.0895 19.3938 17.0909 19.4419 17.0909C20.8547 17.0909 22 15.897 22 14.4242V12.4848C22 11.0121 20.8547 9.81818 19.4419 9.81818C19.0178 9.81818 18.6179 9.92574 18.2657 10.1161C18.0536 6.70129 15.3294 4 12 4Z"/></svg>`
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
