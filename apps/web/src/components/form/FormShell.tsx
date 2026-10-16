'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Drawer, Flex, Form, Grid, Modal, Typography, theme } from 'antd';
import type { FormInstance } from 'antd';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
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
    out.push({ label, message: message === 'Required' ? 'Required' : message, el: item });
  });
  return out;
}

const focusIn = (el: HTMLElement) => {
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
export function FormShell<T>({ open, onClose, title, form, okText, onSubmit, secondaryText, allValues, layout = 'drawer', width, draftKey, footerExtra, okDisabled, children }: FormShellProps<T>) {
  const { token } = theme.useToken();
  const { modal } = App.useApp();
  const { user } = useAuth();
  const screens = Grid.useBreakpoint();
  const bodyRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState<false | 'primary' | 'secondary'>(false);
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [restored, setRestored] = useState<{ at: number; base: unknown } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const storageKey = draftKey && user ? draftStorageKey(user.id, draftKey) : null;
  const values = Form.useWatch([], { form, preserve: true });
  // What the form held once open (its defaults, or the draft brought back) and its plain defaults: "changed" means the
  // user touched a field and the values differ, so a form's own late fills (attendance, order lines) do not count.
  const opened = useRef<string | null>(null);
  const defaults = useRef<string | null>(null);
  const changedSince = (ref: React.MutableRefObject<string | null>) => form.isFieldsTouched() && snapshot(form.getFieldsValue(true)) !== ref.current;
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  // Opening a new entry brings back its draft, after the form has put in its own defaults.
  useEffect(() => {
    setProblems(null);
    setRestored(null);
    setSavedAt(null);
    if (!open) return;
    const t = window.setTimeout(() => {
      const base = form.getFieldsValue(true);
      defaults.current = snapshot(base);
      const draft = storageKey ? readDraft<Partial<T>>(storageKey) : null;
      if (draft) {
        form.setFieldsValue(draft.values as never);
        setRestored({ at: draft.at, base });
      }
      opened.current = snapshot(form.getFieldsValue(true));
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, storageKey, form]);

  // Keep the draft as the user types.
  useEffect(() => {
    if (!open || !storageKey || submitting || !form.isFieldsTouched()) return;
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
  }, [values, open, storageKey, submitting, form]);

  // The summary follows the fields as they are fixed.
  useEffect(() => {
    if (!problems) return;
    const t = window.setTimeout(() => setProblems((p) => (p ? problemsIn(bodyRef.current) : p)), 50);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  // An entry being edited has no draft, so leaving the page with changes asks first.
  useEffect(() => {
    if (!open || storageKey) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (changedSince(opened)) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [open, storageKey, form]);

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
    setSubmitting(secondary ? 'secondary' : 'primary');
    try {
      await onSubmit(allValues ? (form.getFieldsValue(true) as T) : validated, secondary);
      if (storageKey) clearDraft(storageKey);
      onClose();
    } catch {
      // The mutation said what went wrong; what was typed stays.
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
      {problems && problems.length > 0 && (
        <div ref={summaryRef} tabIndex={-1} style={{ outline: 'none' }}>
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: token.margin }}
            title={problems.length === 1 ? 'One field needs attention' : `${problems.length} fields need attention`}
            description={
              <ul style={{ margin: 0, paddingInlineStart: token.paddingMD }}>
                {problems.map((p, i) => (
                  <li key={i}>
                    <Typography.Link
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        focusIn(p.el);
                      }}
                    >
                      {p.label}
                    </Typography.Link>
                    {p.message && p.message !== p.label ? <Typography.Text type="secondary">{` · ${p.message}`}</Typography.Text> : null}
                  </li>
                ))}
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
