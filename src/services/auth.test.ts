import { describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({
  getSupabaseClient: () => null,
  isSupabaseReady: false,
}));

import { getAuthErrorMessage, normalizeSupabaseUser } from './auth';

describe('authentication error messages', () => {
  it('explains Supabase signup rate limits and suggests a safe next step', () => {
    expect(getAuthErrorMessage({ status: 429, message: 'Too many requests' }))
      .toMatch(/wait a few minutes.*sign in or reset your password/i);
  });

  it('explains weak password responses with the signup requirements', () => {
    expect(getAuthErrorMessage({ code: 'weak_password', message: 'Password too weak' }))
      .toContain('at least 8 characters, one uppercase letter, and one period');
  });

  it('directs possibly existing accounts to sign in or recover access', () => {
    expect(getAuthErrorMessage({ code: 'user_already_exists', message: 'User exists' }))
      .toMatch(/signing in.*Forgot password/i);
  });

  it('gives a concrete message for invalid email addresses', () => {
    expect(getAuthErrorMessage({ code: 'email_address_invalid', message: 'Invalid email' }))
      .toContain('name@example.com');
  });

  it('treats admin metadata and super-admin email as admin role', () => {
    const adminUser = normalizeSupabaseUser({
      id: 'user-123',
      email: 'fountainsdata234@gmail.com',
      created_at: '2024-01-01T00:00:00Z',
      user_metadata: { name: 'Admin User' },
      app_metadata: { role: 'buyer' },
      identities: [],
    } as any);

    expect(adminUser.isAdmin).toBe(true);
    expect(adminUser.isSuperAdmin).toBe(true);
    expect(adminUser.role).toBe('admin');
  });
});
