'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { App, Button } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import { useRouter } from 'next/navigation';
import { useQueryClient, type Mutation, type QueryClient } from '@tanstack/react-query';
import { api, describeError } from './api';
import { isMac } from './shortcuts';

/**
 * Feedback after an action, in one place: "Saved" with View, "Deleted" with Undo for ten seconds, and a
 * failure in plain words with Retry. Success notices are polite (`role="status"`); failures stay assertive.
 *
 * A mutation opts into the failure notice with `meta: FAIL_NOTICE`: its Retry runs the same mutation again with the
 * same values. A form (`FormShell`) or a confirmation (`ConfirmDelete`) shows its own failure in place, so a request
 * they run is wrapped in `handledInPlace` and gets no toast as well.
 */
export const FAIL_NOTICE = { failNotice: true } as const;

/** FAIL_NOTICE for a mutation whose success the caller announces: says `text` when its Retry goes through. */
export const failNoticeSaying = <V,>(text: (variables: V) => string) => ({ failNotice: true, retriedText: text as (variables: unknown) => string });

let inPlace = 0;

/** Runs `fn`, whose failure the caller shows where the person is (in the form, in the confirmation), not as a toast. */
export async function handledInPlace<T>(fn: () => Promise<T>): Promise<T> {
  inPlace += 1;
  try {
    return await fn();
  } finally {
    inPlace -= 1;
  }
}

const UNDO_SECONDS = 10;
let seq = 0;
const nextKey = () => `notice-${++seq}`;

/** Ctrl Z (⌘Z) runs the newest Undo on show, unless the person is typing in a field, where it undoes their typing. */
const undoStack: (() => void)[] = [];
function onUndoKey(e: KeyboardEvent) {
  if (e.key.toLowerCase() !== 'z' || e.shiftKey || e.altKey || !(isMac() ? e.metaKey : e.ctrlKey)) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const run = undoStack[undoStack.length - 1];
  if (!run) return;
  e.preventDefault();
  run();
}

function UndoAction({ undo, onDone }: { undo: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const run = () => {
      setBusy(true);
      undo();
    };
    undoStack.push(run);
    if (undoStack.length === 1) window.addEventListener('keydown', onUndoKey);
    return () => {
      const i = undoStack.indexOf(run);
      if (i >= 0) undoStack.splice(i, 1);
      if (!undoStack.length) window.removeEventListener('keydown', onUndoKey);
      onDone();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once for the notice's life: running again would call onDone while it still shows
  }, []);
  return (
    <Button
      type="link"
      size="small"
      loading={busy}
      aria-keyshortcuts={isMac() ? 'Meta+Z' : 'Control+Z'}
      onClick={() => {
        setBusy(true);
        undo();
      }}
    >
      Undo
    </Button>
  );
}

const line = (text: React.ReactNode, action?: React.ReactNode) => (
  <span className="notice-line">
    <span>{text}</span>
    {action}
  </span>
);

export interface Notifier {
  /** A plain success: "Settings saved". */
  success: (text: string) => void;
  /** Something made or changed, with View to open it when it has a page. */
  saved: (text: string, href?: string | null) => void;
  /** Something done that can be taken back (a delete): Undo for ten seconds, then it is final. */
  done: (text: string, undo?: (() => Promise<unknown>) | null) => void;
  /** A failure in plain words; Retry when trying again could help (offline, server fault) and `retry` is given. */
  failed: (err: unknown, retry?: (() => unknown) | null, lead?: string) => void;
}

function makeNotifier(message: MessageInstance, push: (href: string) => void, qc: QueryClient): Notifier {
  const polite = (key: string, content: React.ReactNode, duration: number) => message.open({ key, type: 'success', content, duration, role: 'status' } as Parameters<MessageInstance['open']>[0]);
  const self: Notifier = {
    success: (text) => polite(nextKey(), text, 3),
    saved: (text, href) => {
      const key = nextKey();
      polite(
        key,
        line(
          text,
          href ? (
            <Button
              type="link"
              size="small"
              onClick={() => {
                message.destroy(key);
                push(href);
              }}
            >
              View
            </Button>
          ) : undefined,
        ),
        href ? 6 : 3,
      );
    },
    done: (text, undo) => {
      const key = nextKey();
      if (!undo) return polite(key, text, 3);
      let settled = false;
      const run = async () => {
        if (settled) return;
        settled = true;
        try {
          await undo();
          message.destroy(key);
          self.success('Brought back');
        } catch (err) {
          message.destroy(key);
          self.failed(err, null);
        } finally {
          void qc.invalidateQueries();
        }
      };
      polite(key, line(text, <UndoAction undo={() => void run()} onDone={() => (settled = true)} />), UNDO_SECONDS);
    },
    failed: (err, retry, lead) => {
      const key = nextKey();
      const d = describeError(err);
      const again = d.retry && retry;
      message.open({
        key,
        type: 'error',
        duration: again ? UNDO_SECONDS : 5,
        content: line(
          lead ? `${lead} ${d.text}` : d.text,
          again ? (
            <Button
              type="link"
              size="small"
              onClick={() => {
                message.destroy(key);
                retry();
              }}
            >
              Try again
            </Button>
          ) : undefined,
        ),
      });
    },
  };
  return self;
}

export function useNotify(): Notifier {
  const { message } = App.useApp();
  const router = useRouter();
  const qc = useQueryClient();
  return useMemo(() => makeNotifier(message, (href) => router.push(href), qc), [message, router, qc]);
}

/** `POST /undo` with what a delete handed back (`undo`), when it handed one back: the delete can be taken back. */
export function undoOf(result: unknown): (() => Promise<unknown>) | null {
  const token = result && typeof result === 'object' && 'undo' in result ? (result as { undo?: unknown }).undo : null;
  return typeof token === 'string' && token ? async () => (await api.post('/undo', { token })).data : null;
}

let host: Notifier | null = null;

/** The failure notice of a mutation that asked for one (`meta: FAIL_NOTICE`), with Retry. Set up in `providers.tsx`. */
export function mutationFailed(client: QueryClient, err: unknown, variables: unknown, mutation: Mutation<unknown, unknown, unknown>) {
  const meta = mutation.meta as { failNotice?: boolean; retriedText?: (variables: unknown) => string } | undefined;
  if (!meta?.failNotice || inPlace > 0) return;
  host?.failed(err, () =>
    client
      .getMutationCache()
      .build(client, mutation.options)
      .execute(variables)
      // A mutation that says nothing itself on success (an approval) names what went through on the second try.
      .then(() => meta.retriedText && host?.success(meta.retriedText(variables)))
      .catch(() => undefined),
  );
}

const POLITE = Symbol.for('nirmaan.polite-messages');

/**
 * Inside antd's App: hands the failure notice its notifier, and makes the app's plain `message.success`/`info`/
 * `loading` polite (antd gives every message `role="alert"`, which interrupts a screen reader for good news too).
 */
export function FeedbackHost() {
  const notify = useNotify();
  const { message } = App.useApp();
  useState(() => {
    const m = message as MessageInstance & { [POLITE]?: boolean };
    if (m[POLITE]) return;
    // eslint-disable-next-line react-hooks/immutability -- deliberately wraps antd's one shared message instance, once (the POLITE mark)
    m[POLITE] = true;
    for (const type of ['success', 'info', 'loading'] as const) {
      const open = m[type];
      m[type] = ((content: unknown, ...rest: unknown[]) => {
        const config = content && typeof content === 'object' && !React.isValidElement(content) && 'content' in content ? content : { content };
        return (open as (...a: unknown[]) => unknown)({ role: 'status', ...(config as object) }, ...rest);
      }) as typeof open;
    }
  });
  useEffect(() => {
    host = notify;
    return () => {
      if (host === notify) host = null;
    };
  }, [notify]);
  return null;
}
