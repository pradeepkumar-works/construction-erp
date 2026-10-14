import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const TOKEN_KEY = 'erp_token';

export function middleware(req: NextRequest) {
  const token = req.cookies.get(TOKEN_KEY)?.value;
  const { pathname } = req.nextUrl;
  const isLogin = ['/login', '/signup', '/forgot-password'].some((p) => pathname.startsWith(p));
  // An invite or reset link works whether or not someone is signed in on this browser.
  // The product page and the privacy page are open to everyone too.
  if (pathname.startsWith('/set-password') || pathname === '/welcome' || pathname === '/privacy') return NextResponse.next();

  // A signed-out visitor to the bare domain gets the product page, which has "Sign in" at the top.
  if (!token && pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/welcome';
    url.search = '';
    return NextResponse.redirect(url);
  }
  if (!token && !isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
    return NextResponse.redirect(url);
  }
  if (token && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|ico|webp)).*)'],
};
