'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { MasterListPage } from '@/components/masters/MasterListPage';

/** A simple master list: /masters/trade, /masters/item-category… */
export default function MasterListRoute() {
  const { list } = useParams<{ list: string }>();
  return <MasterListPage key={list} slug={list} />;
}
