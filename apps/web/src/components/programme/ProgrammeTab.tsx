'use client';

import React, { useState } from 'react';
import { useEots, useProgramme } from '@/lib/queries';
import { ProgrammeAndEot } from './ProgrammeAndEot';

/** The project's Programme and EOT tab (item 173). `?revision=` or `?eot=` opens one. */
export function ProgrammeTab({ projectId, initialOpenId }: { projectId: string; initialOpenId?: string }) {
  const programme = useProgramme(projectId);
  const eot = useEots(projectId);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  return (
    <ProgrammeAndEot
      projectId={projectId}
      portal={false}
      programme={programme.data}
      eot={eot.data}
      loading={programme.isLoading || eot.isLoading}
      error={programme.error ?? eot.error}
      onRetry={() => {
        void programme.refetch();
        void eot.refetch();
      }}
      openId={openId}
      onOpen={setOpenId}
    />
  );
}
