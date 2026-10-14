'use client';

import React, { useState } from 'react';
import { Badge, Tabs } from 'antd';
import { canViewLetters } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useDocumentSummary } from '@/lib/queries';
import { DocumentList } from './DocumentList';
import { DocumentDrawer } from './DocumentDrawer';
import { TransmittalList } from './TransmittalList';
import { TransmittalDrawer } from './TransmittalDrawer';
import { TransmittalFormModal, type TransmittalPrefill } from './TransmittalFormModal';
import { LetterList } from './LetterList';
import { LetterDrawer } from './LetterDrawer';
import { LetterFormModal } from './LetterFormModal';

export const DOCUMENT_TABS = ['register', 'transmittals', 'letters'] as const;
export type DocumentTab = (typeof DOCUMENT_TABS)[number];

const count = (label: string, n: number | null | undefined, title: string) => (
  <span>
    {label}
    {n ? <Badge count={n} size="small" title={title} style={{ marginLeft: 6 }} /> : null}
  </span>
);

/**
 * The register, transmittals and letters: on the Documents page and as a project tab. The drawers live here so a
 * document can open its transmittals and a transmittal its documents. `openId` opens a document (from a notification),
 * `openLetterId` a letter (from a delay).
 */
export function DocumentTabs({ projectId, tab, onTab, openId, openLetterId }: { projectId?: string; tab: DocumentTab; onTab: (t: DocumentTab) => void; openId?: string; openLetterId?: string }) {
  const { user } = useAuth();
  const letters = !!user && canViewLetters(user.roleKey);
  const { data: summary } = useDocumentSummary(projectId);
  const [docId, setDocId] = useState<string | null>(openId ?? null);
  const [transmittalId, setTransmittalId] = useState<string | null>(null);
  const [letterId, setLetterId] = useState<string | null>(openLetterId ?? null);
  const [send, setSend] = useState<TransmittalPrefill | 'new' | null>(null);
  const [newLetter, setNewLetter] = useState(false);
  return (
    <>
      <Tabs
        activeKey={tab === 'letters' && !letters ? 'register' : tab}
        onChange={(k) => onTab(k as DocumentTab)}
        tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
        items={[
          { key: 'register', label: count('Register', summary?.awaitingApproval, 'Current revision awaiting approval'), children: <DocumentList projectId={projectId} onOpen={setDocId} /> },
          { key: 'transmittals', label: count('Transmittals', summary?.unacknowledged, 'Not acknowledged'), children: <TransmittalList projectId={projectId} onOpen={setTransmittalId} onNew={() => setSend('new')} /> },
          ...(letters ? [{ key: 'letters', label: count('Letters', summary?.lettersAwaitingReply, 'Reply due'), children: <LetterList projectId={projectId} onOpen={setLetterId} onNew={() => setNewLetter(true)} /> }] : []),
        ]}
      />
      <DocumentDrawer
        id={docId}
        open={!!docId}
        onClose={() => setDocId(null)}
        onSend={(p, revisionIds) => setSend({ projectId: p, revisionIds })}
        onOpenTransmittal={(id) => {
          setDocId(null);
          setTransmittalId(id);
        }}
      />
      <TransmittalDrawer
        id={transmittalId}
        open={!!transmittalId}
        onClose={() => setTransmittalId(null)}
        onOpenDocument={(id) => {
          setTransmittalId(null);
          setDocId(id);
        }}
      />
      <TransmittalFormModal
        open={!!send}
        onClose={() => setSend(null)}
        projectId={projectId}
        prefill={send === 'new' ? null : send}
        onSaved={(t) => {
          setDocId(null);
          setTransmittalId(t.id);
        }}
      />
      {letters ? (
        <>
          <LetterDrawer id={letterId} open={!!letterId} onClose={() => setLetterId(null)} onOpen={setLetterId} />
          <LetterFormModal open={newLetter} onClose={() => setNewLetter(false)} projectId={projectId} onSaved={(l) => setLetterId(l.id)} />
        </>
      ) : null}
    </>
  );
}

/** A project's Documents tab. */
export function ProjectDocumentsTab({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<DocumentTab>('register');
  return <DocumentTabs projectId={projectId} tab={tab} onTab={setTab} />;
}
