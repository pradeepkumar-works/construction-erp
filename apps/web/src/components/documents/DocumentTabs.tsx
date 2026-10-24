'use client';

import React, { useState } from 'react';
import { AppTabs } from '@/components/common/AppTabs';
import type { AiDraftDto } from '@erp/shared';
import { canViewLetters } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useDocumentSummary, useRfiSummary } from '@/lib/queries';
import { useNewIntent } from '@/lib/new-intent';
import { DocumentList } from './DocumentList';
import { DocumentDrawer } from './DocumentDrawer';
import { TransmittalList } from './TransmittalList';
import { TransmittalDrawer } from './TransmittalDrawer';
import { TransmittalFormModal, type TransmittalPrefill } from './TransmittalFormModal';
import { LetterList } from './LetterList';
import { LetterDrawer } from './LetterDrawer';
import { LetterFormModal } from './LetterFormModal';
import { RfiList } from './RfiList';
import { RfiDrawer } from './RfiDrawer';
import { RfiFormModal } from './RfiFormModal';
import { useUrlTab } from '@/lib/url-state';

export const DOCUMENT_TABS = ['register', 'transmittals', 'letters', 'rfis'] as const;
export type DocumentTab = (typeof DOCUMENT_TABS)[number];

/** A tab with what waits in it: "NCRs", 2, "not closed". */
const count = (label: string, n: number | null | undefined, countLabel: string) => ({ label, count: n, countLabel, attention: true });

/**
 * The register, transmittals and letters: on the Documents page and as a project tab. The drawers live here so a
 * document can open its transmittals and a transmittal its documents. `openId` opens a document (from a notification),
 * `openLetterId` a letter (from a delay), `openRfiId` an RFI (from a notification or Search).
 */
export function DocumentTabs({ projectId, tab, onTab, openId, openLetterId, openRfiId }: { projectId?: string; tab: DocumentTab; onTab: (t: DocumentTab) => void; openId?: string; openLetterId?: string; openRfiId?: string }) {
  const { user } = useAuth();
  const letters = !!user && canViewLetters(user.roleKey);
  const { data: summary } = useDocumentSummary(projectId);
  const { data: rfiSummary } = useRfiSummary(projectId);
  const [rfiId, setRfiId] = useState<string | null>(openRfiId ?? null);
  const [newRfi, setNewRfi] = useState(false);
  const [docId, setDocId] = useState<string | null>(openId ?? null);
  const [transmittalId, setTransmittalId] = useState<string | null>(null);
  const [letterId, setLetterId] = useState<string | null>(openLetterId ?? null);
  const [send, setSend] = useState<TransmittalPrefill | 'new' | null>(null);
  const [newLetter, setNewLetter] = useState(false);
  // A letter Ask Nirmaan wrote (AI item 71), or "+ New" > Letter
  const [letterDraft, setLetterDraft] = useState<AiDraftDto | null>(null);
  useNewIntent('letter', letters, (draft) => {
    if (tab !== 'letters') onTab('letters');
    setLetterDraft(draft ?? null);
    setNewLetter(true);
  });
  return (
    <>
      <AppTabs
        activeKey={tab === 'letters' && !letters ? 'register' : tab}
        onChange={(k) => onTab(k as DocumentTab)}
        variant="page"
        items={[
          { key: 'register', ...count('Register', summary?.awaitingApproval, 'current revision awaiting approval'), children: <DocumentList projectId={projectId} onOpen={setDocId} /> },
          { key: 'transmittals', ...count('Transmittals', summary?.unacknowledged, 'not acknowledged'), children: <TransmittalList projectId={projectId} onOpen={setTransmittalId} onNew={() => setSend('new')} /> },
          ...(letters ? [{ key: 'letters', ...count('Letters', summary?.lettersAwaitingReply, 'reply due'), children: <LetterList projectId={projectId} onOpen={setLetterId} onNew={() => setNewLetter(true)} /> }] : []),
          { key: 'rfis', ...count('RFIs', rfiSummary?.open, 'waiting for an answer'), children: <RfiList projectId={projectId} onOpen={setRfiId} onNew={() => setNewRfi(true)} /> },
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
      <RfiDrawer id={rfiId} open={!!rfiId} onClose={() => setRfiId(null)} />
      <RfiFormModal open={newRfi} onClose={() => setNewRfi(false)} projectId={projectId} onSaved={(r) => setRfiId(r.id)} />
      {letters ? (
        <>
          <LetterDrawer id={letterId} open={!!letterId} onClose={() => setLetterId(null)} onOpen={setLetterId} />
          <LetterFormModal
            open={newLetter}
            onClose={() => {
              setNewLetter(false);
              setLetterDraft(null);
            }}
            projectId={projectId}
            aiDraft={letterDraft}
            onSaved={(l) => setLetterId(l.id)}
          />
        </>
      ) : null}
    </>
  );
}

/** A project's Documents tab. */
export function ProjectDocumentsTab({ projectId }: { projectId: string }) {
  // The open tab is `?sub=` in the URL (UX item 84), so a reload keeps it.
  const [tab, setTab] = useUrlTab<DocumentTab>(DOCUMENT_TABS, 'register');
  return <DocumentTabs projectId={projectId} tab={tab} onTab={setTab} />;
}
