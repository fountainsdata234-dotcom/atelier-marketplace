import { describe, expect, it } from 'vitest';
import { getPathForView, resolveAppView } from './navigation';

describe('app history navigation', () => {
  it('resolves known route paths instead of stale history state', () => {
    expect(resolveAppView('/artisan', '', { view: 'dashboard' })).toBe('artisan');
    expect(resolveAppView('/dashboard', '', { view: 'marketplace' })).toBe('dashboard');
  });

  it('preserves unmapped app views stored in browser history at the root path', () => {
    expect(resolveAppView('/', '', { view: 'messages' })).toBe('messages');
    expect(resolveAppView('/', '', { view: 'seller' })).toBe('seller');
  });

  it('uses the Lumina query route and shared seller links', () => {
    expect(resolveAppView('/admin', '?lumina=1', { view: 'admin' })).toBe('lumina');
    expect(resolveAppView('/@maker/post/listing-1', '', null)).toBe('post');
    expect(resolveAppView('/', '?seller=maker&post=listing-1', null)).toBe('post');
  });

  it('uses the saved view only when the URL has no recognized route', () => {
    expect(resolveAppView('/', '', null, 'marketplace')).toBe('marketplace');
    expect(resolveAppView('/unknown', '', null, 'artisan')).toBe('artisan');
    expect(resolveAppView('/unknown', '', { view: 'not-an-app-view' })).toBe('landing');
    expect(resolveAppView('/', '', null, 'not-an-app-view')).toBe('landing');
  });

  it('maps every navigable destination to its route', () => {
    expect(getPathForView('artisan')).toBe('/artisan');
    expect(getPathForView('lumina')).toBe('/admin?lumina=1');
    expect(getPathForView('messages')).toBe('/');
  });
});
