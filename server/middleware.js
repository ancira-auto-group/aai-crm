import { NextResponse } from 'next/server';

/**
 * CORS for the Chrome extension. The API authenticates with bearer tokens (not cookies) for the
 * extension, so allowing extension origins doesn't expose anything to other sites.
 * Set ALLOWED_EXTENSION_IDS (comma-separated) to only accept specific extension IDs.
 */
function allowedOrigin(origin) {
  if (!origin || !origin.startsWith('chrome-extension://')) {
    return null;
  }
  const ids = (process.env.ALLOWED_EXTENSION_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const id = origin.slice('chrome-extension://'.length);
  return ids.length === 0 || ids.includes(id) ? origin : null;
}

export function middleware(request) {
  const origin = allowedOrigin(request.headers.get('origin'));
  const corsHeaders = origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-AAI-Extension-Version',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  } : {};

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: origin ? 204 : 403, headers: corsHeaders });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  // Admin endpoints are used only by the admin page (same origin), so they get no CORS headers
  matcher: ['/api/auth/:path*', '/api/me', '/api/generate', '/api/feedback']
};
