'use client';

import React from 'react';
import { AutoComplete, Form, Input, Select } from 'antd';
import { formatChainage, parseChainage, sectorKinds, sectorLocation, type SectorFields } from '@erp/shared';
import { useProject } from '@/lib/queries';

/** Form values for the structured location: chainage typed as km+m text. */
export interface SectorFormValues {
  chainageFrom?: string;
  chainageTo?: string;
  floor?: string;
  village?: string;
}

export const sectorFormValues = (e: Partial<SectorFields> | null | undefined): SectorFormValues => ({
  chainageFrom: e?.chainageFrom !== null && e?.chainageFrom !== undefined ? formatChainage(e.chainageFrom) : undefined,
  chainageTo: e?.chainageTo !== null && e?.chainageTo !== undefined && e.chainageTo !== e.chainageFrom ? formatChainage(e.chainageTo) : undefined,
  floor: e?.floor ?? undefined,
  village: e?.village ?? undefined,
});

/** The typed location, or blank when it was only made from the structured fields. */
export const typedLocation = (e: Partial<SectorFields> & { location: string | null }) => (e.location && e.location !== sectorLocation(e) ? e.location : undefined);

/** Request fields: blanks are null on an edit (to clear them) and left out on a create. */
export const sectorBody = (v: SectorFormValues, editing: boolean) => {
  const blank = editing ? null : undefined;
  return {
    chainageFrom: parseChainage(v.chainageFrom) ?? blank,
    chainageTo: parseChainage(v.chainageTo) ?? blank,
    floor: v.floor?.trim() || blank,
    village: v.village?.trim() || blank,
  };
};

const chainageRule = { validator: (_: unknown, v?: string) => (!v || parseChainage(v) !== null ? Promise.resolve() : Promise.reject(new Error('Like 14+200'))) };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', columnGap: 16 } as const;

/** Chainage, floor or village for the project's type, inside an antd Form. Renders nothing until the project is known. */
export function SectorInputs({ projectId }: { projectId?: string }) {
  const { data: project } = useProject(projectId);
  if (!project) return null;
  const k = sectorKinds(project);
  const range = project.chainageStart !== null && project.chainageEnd !== null ? ` (${formatChainage(project.chainageStart)} to ${formatChainage(project.chainageEnd)})` : '';
  const pick = (list: string[], placeholder: string) =>
    list.length ? <Select allowClear showSearch placeholder={placeholder} options={list.map((x) => ({ value: x, label: x }))} /> : <AutoComplete allowClear placeholder={placeholder} />;
  return (
    <div style={grid}>
      {k.chainage ? (
        <>
          <Form.Item name="chainageFrom" label={`Chainage from${range}`} rules={[chainageRule]}>
            <Input placeholder="14+200" />
          </Form.Item>
          <Form.Item name="chainageTo" label="Chainage to" rules={[chainageRule]} extra="Blank for work at one point">
            <Input placeholder="14+600" />
          </Form.Item>
        </>
      ) : null}
      {k.floor ? (
        <Form.Item name="floor" label="Floor">
          {pick(project.floors, 'Which floor')}
        </Form.Item>
      ) : null}
      {k.village ? (
        <Form.Item name="village" label="Village">
          {pick(project.villages, 'Which village')}
        </Form.Item>
      ) : null}
    </div>
  );
}
