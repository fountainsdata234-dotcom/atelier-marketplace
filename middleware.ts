import { next } from '@vercel/functions';

const buildCsp = (nonce: string) =>
  [
    "default-src 'self'",
    "img-src 'self' data: https: blob:",
    "media-src 'self' blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com https://fonts.gstatic.com`,
    `style-src-elem 'self' 'nonce-${nonce}' https://fonts.googleapis.com https://fonts.gstatic.com`,
    "style-src-attr 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' https://*.googleapis.com https://apis.google.com https://www.gstatic.com https://*.gstatic.com`,
    "connect-src 'self' https://atelier-marketplace.onrender.com https://cosdpiistnxfsmoxotqm.supabase.co https://*.firebaseio.com https://*.firebaseapp.com https://*.googleapis.com https://www.googleapis.com https://nominatim.openstreetmap.org https://maps.googleapis.com https://maps.gstatic.com",
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.openstreetmap.org",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join('; ');

const injectNonce = (html: string, nonce: string) =>
  html.replace(/<(script|style)(\s|>)/gi, (_, tag: string, tail: string) => `<${tag} nonce="${nonce}"${tail}`);

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)'],
};

export default async function middleware(request: Request) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const response = await next();
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('text/html')) {
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', buildCsp(nonce));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', buildCsp(nonce));
  return new Response(injectNonce(html, nonce), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
