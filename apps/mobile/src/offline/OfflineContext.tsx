import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import * as Crypto from 'expo-crypto';
import type { AttachmentDto } from '@erp/shared';
import { useAuth } from '../auth/AuthContext';
import { useSnackbar } from '../components/Snackbar';
import { useT } from '../i18n/LanguageContext';
import { kvGet, kvSet } from '../utils/kv';
import { ApiError, errorMessage, request, uploadFile } from '../api/client';
import { getStore, type OutboxRow } from './db';
import { persistPhoto, photoExists, removePhotos } from './photos';
import { OUTBOX_PATH, type OutboxItem, type OutboxPhoto, type OutboxStatus, type OutboxType } from './types';

export interface EnqueueInput {
  /** Pre-generated id (from `newId()`), so the form can reference the entry before it is queued. */
  id?: string;
  type: OutboxType;
  payload: Record<string, unknown>;
  photos: { uri: string; name: string; type: string; attachmentId?: string; line?: string }[];
  title: string;
  subtitle: string;
}

interface OfflineState {
  /** Best-effort connectivity from expo-network; a request can still fail when this is true. */
  online: boolean;
  /** Entries of the signed-in user waiting on this phone, oldest first. */
  items: OutboxItem[];
  pendingCount: number;
  failedCount: number;
  syncing: boolean;
  /** Bumps every time an entry reaches the server, so lists can refetch. */
  syncedCount: number;
  /** When an entry from this phone last reached the server (kept across restarts). */
  lastSyncedAt: string | null;
  newId: () => string;
  enqueue: (input: EnqueueInput) => Promise<OutboxItem>;
  sync: () => Promise<void>;
  retry: (id: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
}

const OfflineContext = createContext<OfflineState | null>(null);

const LAST_SYNCED_KEY = 'nirmaan.outbox.lastSyncedAt';

const toRow = (item: OutboxItem): OutboxRow => ({ id: item.id, userId: item.userId, type: item.type, status: item.status, createdAt: item.createdAt, data: JSON.stringify(item) });
const fromRow = (row: OutboxRow): OutboxItem => ({ ...(JSON.parse(row.data) as OutboxItem), status: row.status as OutboxStatus });

/** Is this a "could not reach the server" error (as opposed to the server rejecting the entry)? */
export const isOfflineError = (e: unknown) => e instanceof ApiError && e.status === 0;

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const network = Network.useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;

  const [items, setItems] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAtState] = useState<string | null>(() => kvGet(LAST_SYNCED_KEY));
  const setLastSyncedAt = useCallback((at: string) => {
    setLastSyncedAtState(at);
    kvSet(LAST_SYNCED_KEY, at);
  }, []);
  const snackbar = useSnackbar();
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const userIdRef = useRef(user?.id ?? null);
  userIdRef.current = user?.id ?? null;
  const syncRunning = useRef(false);
  const syncAgain = useRef(false);

  const reload = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) {
      setItems([]);
      return;
    }
    const store = await getStore();
    const rows = await store.listOutbox(uid);
    // Anything left SYNCING by a killed app goes back to the queue.
    setItems(rows.map(fromRow).map((i) => (i.status === 'SYNCING' ? { ...i, status: 'PENDING' } : i)));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, user?.id]);

  const save = useCallback(async (item: OutboxItem) => {
    const store = await getStore();
    await store.putOutbox(toRow(item));
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      if (idx === -1) return [...prev, item].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const next = [...prev];
      next[idx] = item;
      return next;
    });
    return item;
  }, []);

  const remove = useCallback(async (id: string) => {
    const store = await getStore();
    await store.deleteOutbox(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  /** Send one item: upload any photo not yet uploaded, then create the entry with its client id. */
  const sendItem = useCallback(
    async (item: OutboxItem) => {
      const tok = tokenRef.current;
      const photos: OutboxPhoto[] = [...item.photos];
      for (let i = 0; i < photos.length; i++) {
        if (photos[i].attachmentId) continue;
        // A missing file would fail as "cannot reach the server" and hold up every entry behind this one.
        if (!(await photoExists(photos[i].uri))) throw new Error(`Photo ${photos[i].name} is no longer on this phone. Discard this entry and enter it again.`);
        const att = await uploadFile<AttachmentDto>({ uri: photos[i].uri, name: photos[i].name, type: photos[i].type }, tok);
        photos[i] = { ...photos[i], attachmentId: att.id };
        // Keep uploaded ids on the item so a failure later in this attempt never re-uploads them.
        item.photos = [...photos];
        await save({ ...item });
      }
      const ids = (list: OutboxPhoto[]) => list.map((p) => p.attachmentId).filter((x): x is string => !!x);
      // A DPR line's photos go on the line they were taken for; the rest on the entry.
      const lines = item.payload.lines as { id?: string }[] | undefined;
      const payload =
        Array.isArray(lines) && photos.some((p) => p.line)
          ? { ...item.payload, lines: lines.map((l) => (photos.some((p) => p.line && p.line === l.id) ? { ...l, attachmentIds: ids(photos.filter((p) => p.line === l.id)) } : l)) }
          : item.payload;
      const body = item.type === 'ATTENDANCE' ? { ...payload, id: item.id } : { ...payload, id: item.id, attachmentIds: ids(photos.filter((p) => !p.line)) };
      await request(OUTBOX_PATH[item.type], { method: 'POST', body, token: tok });
      await removePhotos(photos);
      await remove(item.id);
    },
    [remove, save],
  );

  const sync = useCallback(async () => {
    if (!tokenRef.current || !userIdRef.current) return;
    if (syncRunning.current) {
      syncAgain.current = true;
      return;
    }
    syncRunning.current = true;
    setSyncing(true);
    let sent = 0;
    let refused = 0;
    try {
      do {
        syncAgain.current = false;
        const store = await getStore();
        const queue = (await store.listOutbox(userIdRef.current)).map(fromRow).filter((i) => i.status !== 'FAILED');
        for (const item of queue) {
          if (!tokenRef.current) break;
          const sending: OutboxItem = { ...item, status: 'SYNCING', error: null };
          await save(sending);
          try {
            await sendItem(sending);
            sent++;
            setSyncedCount((n) => n + 1);
            setLastSyncedAt(new Date().toISOString());
          } catch (e) {
            if (isOfflineError(e)) {
              // Still offline: put it back and stop; the next reconnect will try again.
              await save({ ...sending, status: 'PENDING', error: null });
              break;
            }
            // Signed out, or the company is read-only until it pays: keep it for later rather than failing it.
            if (e instanceof ApiError && (e.status === 401 || e.status === 402)) {
              await save({ ...sending, status: 'PENDING', error: null });
              break;
            }
            const transient = e instanceof ApiError && e.status >= 500;
            if (!transient) refused++;
            await save({ ...sending, status: transient ? 'PENDING' : 'FAILED', error: errorMessage(e), attempts: item.attempts + 1 });
            if (transient) break;
          }
        }
      } while (syncAgain.current);
    } finally {
      syncRunning.current = false;
      setSyncing(false);
      // Entries saved offline went out by themselves: say so, and say when one was refused.
      const tr = tRef.current;
      if (refused) snackbar.show(refused === 1 ? tr('1 entry was not accepted. Open the outbox to fix it.') : tr('{n} entries were not accepted. Open the outbox to fix them.', { n: refused }), { tone: 'error' });
      else if (sent) snackbar.show(sent === 1 ? tr('1 entry from the outbox was sent') : tr('{n} entries from the outbox were sent', { n: sent }));
    }
  }, [save, sendItem, setLastSyncedAt, snackbar]);

  // Try to flush whenever we (re)connect, the app comes to the foreground, or a user signs in.
  useEffect(() => {
    if (online && token) void sync();
  }, [online, token, sync]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => sub.remove();
  }, [sync]);

  const newId = useCallback(() => Crypto.randomUUID(), []);

  const enqueue = useCallback(
    async (input: EnqueueInput) => {
      const uid = userIdRef.current;
      if (!uid) throw new Error('Not signed in');
      const id = input.id ?? Crypto.randomUUID();
      const photos: OutboxPhoto[] = [];
      for (let i = 0; i < input.photos.length; i++) {
        const p = input.photos[i];
        const kept = p.attachmentId ? { uri: p.uri, name: p.name, type: p.type, attachmentId: p.attachmentId } : await persistPhoto(id, i, p);
        photos.push(p.line ? { ...kept, line: p.line } : kept);
      }
      const item: OutboxItem = {
        id,
        userId: uid,
        type: input.type,
        payload: input.payload,
        photos,
        title: input.title,
        subtitle: input.subtitle,
        status: 'PENDING',
        error: null,
        attempts: 0,
        createdAt: new Date().toISOString(),
      };
      await save(item);
      if (online) void sync();
      return item;
    },
    [online, save, sync],
  );

  const retry = useCallback(
    async (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      await save({ ...item, status: 'PENDING', error: null });
      void sync();
    },
    [items, save, sync],
  );

  const discard = useCallback(
    async (id: string) => {
      const item = items.find((i) => i.id === id);
      if (item) await removePhotos(item.photos);
      await remove(id);
    },
    [items, remove],
  );

  const value = useMemo<OfflineState>(
    () => ({
      online,
      items,
      pendingCount: items.filter((i) => i.status !== 'FAILED').length,
      failedCount: items.filter((i) => i.status === 'FAILED').length,
      syncing,
      syncedCount,
      lastSyncedAt,
      newId,
      enqueue,
      sync,
      retry,
      discard,
    }),
    [online, items, syncing, syncedCount, lastSyncedAt, newId, enqueue, sync, retry, discard],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineState {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline must be used inside OfflineProvider');
  return ctx;
}
