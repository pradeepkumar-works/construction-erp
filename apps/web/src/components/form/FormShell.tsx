'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Drawer, Flex, Form, Grid, Modal, Typography, theme } from 'antd';
import type { FormInstance } from 'antd';
import { isAxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import type { AiDraftDto } from '@erp/shared';
import { PRODUCT_NAME } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { SparkleIcon } from '@/components/ai/SparkleIcon';
import { describeError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { setLeaveGuard } from '@/lib/leave-guard';
import { handledInPlace } from '@/lib/notify';
import { useProjectScope } from '@/lib/project-scope';
import { useProjects } from '@/lib/queries';
import { clearDraft, draftStorageKey, readDraft, snapshot, writeDraft } from './drafts';

export interface FormShellProps<T> {
  open: boolean;
  /** Closes the form. Called after a successful submit, or when the user closes it (after the unsaved-changes check). */
  onClose: () => void;
  title: React.ReactNode;
  form: FormInstance<T>;
  /** The submit button's text, e.g. "Submit DPR" */
  okText: string;
  /**
   * Called with the validated values; the form closes when it resolves and stays open, with what was typed, if it
   * throws. `secondary` is the second button's press.
   */
  onSubmit: (values: T, secondary: boolean) => Promise<unknown>;
  /** A second action beside the main one, e.g. "Save draft" next to "Save and submit" */
  secondaryText?: string;
  /** Pass every value the form holds, including ones without a field (lines that carry their item), not just the fields' */
  allValues?: boolean;
  /** Long forms take a large drawer with sections; short ones stay in a modal. */
  layout?: 'drawer' | 'modal';
  width?: number;
  /**
   * New entries only: what to keep the draft under (e.g. `dpr:<projectId>`). Without it (editing an entry) closing with
   * changes asks before discarding them, and leaving the page warns.
   */
  draftKey?: string;
  /** Shown in the footer beside the buttons, e.g. a running total */
  footerExtra?: React.ReactNode;
  /** Disables the submit button, e.g. while a required lookup loads */
  okDisabled?: boolean;
  /**
   * A new entry's empty Project field starts on the header's project, or the user's only project (default on). Turn it
   * off where the project must be a deliberate choice.
   */
  projectDefault?: boolean;
  /**
   * A draft Ask Nirmaan filled in (AI item 71), already put in the fields by the form. It takes the place of a kept
   * draft, counts as changes (so closing asks, and it is kept on this device), and the form says what to check.
   */
  aiDraft?: AiDraftDto | null;
  children: React.ReactNode;
}

interface Problem {
  label: string;
  message: string;
  el: HTMLElement;
}

/** The fields showing an error, in the order they appear, labelled for the summary. */
function problemsIn(root: HTMLElement | null): Problem[] {
  if (!root) return [];
  const seen = new Set<HTMLElement>();
  const out: Problem[] = [];
  root.querySelectorAll<HTMLElement>('.ant-form-item-has-error, .ant-select-status-error, .ant-input-status-error, .ant-input-number-status-error, .ant-picker-status-error').forEach((el) => {
    const item = (el.closest('[data-line-label]') as HTMLElement | null) ?? (el.closest('.ant-form-item') as HTMLElement | null) ?? el;
    if (seen.has(item)) return;
    seen.add(item);
    const line = item.getAttribute('data-line-label');
    const label = line ?? item.querySelector('.ant-form-item-label label')?.textContent?.trim() ?? 'A field';
    const message = line ? 'Fill in each column' : (item.querySelector('.ant-form-item-explain-error')?.textContent?.trim() ?? '');
    out.push({ label, message, el: item });
  });
  return out;
}

type NamePath = (string | number)[];

/**
 * The API's validation messages that name a field of this form ("rate must not be less than 0",
 * "lines.0.quantity must be a number"), as errors to show on those fields (UX item 79). Others stay in the toast.
 */
function serverFieldErrors(err: unknown, fields: Record<string, unknown>): { name: NamePath; errors: string[] }[] {
  if (!isAxiosError(err) || err.response?.status !== 400) return [];
  const raw = (err.response.data as { message?: string | string[] } | undefined)?.message;
  const messages = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out = new Map<string, { name: NamePath; errors: string[] }>();
  for (const m of messages) {
    const hit = /^([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*)\s+(.+)$/.exec(String(m));
    if (!hit || !(hit[1].split('.')[0] in fields)) continue;
    const name = hit[1].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p));
    const text = hit[2].charAt(0).toUpperCase() + hit[2].slice(1);
    const key = name.join('.');
    out.set(key, { name, errors: [...(out.get(key)?.errors ?? []), text] });
  }
  return [...out.values()];
}

/** An in-page link to the field's control, as an error summary's links are (the click focuses it without a jump). */
const fieldHref = (el: HTMLElement) => {
  const id = el.querySelector<HTMLElement>('input:not([type=hidden])[id], textarea[id], [role=combobox][id]')?.id;
  return id ? `#${id}` : '#';
};

const focusIn = (el: HTMLElement) => {
  // Glides to the field unless the system asks for less motion (UX item 81).
  el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  el.querySelector<HTMLElement>('input:not([type=hidden]), textarea, [tabindex]:not([tabindex="-1"])')?.focus({ preventScroll: true });
};

/**
 * The frame every create and edit form sits in (UI roadmap item 60): a large drawer (long forms) or a modal (short
 * ones) with the actions in a footer that stays put, a summary of what still needs filling when a submit fails, a check
 * before closing with unsaved changes, a draft of a new entry kept in this browser, and Ctrl Enter to submit.
 *
 * The form component keeps its own fields and defaults and passes `onSubmit` (usually `mutation.mutateAsync`) instead
 * of the Form's `onFinish`.
 */
export function FormShell<T>({ open, onClose, title, form, okText, onSubmit, secondaryText, allValues, layout = 'drawer', width, draftKey, footerExtra, okDisabled, projectDefault = true, aiDraft, children }: FormShellProps<T>) {
  const { token } = theme.useToken();
  const { modal, message } = App.useApp();
  const { user } = useAuth();
  const router = useRouter();
  const [scopedProject] = useProjectScope();
  const { data: projects } = useProjects(open && projectDefault);
  // The latest project to start on and close handler, for the timers and listeners below (set after each render).
  const startProject = useRef<string | undefined>(undefined);
  const closeRef = useRef(onClose);
  useEffect(() => {
    startProject.current = scopedProject ?? (projects?.length === 1 ? projects[0].id : undefined);
    closeRef.current = onClose;
  });
  const screens = Grid.useBreakpoint();
  const bodyRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState<false | 'primary' | 'secondary'>(false);
  const [problems, setProblems] = useState<Problem[] | null>(null);
  // A save that failed for a reason no field shows (offline, a server fault, a refusal): said at the top, with Try again.
  const [failure, setFailure] = useState<{ text: string; retry: boolean; secondary: boolean } | null>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const [restored, setRestored] = useState<{ at: number; base: unknown } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const storageKey = draftKey && user ? draftStorageKey(user.id, draftKey) : null;
  const values = Form.useWatch([], { form, preserve: true });
  // What the form held once open (its defaults, or the draft brought back) and its plain defaults: "changed" means the
  // user touched a field and the values differ, so a form's own late fills (attendance, order lines) do not count.
  const opened = useRef<string | null>(null);
  const defaults = useRef<string | null>(null);
  // A drafted form is all changes until it is saved or started over.
  const fromAi = useRef(false);
  const changedSince = useCallback(
    (ref: React.MutableRefObject<string | null>) => fromAi.current || (form.isFieldsTouched() && snapshot(form.getFieldsValue(true)) !== ref.current),
    [form],
  );
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  // Opening a new entry brings back its draft, after the form has put in its own defaults.
  useEffect(() => {
    setProblems(null);
    setFailure(null);
    setRestored(null);
    setSavedAt(null);
    fromAi.current = false;
    if (!open) return;
    const t = window.setTimeout(() => {
      // A new entry's empty Project field starts on the project the user is working on.
      if (projectDefault && startProject.current && 'projectId' in (form.getFieldsValue() as object) && !(form as FormInstance).getFieldValue('projectId')) {
        form.setFieldsValue({ projectId: startProject.current } as never);
      }
      const base = form.getFieldsValue(true);
      defaults.current = snapshot(base);
      fromAi.current = !!aiDraft;
      const draft = storageKey && !aiDraft ? readDraft<Partial<T>>(storageKey) : null;
      if (draft) {
        form.setFieldsValue(draft.values as never);
        setRestored({ at: draft.at, base });
      }
      opened.current = snapshot(form.getFieldsValue(true));
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, storageKey, form, projectDefault, aiDraft]);

  // Keep the draft as the user types (or as Ask Nirmaan filled it in).
  useEffect(() => {
    if (!open || !storageKey || submitting || !(form.isFieldsTouched() || aiDraft)) return;
    const t = window.setTimeout(() => {
      if (changedSince(defaults)) {
        writeDraft(storageKey, form.getFieldsValue(true));
        setSavedAt(Date.now());
      } else {
        clearDraft(storageKey);
        setSavedAt(null);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [values, open, storageKey, submitting, form, aiDraft, changedSince]);

  // The summary follows the fields as they are fixed.
  useEffect(() => {
    if (!problems) return;
    const t = window.setTimeout(() => setProblems((p) => (p ? problemsIn(bodyRef.current) : p)), 50);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the values change: `problems` itself is set in here
  }, [values]);

  // An entry being edited has no draft, so leaving the page with changes asks first.
  useEffect(() => {
    if (!open || storageKey) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (changedSince(opened)) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [open, storageKey, changedSince]);

  // Leaving for another page: a new entry's draft is kept, an edit asks before its changes are thrown away.
  const leaveCheck = useRef<() => Promise<boolean>>(async () => true);
  useEffect(() => {
    leaveCheck.current = async () => {
      if (!changedSince(opened)) return true;
      if (storageKey) {
        message.info('What you typed is kept as a draft on this device');
        return true;
      }
      return new Promise<boolean>((resolve) =>
        modal.confirm({
          title: 'Discard your changes?',
          content: 'What you changed here will be lost.',
          okText: 'Discard changes',
          okButtonProps: { danger: true },
          cancelText: 'Keep editing',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        }),
      );
    };
  });

  useEffect(() => {
    if (!open) return;
    const off = setLeaveGuard(() => leaveCheck.current());
    // A link anywhere on the page (the record a field points at, a menu behind a modal).
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      if (!changedSince(opened)) return;
      e.preventDefault();
      e.stopPropagation();
      void leaveCheck.current().then((ok) => ok && router.push(`${url.pathname}${url.search}${url.hash}`));
    };
    document.addEventListener('click', onClick, true);
    // The browser's Back closes the form (after the same check) rather than leaving the page under it: the form adds a
    // history entry for itself, on the same address, and takes it back off when it closes.
    const id = Math.random().toString(36).slice(2);
    const ours = () => (window.history.state as { nirmaanForm?: string } | null)?.nirmaanForm === id;
    const mark = () => window.history.pushState({ ...window.history.state, nirmaanForm: id }, '');
    const routed = !!(window.history.state as { __NA?: boolean } | null)?.__NA;
    if (routed) mark();
    const onPop = () => {
      if (ours()) return;
      void leaveCheck.current().then((ok) => (ok ? closeRef.current() : mark()));
    };
    if (routed) window.addEventListener('popstate', onPop);
    return () => {
      off();
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop);
      if (routed && ours()) window.history.back();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening: it adds a history entry for the form, so it must not run again while open
  }, [open]);

  const submit = useCallback(async (secondary = false) => {
    if (submitting || okDisabled) return;
    let validated: T;
    try {
      validated = await form.validateFields();
    } catch {
      window.setTimeout(() => {
        const found = problemsIn(bodyRef.current);
        setProblems(found);
        if (found.length) {
          summaryRef.current?.scrollIntoView({ block: 'nearest' });
          summaryRef.current?.focus({ preventScroll: true });
        }
      }, 120);
      return;
    }
    setProblems(null);
    setFailure(null);
    setSubmitting(secondary ? 'secondary' : 'primary');
    try {
      // The form says what went wrong itself (UX item 86), so the save gets no toast as well.
      await handledInPlace(() => onSubmit(allValues ? (form.getFieldsValue(true) as T) : validated, secondary));
      if (storageKey) clearDraft(storageKey);
      onClose();
    } catch (err) {
      // What was typed stays; a message about a field shows on that field, anything else at the top in plain words.
      const fields = serverFieldErrors(err, form.getFieldsValue() as Record<string, unknown>);
      if (!fields.length) {
        const d = describeError(err);
        setFailure({ text: d.text, retry: d.retry, secondary });
        window.setTimeout(() => {
          failureRef.current?.scrollIntoView({ block: 'nearest' });
          failureRef.current?.focus({ preventScroll: true });
        }, 50);
      }
      if (fields.length) {
        form.setFields(fields as never);
        window.setTimeout(() => {
          const found = problemsIn(bodyRef.current);
          setProblems(found);
          summaryRef.current?.scrollIntoView({ block: 'nearest' });
          summaryRef.current?.focus({ preventScroll: true });
        }, 120);
      }
    } finally {
      setSubmitting(false);
    }
  }, [form, onSubmit, onClose, storageKey, submitting, okDisabled, allValues]);

  const requestClose = () => {
    if (submitting) return;
    if (!changedSince(opened)) return onClose();
    modal.confirm({
      title: storageKey ? 'Close this form?' : 'Discard your changes?',
      content: storageKey ? 'What you typed is kept on this device and comes back the next time you open a new one.' : 'What you changed here will be lost.',
      okText: storageKey ? 'Close' : 'Discard changes',
      okButtonProps: storageKey ? undefined : { danger: true },
      cancelText: 'Keep editing',
      onOk: onClose,
    });
  };

  const startOver = () => {
    if (storageKey) clearDraft(storageKey);
    form.resetFields();
    if (restored) form.setFieldsValue(restored.base as never);
    fromAi.current = false;
    opened.current = defaults.current;
    setRestored(null);
    setSavedAt(null);
  };

  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      void submit();
    }
  };

  const footer = (
    <Flex justify="space-between" align="center" gap={token.marginSM} wrap>
      <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
        {screens.md ? (
          <>
            <Typography.Text keyboard>{mac ? '⌘' : 'Ctrl'}</Typography.Text> <Typography.Text keyboard>Enter</Typography.Text> to submit
          </>
        ) : null}
        {storageKey && savedAt ? `${screens.md ? ' · ' : ''}Draft kept on this device` : null}
      </Typography.Text>
      <Flex gap={token.marginXS} align="center" wrap>
        {footerExtra}
        <Button onClick={requestClose} disabled={!!submitting}>
          Cancel
        </Button>
        {secondaryText && (
          <Button onClick={() => void submit(true)} loading={submitting === 'secondary'} disabled={okDisabled || !!submitting}>
            {secondaryText}
          </Button>
        )}
        <Button type="primary" onClick={() => void submit()} loading={submitting === 'primary'} disabled={okDisabled || submitting === 'secondary'}>
          {okText}
        </Button>
      </Flex>
    </Flex>
  );

  const body = (
    <div ref={bodyRef} onKeyDownCapture={onKeyDownCapture}>
      {aiDraft && (
        <Alert
          type="info"
          showIcon
          icon={<SparkleIcon />}
          className="ai-draft-note"
          style={{ marginBottom: token.margin }}
          title={`Filled in by Ask ${PRODUCT_NAME} from what you wrote`}
          description={
            <>
              Check each field before you {okText.toLowerCase()}. Nothing is saved until you do.
              {aiDraft.flags.length > 0 && (
                <ul aria-label="To check" style={{ margin: `${token.marginXXS}px 0 0`, paddingInlineStart: token.paddingMD }}>
                  {aiDraft.flags.map((f, i) => (
                    <li key={i}>{f.note}</li>
                  ))}
                </ul>
              )}
            </>
          }
        />
      )}
      {restored && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: token.margin }}
          title={`Brought back what you typed on ${formatDateTime(new Date(restored.at).toISOString())}`}
          action={
            <Button size="small" onClick={startOver}>
              Start over
            </Button>
          }
        />
      )}
      {failure && (
        <div ref={failureRef} tabIndex={-1} style={{ outline: 'none' }}>
          <Alert
            type="error"
            showIcon
            role="alert"
            style={{ marginBottom: token.margin }}
            title={failure.retry ? 'Not saved yet' : 'Not saved'}
            description={failure.text}
            action={
              failure.retry ? (
                <Button size="small" onClick={() => void submit(failure.secondary)} loading={!!submitting}>
                  Try again
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
      {problems && problems.length > 0 && (
        <div ref={summaryRef} tabIndex={-1} style={{ outline: 'none' }}>
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: token.margin }}
            title={problems.length === 1 ? 'One field needs attention' : `${problems.length} fields need attention`}
            description={
              <ul style={{ margin: 0, paddingInlineStart: token.paddingMD }}>
                {problems.map((p, i) => {
                  // "Project is required" says no more than the field's name and "Required".
                  const whole = !!p.message && p.message.startsWith(p.label) && /is required$/.test(p.message);
                  return (
                    <li key={i}>
                      <Typography.Link
                        href={fieldHref(p.el)}
                        onClick={(e) => {
                          e.preventDefault();
                          focusIn(p.el);
                        }}
                      >
                        {p.label}
                      </Typography.Link>
                      {p.message && p.message !== p.label ? <Typography.Text type="secondary">{` · ${whole ? 'Required' : p.message}`}</Typography.Text> : null}
                    </li>
                  );
                })}
              </ul>
            }
          />
        </div>
      )}
      {children}
    </div>
  );

  if (layout === 'modal') {
    return (
      <Modal open={open} title={title} onCancel={requestClose} footer={footer} width={width ?? 640} destroyOnHidden styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: token.paddingXS } }}>
        {body}
      </Modal>
    );
  }
  return (
    <Drawer open={open} title={title} onClose={requestClose} footer={footer} size={screens.md ? (width ?? 760) : '100%'} destroyOnHidden styles={{ footer: { padding: `${token.paddingSM}px ${token.paddingLG}px` } }}>
      {body}
    </Drawer>
  );
}

/**
 * Fields side by side: `cols` columns on a laptop, one on a phone. Labels sit above the field and help text under it
 * (the Form's `layout="vertical"` and `extra`).
 */
/**
 * Runs `go` (e.g. opening the record just saved) once a closing form has taken its history entry back off; navigating
 * before that would be undone by the form's Back. Call it from the form's `onClose`.
 */
export function afterFormLeaves(go: () => void) {
  if ((window.history.state as { nirmaanForm?: string } | null)?.nirmaanForm) window.addEventListener('popstate', () => go(), { once: true });
  else go();
}

export function FormGrid({ cols = 2, children }: { cols?: 2 | 3 | 4; children: React.ReactNode }) {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const n = screens.md ? cols : screens.sm && cols > 2 ? 2 : 1;
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, columnGap: token.margin }}>{children}</div>;
}

/** A titled group of fields in a long form. */
export function FormSection({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <section aria-label={title} style={{ marginBottom: token.marginLG }}>
      <Flex justify="space-between" align="baseline" style={{ marginBottom: token.marginSM, paddingBottom: token.paddingXXS, borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorSplit}` }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {extra}
      </Flex>
      {children}
    </section>
  );
}
