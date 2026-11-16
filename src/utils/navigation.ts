export const PUBLIC_VIEW_BY_PATH: Record<string, string> = {
  '/': 'landing',
  '/marketplace': 'marketplace',
  '/artisan': 'artisan',
  '/about': 'about',
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/contact': 'contact',
  '/profile': 'profile',
  '/collections': 'collections',
  '/dashboard': 'dashboard',
  '/premium/verify': 'dashboard',
  '/assistant': 'assistant',
  '/admin': 'admin',
};

const PATH_BY_VIEW = Object.fromEntries(
  Object.entries(PUBLIC_VIEW_BY_PATH).map(([path, view]) => [view, path]),
);
const KNOWN_VIEWS = new Set([...Object.values(PUBLIC_VIEW_BY_PATH), 'seller', 'post', 'messages', 'lumina']);

export function getPathForView(view: string): string {
  if (view === 'lumina') return `${PATH_BY_VIEW.admin}?lumina=1`;
  return PATH_BY_VIEW[view] || '/';
}

export function resolveAppView(pathname: string, search: string, historyState: unknown, fallbackView?: string): string {
  const path = pathname.replace(/\/$/, '') || '/';
  const params = new URLSearchParams(search);
  if (/^\/@[^/]+\/post\/[^/]+$/i.test(path)) return 'post';
  if (/^\/@[^/]+$/i.test(path)) return 'seller';
  if (params.get('seller')) return params.get('post') ? 'post' : 'seller';
  if (path === '/admin' && params.get('lumina') === '1') return 'lumina';

  const stateView = historyState !== null && typeof historyState === 'object' && 'view' in historyState
    ? historyState.view
    : undefined;
  const validStateView = typeof stateView === 'string' && KNOWN_VIEWS.has(stateView)
    ? stateView
    : undefined;
  const validFallbackView = fallbackView && KNOWN_VIEWS.has(fallbackView) ? fallbackView : undefined;
  if (path === '/') return validStateView || validFallbackView || 'landing';
  return PUBLIC_VIEW_BY_PATH[path] || validStateView || validFallbackView || 'landing';
}

