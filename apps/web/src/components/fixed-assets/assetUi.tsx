'use client';

import React from 'react';
import type { useQueryClient } from '@tanstack/react-query';
import { DEPRECIATION_RUN_STATUS_LABELS, FIXED_ASSET_STATUS_LABELS, type DepreciationRunStatus, type FixedAssetStatus } from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';

export const assetHref = (id: string) => `/fixed-assets/${id}`;
export const runHref = (id: string) => `/fixed-assets/runs/${id}`;

/** The register, the runs, the machines that link to assets and the books all change together. */
export function invalidateAssets(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['fixed-assets'] });
  qc.invalidateQueries({ queryKey: ['machinery'] });
  qc.invalidateQueries({ queryKey: ['books'] });
}

export const AssetStatusTag = ({ status }: { status: FixedAssetStatus }) => (
  <AppTag kind="fixedAsset" status={status}>
    {FIXED_ASSET_STATUS_LABELS[status]}
  </AppTag>
);

export const RunStatusTag = ({ status }: { status: DepreciationRunStatus }) => (
  <AppTag kind="depreciationRun" status={status}>
    {DEPRECIATION_RUN_STATUS_LABELS[status]}
  </AppTag>
);
