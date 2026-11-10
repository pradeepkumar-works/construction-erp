'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AssetRecord } from '@/components/fixed-assets/AssetRecord';

/** One fixed asset, as its own page. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <AssetRecord id={id} onClose={() => router.push('/fixed-assets')} />;
}
