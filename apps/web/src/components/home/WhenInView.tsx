'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Renders its children once they come near the screen. The home page's charts sit below the KPI tiles, so drawing them
 * only when scrolled to keeps the page quick to respond as it opens.
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
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <div ref={ref} style={seen ? undefined : { minHeight }}>
      {seen ? children : null}
    </div>
  );
}
