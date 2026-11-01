import type { NextFunction, Request, Response } from 'express';

/** The web app's origins (CORS_ORIGINS); empty in development, where any origin may call. */
const webOrigins = () =>
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

/**
 * Headers on every API answer. Nothing is sniffed as another type, and no page may
 * frame the API, except the web app framing a stored file in its document viewer. JSON answers forbid every kind of
 * content; the Swagger page keeps its own scripts. HSTS once the request came over HTTPS.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (/^\/(api\/)?uploads\//.test(req.path)) {
    const origins = webOrigins();
    if (origins.length) res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${origins.join(' ')}`);
  } else if (/^\/api\/docs/.test(req.path)) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  } else {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  }
  next();
}

/** A stored file that a browser would run (HTML, SVG, XML) opens sandboxed, so a script in it never runs. */
export const ACTIVE_FILE = /^(text\/html|image\/svg\+xml|application\/xhtml\+xml|text\/xml|application\/xml)/i;
export const SANDBOXED_FILE_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";
