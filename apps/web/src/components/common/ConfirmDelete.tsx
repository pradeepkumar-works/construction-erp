'use client';

import React, { useCallback, useId, useRef, useState } from 'react';
import { Alert, Flex, Modal, Popconfirm, Typography, theme } from 'antd';
import type { PopconfirmProps } from 'antd';
import { ExclamationCircleFilled } from '@/components/common/icons';
import { errorMessage } from '@/lib/api';
import { handledInPlace, undoOf, useNotify } from '@/lib/notify';

/** "Delete" or "Remove" (taking something off a list it stays in elsewhere: a person off a team, a holiday off the calendar). */
export type DeleteVerb = 'Delete' | 'Remove';

export interface DeleteRequest {
  /** What goes, as it reads after the verb and in the notice: "bill RA-04", "Diwali", "the payment of ₹ 12,000". */
  what: string;
  verb?: DeleteVerb;
  /** What else happens, or what to do instead: "Its measurements become billable again." */
  description?: React.ReactNode;
  /** The delete itself, usually `mutation.mutateAsync(...)`: the confirmation waits for it and shows a failure in place. */
  onConfirm: () => Promise<unknown>;
  /** After it is gone (close the drawer, clear the selection). */
  onDone?: (result: unknown) => void;
  /**
   * The notice once it is gone: by default "Bill RA-04 deleted", with Undo when the API handed one back. A string says
   * something else; `false` says nothing, where the page already makes it plain.
   */
  notice?: string | false;
  /** Undo where the API hands none back but the delete is cheap to reverse (adding a person back to a team). */
  undo?: (result: unknown) => Promise<unknown>;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const doneText = (r: DeleteRequest) => (typeof r.notice === 'string' ? r.notice : `${cap(r.what)} ${r.verb === 'Remove' ? 'removed' : 'deleted'}`);

/** Runs the delete, says it is gone (with Undo when it can be taken back) and hands back the failure's words, if any. */
function useRunDelete() {
  const notify = useNotify();
  return useCallback(
    async (r: DeleteRequest): Promise<string | null> => {
      try {
        const result = await handledInPlace(r.onConfirm);
        if (r.notice !== false) notify.done(doneText(r), r.undo ? () => r.undo!(result) : undoOf(result));
        r.onDone?.(result);
        return null;
      } catch (err) {
        return errorMessage(err);
      }
    },
    [notify],
  );
}

function ProblemLine({ text }: { text: string }) {
  return (
    <Typography.Text type="danger" role="alert" style={{ display: 'block' }}>
      {text}
    </Typography.Text>
  );
}

/**
 * The one delete confirmation (UX item 86): wraps the button that deletes, asks "Delete bill RA-04?" with a red
 * Delete (or Remove), stays open with the button loading until the delete is done, and shows a failure in place so
 * Delete can simply be pressed again. Once it is gone, a polite notice says so, with Undo where the API can restore it.
 */
export function ConfirmDelete({
  children,
  disabled,
  placement,
  ...request
}: DeleteRequest & { children: React.ReactElement; disabled?: boolean; placement?: PopconfirmProps['placement'] }) {
  const run = useRunDelete();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = useRef(false);
  const failed = useRef(false);
  const verb = request.verb ?? 'Delete';

  return (
    <Popconfirm
      open={open}
      disabled={disabled}
      placement={placement}
      onOpenChange={(next) => {
        // While it runs, and once more after a failure (the button's own close), it stays open.
        if (!next && (busy.current || failed.current)) {
          failed.current = false;
          return;
        }
        if (next) setProblem(null);
        setOpen(next);
      }}
      title={`${verb} ${request.what}?`}
      description={
        request.description || problem ? (
          <Flex vertical gap={4} style={{ maxWidth: 320 }}>
            {request.description ? <span>{request.description}</span> : null}
            {problem ? <ProblemLine text={problem} /> : null}
          </Flex>
        ) : undefined
      }
      okText={verb}
      okButtonProps={{ danger: true }}
      cancelText="Keep"
      onConfirm={async () => {
        busy.current = true;
        setProblem(null);
        const p = await run(request);
        busy.current = false;
        if (p) {
          failed.current = true;
          setProblem(p);
        }
      }}
    >
      {children}
    </Popconfirm>
  );
}

/**
 * The same confirmation as a dialog, for a delete started from a menu (a row's ⋯, a view's menu), where there is no
 * button to hang it on: `const [askDelete, deleteDialog] = useConfirmDelete()`, render `deleteDialog`, call
 * `askDelete({ what, onConfirm })`.
 */
export function useConfirmDelete(): [(r: DeleteRequest) => void, React.ReactNode] {
  const { token } = theme.useToken();
  const run = useRunDelete();
  const okId = useId();
  const [request, setRequest] = useState<DeleteRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ask = useCallback((r: DeleteRequest) => {
    setRequest(r);
    setProblem(null);
    setOpen(true);
  }, []);
  const verb = request?.verb ?? 'Delete';

  const dialog = (
    <Modal
      open={open}
      width={416}
      title={
        request ? (
          <Flex gap={token.marginSM} align="center">
            <ExclamationCircleFilled style={{ color: token.colorWarning }} aria-hidden />
            <span>{`${verb} ${request.what}?`}</span>
          </Flex>
        ) : null
      }
      okText={verb}
      okButtonProps={{ danger: true, loading: busy, id: okId }}
      cancelText="Keep"
      cancelButtonProps={{ disabled: busy }}
      closable={!busy}
      mask={{ closable: !busy }}
      keyboard={!busy}
      afterOpenChange={(o) => {
        if (o) document.getElementById(okId)?.focus();
        else setRequest(null);
      }}
      onCancel={() => !busy && setOpen(false)}
      onOk={async () => {
        if (!request) return;
        setBusy(true);
        setProblem(null);
        const p = await run(request);
        setBusy(false);
        if (p) setProblem(p);
        else setOpen(false);
      }}
    >
      {request?.description ? <Typography.Paragraph style={{ marginBottom: problem ? token.marginSM : 0 }}>{request.description}</Typography.Paragraph> : null}
      {problem ? <Alert type="error" showIcon title={problem} role="alert" /> : null}
    </Modal>
  );
  return [ask, dialog];
}
