import { describe, expect, it } from 'vitest';
import { getAuthErrorMessage } from './auth';

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
});
