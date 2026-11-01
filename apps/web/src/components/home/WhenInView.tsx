'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Renders its children once they come near the screen, or once the browser is idle, or before the page prints. The
 * charts below the figures then do not slow the page as it opens, yet a page printed or read without scrolling still has them.
 */
export function WhenInView({ minHeight, children }: { minHeight: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const show = () => setSeen(true);
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && show(), { rootMargin: '200px 0px' });
    io.observe(el);
    const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback(show, { timeout: 3000 }) : window.setTimeout(show, 1500);
    window.addEventListener('beforeprint', show);
    return () => {
      io.disconnect();
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      window.removeEventListener('beforeprint', show);
    };
  }, [seen]);
  return (
    <div ref={ref} style={seen ? undefined : { minHeight }}>
      {seen ? children : null}
    </div>
  );
}
