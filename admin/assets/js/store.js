import { supabase } from './config.js';

export const ROLE_LABELS = {
  super: 'Super Admin',
  crm: 'CRM',
  registrar: 'Registrar',
  captain: 'Captain / Instructor',
  operations: 'Operations'
};

export const store = {
  user: null,
  profile: null,
  role: null,

  // admin_users has no read policy for authenticated users, so the role comes
  // from the SECURITY DEFINER helper rather than a table read.
  async fetchSession() {
    const { data: { user } } = await supabase.auth.getUser();
    this.user = user;

    if (!user) {
      this.profile = null;
      this.role = null;
      return null;
    }

    const { data: role } = await supabase.rpc('current_admin_role');
    this.role = role || null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('username, full_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    this.profile = profile || null;

    return user;
  },

  // Super implies every role, matching admin_has_role() in SQL.
  can(role) {
    return this.role === 'super' || this.role === role;
  },

  get roleLabel() {
    return ROLE_LABELS[this.role] || '';
  },

  get displayName() {
    return (this.profile && (this.profile.full_name || this.profile.username)) || 'Admin';
  },

  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return this.fetchSession();
  },

  async signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }
};
