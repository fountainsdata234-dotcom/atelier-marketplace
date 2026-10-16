import type { AuthChangeEvent, User as SupabaseUser } from '@supabase/supabase-js';
import type { User, UserRole } from '../types';
import { getSupabaseClient, isSupabaseReady } from '../lib/supabase';

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

const normalizeAvatarUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

export const normalizeSupabaseUser = (user: SupabaseUser): AuthUser => {
  const metadata = user.user_metadata ?? {};
  const appMetadata = user.app_metadata ?? {};
  const email = user.email ?? '';
  const metadataRole = metadata.role ?? metadata.user_role ?? appMetadata.role ?? appMetadata.user_role;
  const isSuperAdmin = email.trim().toLowerCase() === 'fountainsdata234@gmail.com'
    || appMetadata.is_super_admin === true
    || metadata.is_super_admin === true;
  const isAdmin = isSuperAdmin
    || metadataRole === 'admin'
    || appMetadata.role === 'admin'
    || appMetadata.user_role === 'admin'
    || appMetadata.is_admin === true
    || metadata.is_admin === true
    || metadata.admin === true
    || appMetadata.admin === true;
  const role = isAdmin ? 'admin' : normalizeRole(typeof metadataRole === 'string' ? metadataRole : appMetadata.role ?? appMetadata.user_role);
  const name = typeof metadata.name === 'string'
    ? metadata.name.trim()
    : email.split('@')[0] || 'Atelier Member';
  const googleIdentity = user.identities?.find(identity => identity.provider === 'google')?.identity_data;
  const avatarUrl = normalizeAvatarUrl(metadata.avatar_url)
    || normalizeAvatarUrl(metadata.picture)
    || normalizeAvatarUrl(googleIdentity?.avatar_url)
    || normalizeAvatarUrl(googleIdentity?.picture);

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

export const isSupabaseAuthReady = isSupabaseReady;

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

type SignupProfile = Pick<User, 'role' | 'phone' | 'countryCode' | 'location' | 'whatsappNumber' | 'shopName' | 'bio' | 'handle'>;

export const signUpWithEmail = async (
  email: string,
  password: string,
  displayName: string,
  profile: SignupProfile,
): Promise<{ user: AuthUser; hasSession: boolean }> => {
  const { data, error } = await requireSupabase().auth.signUp({
    email,
    password,
    options: {
      data: {
        name: displayName,
        role: profile.role,
        phone: profile.phone,
        countryCode: profile.countryCode,
        location: profile.location,
        whatsappNumber: profile.whatsappNumber,
        shopName: profile.shopName || '',
        bio: profile.bio || '',
        handle: profile.handle,
      },
    },
  });
  if (error) throw error;
  if (!data.user) throw new Error('Supabase did not return a user account.');
  return { user: normalizeSupabaseUser(data.user), hasSession: Boolean(data.session) };
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
    redirectTo: `${window.location.origin}/?auth=reset`,
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
  const authError = error && typeof error === 'object'
    ? error as { code?: unknown; status?: unknown; message?: unknown }
    : {};
  const code = typeof authError.code === 'string' ? authError.code.toLowerCase() : '';
  const status = typeof authError.status === 'number' ? authError.status : undefined;
  const message = typeof authError.message === 'string' ? authError.message : '';
  const normalizedMessage = message.toLowerCase();

  if (status === 429 || /rate.?limit|too many requests|over_email_send_rate_limit|over_request_rate_limit/.test(`${code} ${normalizedMessage}`)) {
    return 'Too many sign-up attempts were made recently. Wait a few minutes before trying again. If you have already created an account, sign in or reset your password instead.';
  }
  if (code === 'weak_password' || /password.*(weak|short|at least|minimum)|weak password/.test(normalizedMessage)) {
    return 'That password does not meet the requirements. Use at least 8 characters, one uppercase letter, and one period (.).';
  }
  if (['user_already_registered', 'email_exists', 'user_already_exists'].includes(code)
    || /already registered|already exists|email.*in use/.test(normalizedMessage)) {
    return 'An account may already exist for this email. Try signing in or use “Forgot password” to recover it.';
  }
  if (['invalid_email', 'email_address_invalid'].includes(code) || /invalid email/.test(normalizedMessage)) {
    return 'Enter a valid email address, for example name@example.com.';
  }
  if (code === 'signup_disabled' || /signups? (are )?disabled/.test(normalizedMessage)) {
    return 'New account creation is temporarily disabled. Please contact FABSATTIRE support.';
  }
  if (/email not confirmed|email_not_confirmed/.test(`${code} ${normalizedMessage}`)) {
    return 'Confirm your email using the link we sent, then sign in again.';
  }
  if (/failed to fetch|network error|fetch failed/.test(normalizedMessage)) {
    return 'We could not reach the sign-up service. Check your internet connection and try again.';
  }

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
  if (/password|credential/i.test(message) && message.length < 160) return message;
  if (/captcha/i.test(message)) return 'The sign-up security check could not be completed. Refresh the page and try again.';
  return 'Authentication failed. Check your details and try again.';
};
