'use client';

import React, { useCallback, useMemo } from 'react';
import { App, Button } from 'antd';
import type { MenuProps } from 'antd';
import type { AuthUser, NavPinDto, NavPinKind } from '@erp/shared';
import { LAUNCHER_PIN_MAX, byPosition, canSeeNav, navNode, positionBetween } from '@erp/shared';
import { useLauncher, useMovePin, usePin, useUnpin } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { TreeIcon } from '@/components/shell/nav-icons';
import { familyOf, type TileEntry, type TileMenu } from './TileGrid';

/** A pin as a tile: a node of the tree, or a project. */
export function pinEntry(pin: NavPinDto): TileEntry {
  if (pin.kind === 'NODE') {
    const node = navNode(pin.target)!;
    return { key: pin.id, node, family: familyOf(node) };
  }
  return { key: pin.id, label: pin.label, icon: 'folder-kanban', family: 'work', description: 'Project', href: `/projects/${pin.target}` };
}

const icon = (name: string) => <TreeIcon name={name} />;

/**
 * Pinned on Home, kept on the server. Only pins the user can still open are shown: a node no longer in
 * their menu is hidden, not deleted, so it comes back if access does. Pin, move and unpin show at once; unpin offers Undo.
 */
export function usePins(user: AuthUser | null) {
  const { message } = App.useApp();
  const { data, isPending } = useLauncher(!!user);
  const pinMutation = usePin();
  const unpinMutation = useUnpin();
  const moveMutation = useMovePin();

  const pins = useMemo(() => {
    if (!user || !data) return [];
    return byPosition(data.pins).filter((p) => {
      if (p.kind !== 'NODE') return true;
      const node = navNode(p.target);
      return !!node && canSeeNav(user, node);
    });
  }, [data, user]);

  const pinOf = useCallback((kind: NavPinKind, target: string) => pins.find((p) => p.kind === kind && p.target === target) ?? null, [pins]);

  const pin = useCallback(
    async (kind: NavPinKind, target: string, label: string) => {
      if ((data?.pins.length ?? 0) >= LAUNCHER_PIN_MAX) {
        message.warning(`Pinned is full (${LAUNCHER_PIN_MAX}). Unpin one first`);
        return;
      }
      try {
        // The pin showing (and the button pressed) says it; a notice would sit over the button.
        await pinMutation.mutateAsync({ kind, target, label });
      } catch (e) {
        message.error(errorMessage(e, `Could not pin ${label}. Try again`));
      }
    },
    [data, pinMutation, message],
  );

  const unpin = useCallback(
    async (p: NavPinDto) => {
      const key = `unpin-${p.id}`;
      try {
        await unpinMutation.mutateAsync(p);
      } catch (e) {
        message.error(errorMessage(e, `Could not unpin ${p.label}. Try again`));
        return;
      }
      message.open({
        key,
        type: 'success',
        duration: 6,
        content: (
          <span>
            Removed {p.label} from Pinned.{' '}
            <Button
              type="link"
              size="small"
              onClick={() => {
                message.destroy(key);
                pinMutation.mutate({ kind: p.kind, target: p.target, label: p.label, position: p.position });
              }}
            >
              Undo
            </Button>
          </span>
        ),
      });
    },
    [unpinMutation, pinMutation, message],
  );

  /** One place left or right among the pins shown. */
  const move = useCallback(
    (p: NavPinDto, by: -1 | 1) => {
      const at = pins.findIndex((x) => x.id === p.id);
      const to = at + by;
      if (at < 0 || to < 0 || to >= pins.length) return;
      const rest = pins.filter((x) => x.id !== p.id);
      const before = rest[to - 1]?.position ?? null;
      const after = rest[to]?.position ?? null;
      moveMutation.mutate({ id: p.id, position: positionBetween(before, after) });
    },
    [pins, moveMutation],
  );

  /** Moves a pin to sit at `to` among the pins shown (dragging). */
  const moveTo = useCallback(
    (p: NavPinDto, to: number) => {
      const rest = pins.filter((x) => x.id !== p.id);
      const at = Math.max(0, Math.min(to, rest.length));
      if (pins[at]?.id === p.id) return;
      moveMutation.mutate({ id: p.id, position: positionBetween(rest[at - 1]?.position ?? null, rest[at]?.position ?? null) });
    },
    [pins, moveMutation],
  );

  /** A tile's menu: Pin to Home, or Unpin, Move left and Move right on a pinned one. */
  const tileMenu = useCallback<TileMenu>(
    (entry) => {
      const node = entry.node;
      const pinned = node ? pinOf('NODE', node.shortcutOf ?? node.id) : pins.find((p) => p.id === entry.key) ?? null;
      if (pinned) {
        const at = pins.indexOf(pinned);
        const items: MenuProps['items'] = [
          { key: 'left', label: 'Move left', icon: icon('arrow-left'), disabled: at <= 0, onClick: () => move(pinned, -1) },
          { key: 'right', label: 'Move right', icon: icon('arrow-right'), disabled: at >= pins.length - 1, onClick: () => move(pinned, 1) },
          { type: 'divider' },
          { key: 'unpin', label: 'Unpin', icon: icon('pin-off'), onClick: () => unpin(pinned) },
        ];
        return items;
      }
      if (!node) return [];
      const target = navNode(node.shortcutOf ?? node.id)!;
      return [{ key: 'pin', label: 'Pin to Home', icon: icon('pin'), onClick: () => pin('NODE', target.id, target.label) }];
    },
    [pins, pinOf, pin, unpin, move],
  );

  return { pins, ready: !isPending, pinOf, pin, unpin, move, moveTo, tileMenu, recent: data?.recent ?? [], launcher: data };
}
