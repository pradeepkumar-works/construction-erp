'use client';

import React from 'react';
import { ownIcon } from '@/components/common/icons';
import type { AppIconProps } from '@/components/common/icons';

const SparkleSvg = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden focusable="false">
    <path d="M10 2.5l1.9 5.6 5.6 1.9-5.6 1.9L10 17.5l-1.9-5.6L2.5 10l5.6-1.9z" />
    <path d="M18.5 13l.95 2.55L22 16.5l-2.55.95L18.5 20l-.95-2.55L15 16.5l2.55-.95z" />
  </svg>
);

const Sparkle = ownIcon('sparkle', SparkleSvg);

/** Ask Nirmaan's mark: the header button, the panel's title and Ctrl K's entry. Decorative: the words beside it name it. */
export function SparkleIcon(props: AppIconProps) {
  return <Sparkle aria-hidden {...props} />;
}
