import type { AuthChangeEvent, User as SupabaseUser } from '@supabase/supabase-js';
import type { UserRole } from '../types';
import { getSupabaseClient } from '../lib/supabase';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  provider: 'supabase';
}

export type AuthStateListener = (user: AuthUser | null, event: AuthChangeEvent) => void;

const normalizeRole = (role: unknown): UserRole => {
  return role === 'tailor' || role === 'fabric_seller' || role === 'admin' || role === 'buyer'
    ? role
    : 'buyer';
};

const normalizeSupabaseUser = (user: SupabaseUser): AuthUser => {
  const metadata = user.user_metadata ?? {};
  const appMetadata = user.app_metadata ?? {};
  const email = user.email ?? '';
  const isSuperAdmin = email.trim().toLowerCase() === 'fountainsdata234@gmail.com'
    || appMetadata.is_super_admin === true;
  const isAdmin = isSuperAdmin
    || appMetadata.role === 'admin'
    || appMetadata.is_admin === true;
  const metadataRole = metadata.role ?? metadata.user_role;
  const role = isAdmin
    ? 'admin'
    : normalizeRole(metadataRole === 'admin' ? undefined : metadataRole ?? appMetadata.role);
  const name = typeof metadata.name === 'string'
    ? metadata.name.trim()
    : email.split('@')[0] || 'Atelier Member';
  const avatarUrl = typeof metadata.avatar_url === 'string'
    ? metadata.avatar_url
    : typeof metadata.picture === 'string'
      ? metadata.picture
      : undefined;

  return {
    id: user.id,
    email,
    name,
    role,
    avatarUrl,
    isAdmin,
    isSuperAdmin,
    createdAt: user.created_at,
    provider: 'supabase',
  };
};

export const isSupabaseAuthReady = Boolean(getSupabaseClient());

const requireSupabase = () => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase authentication is not configured.');
  return supabase;
};

export const configureAuth = async () => {
  await requireSupabase().auth.getSession();
};

export const subscribeToAuth = (listener: AuthStateListener) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    listener(null, 'INITIAL_SESSION');
    return () => undefined;
  }
  const subscription = supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user;
    listener(user ? normalizeSupabaseUser(user) : null, event);
  });
  return () => subscription.data.subscription.unsubscribe();
};

export const getCurrentAuthUser = async (): Promise<AuthUser | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ? normalizeSupabaseUser(user) : null;
};

export const getAuthToken = async (): Promise<string | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
};

export const getAuthUserId = async (): Promise<string | null> => {
  const user = await getCurrentAuthUser();
  return user?.id ?? null;
};

export const signInWithEmail = async (email: string, password: string): Promise<AuthUser> => {
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return normalizeSupabaseUser(data.user);
};

export const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<AuthUser> => {
  const { data, error } = await requireSupabase().auth.signUp({
    email,
    password,
    options: { data: { name: displayName } },
  });
  if (error) throw error;
  if (!data.user) throw new Error('Supabase did not return a user account.');
  return normalizeSupabaseUser(data.user);
};

export const signInWithGoogle = async (): Promise<void> => {
  const { error } = await requireSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/` },
  });
  if (error) throw error;
};

export const resetAuthPassword = async (email: string) => {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/`,
  });
  if (error) throw error;
};

export const updateAuthPassword = async (password: string) => {
  const { error } = await requireSupabase().auth.updateUser({ password });
  if (error) throw error;
};

export const signOutAuth = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getAuthErrorMessage = (error: unknown) => {
  const code = (error as { code?: string; status?: number })?.code;
  const message = error instanceof Error ? error.message : '';
  const supabaseMessages: Record<string, string> = {
    'email-already-in-use': 'An account already exists for this email.',
    'invalid-email': 'Enter a valid email address.',
    'invalid-password': 'The email or password is incorrect.',
    'authentication-error': 'Unable to sign in. Please try again.',
    'user-not-found': 'No account was found for that email.',
    'password-too-short': 'Use a stronger password.',
    'email-not-confirmed': 'Confirm your email address before signing in.',
  };
  if (code && supabaseMessages[code]) return supabaseMessages[code];
  if (/unsupported provider|provider is not enabled/i.test(message)) {
    return 'Google sign-in is not enabled in Supabase yet. Enable Google under Authentication > Providers and add your OAuth client credentials.';
  }
  if (/email.*already|already.*email/i.test(message)) return 'An account already exists for this email.';
  if (/password|credential/i.test(message) && message.length < 160) return message;
  if (/captcha|rate limit|too many/i.test(message)) return message;
  return 'Authentication failed. Check your details and try again.';
};
