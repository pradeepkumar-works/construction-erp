import { useCallback, useMemo } from 'react';
import { LAUNCHER_PIN_MAX, byPosition, canSeeNav, navNode, positionBetween, type LauncherBadgesDto, type LauncherDto, type NavNode, type NavPinDto } from '@erp/shared';
import { useApi, useFetch } from '../api/hooks';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useSnackbar } from '../components/Snackbar';
import { useT } from '../i18n/LanguageContext';

/**
 * Pinned and Recent on the Home tab: the same pins as the web, kept on the account and cached on the
 * phone so Home draws them offline. Pin, move and unpin show at once and are put back if the server refuses; unpin offers
 * Undo. Pins to pages the user can no longer open are hidden, not deleted, as on the web.
 */
export function useLauncher() {
  const api = useApi();
  const { user } = useAuth();
  const { show } = useSnackbar();
  const t = useT();
  const launcher = useFetch<LauncherDto>((a) => a.get('/launcher'), [], { cacheKey: 'launcher' });
  const badges = useFetch<LauncherBadgesDto>((a) => a.get('/launcher/badges'), [], { cacheKey: 'launcher-badges' });
  const { data, setData } = launcher;

  const pins = useMemo(() => {
    if (!user || !data) return [];
    return byPosition(data.pins).filter((p) => {
      if (p.kind !== 'NODE') return true;
      const node = navNode(p.target);
      return !!node && canSeeNav(user, node);
    });
  }, [data, user]);

  const pinOf = useCallback((node: NavNode) => pins.find((p) => p.kind === 'NODE' && p.target === (node.shortcutOf ?? node.id)) ?? null, [pins]);

  const setPins = useCallback((change: (pins: NavPinDto[]) => NavPinDto[]) => setData((old) => (old ? { ...old, pins: change(old.pins) } : old)), [setData]);

  const pin = useCallback(
    async (node: NavNode, position?: string) => {
      const target = node.shortcutOf ?? node.id;
      if ((data?.pins.length ?? 0) >= LAUNCHER_PIN_MAX) {
        show(t('Pinned is full ({n}). Unpin one first', { n: LAUNCHER_PIN_MAX }), { tone: 'error' });
        return;
      }
      const last = byPosition(data?.pins ?? []).at(-1)?.position ?? null;
      const temp: NavPinDto = { id: `new-${target}`, kind: 'NODE', target, label: navNode(target)?.label ?? node.label, position: position ?? positionBetween(last, null) };
      setPins((old) => [...old, temp]);
      try {
        const saved = await api.post<NavPinDto>('/launcher/pins', { kind: 'NODE', target, position });
        setPins((old) => old.map((p) => (p.id === temp.id ? saved : p)));
        show(t('Pinned {name} to Home', { name: t(temp.label) }));
      } catch (e) {
        setPins((old) => old.filter((p) => p.id !== temp.id));
        show(errorMessage(e), { tone: 'error' });
      }
    },
    [api, data, setPins, show, t],
  );

  const unpin = useCallback(
    async (p: NavPinDto) => {
      setPins((old) => old.filter((x) => x.id !== p.id));
      try {
        await api.del(`/launcher/pins/${p.id}`);
      } catch (e) {
        setPins((old) => [...old, p]);
        show(errorMessage(e), { tone: 'error' });
        return;
      }
      const node = p.kind === 'NODE' ? navNode(p.target) : undefined;
      show(t('Removed {name} from Pinned', { name: t(p.label) }), { action: node ? { label: t('Undo'), onPress: () => void pin(node, p.position) } : undefined });
    },
    [api, setPins, show, t, pin],
  );

  /** One place earlier or later among the pins shown. */
  const move = useCallback(
    async (p: NavPinDto, by: -1 | 1) => {
      const at = pins.findIndex((x) => x.id === p.id);
      const to = at + by;
      if (at < 0 || to < 0 || to >= pins.length) return;
      const rest = pins.filter((x) => x.id !== p.id);
      const position = positionBetween(rest[to - 1]?.position ?? null, rest[to]?.position ?? null);
      setPins((old) => old.map((x) => (x.id === p.id ? { ...x, position } : x)));
      try {
        await api.patch(`/launcher/pins/${p.id}`, { position });
      } catch (e) {
        setPins((old) => old.map((x) => (x.id === p.id ? p : x)));
        show(errorMessage(e), { tone: 'error' });
      }
    },
    [api, pins, setPins, show, t],
  );

  const refresh = useCallback(async () => {
    await Promise.all([launcher.refresh(), badges.refresh()]);
  }, [launcher, badges]);

  return {
    pins,
    pinOf,
    pin,
    unpin,
    move,
    recent: data?.recent ?? [],
    webUrl: data?.webUrl ?? null,
    badges: badges.data?.nodes ?? {},
    /** Approvals waiting by type, for the counts on the company's modules (`menuWaiting`). */
    approvals: badges.data?.approvals,
    loading: launcher.loading && !data,
    refreshing: launcher.refreshing || badges.refreshing,
    refresh,
  };
}

export type Launcher = ReturnType<typeof useLauncher>;
