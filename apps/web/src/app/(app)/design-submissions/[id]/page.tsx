'use client';

import { useParams } from 'next/navigation';
import { DesignSubmissionRecord } from '@/components/design/DesignSubmissionRecord';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <DesignSubmissionRecord id={params.id} />;
}
