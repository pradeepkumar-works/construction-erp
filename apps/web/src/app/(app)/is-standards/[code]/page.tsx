'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { IsStandardPage } from '@/components/qa/IsStandardPage';

export default function Page() {
  const params = useParams<{ code: string }>();
  return <IsStandardPage code={decodeURIComponent(params.code)} />;
}
