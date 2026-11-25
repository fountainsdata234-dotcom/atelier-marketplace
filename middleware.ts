import { next } from '@vercel/functions';

const NONCE_FETCH_HEADER = 'x-csp-nonce-fetch';

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
  html.replace(/<(script|style|link)(\s|>)/gi, (_, tag: string, tail: string) => `<${tag} nonce="${nonce}"${tail}`);

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?!html$)[^/]+$).*)'],
};

export default async function middleware(request: Request) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const csp = buildCsp(nonce);

  if (request.headers.get(NONCE_FETCH_HEADER) === '1') {
    return next({ headers: { 'Content-Security-Policy': csp } });
  }

  const accept = request.headers.get('accept') || '';
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return next({ headers: { 'Content-Security-Policy': csp } });
  }

  if (!accept.includes('text/html')) {
    return next({ headers: { 'Content-Security-Policy': csp } });
  }

  const originHeaders = new Headers(request.headers);
  originHeaders.set(NONCE_FETCH_HEADER, '1');
  const originResponse = await fetch(request.url, {
    method: request.method,
    headers: originHeaders,
    redirect: 'manual',
  });

  const contentType = originResponse.headers.get('content-type') || '';
  const headers = new Headers(originResponse.headers);
  headers.set('Content-Security-Policy', csp);

  if (!contentType.includes('text/html')) {
    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers,
    });
  }

  headers.delete('content-length');
  headers.delete('content-encoding');

  if (request.method === 'HEAD') {
    return new Response(null, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers,
    });
  }

  const html = await originResponse.text();
  return new Response(injectNonce(html, nonce), {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers,
  });
}
