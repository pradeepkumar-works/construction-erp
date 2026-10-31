import React, { useCallback, useState } from 'react';
import { navTarget, type NavNode } from '@erp/shared';
import { BottomSheet, SheetActions, type SheetAction } from '../components/BottomSheet';
import { useT } from '../i18n/LanguageContext';
import type { Launcher } from './useLauncher';

/** A tile's long-press menu: Pin to Home, or Move earlier, Move later and Unpin on a pinned one. */
export function useTileMenu(launcher: Launcher) {
  const t = useT();
  const [node, setNode] = useState<NavNode | null>(null);
  const openMenu = useCallback((n: NavNode) => setNode(navTarget(n)), []);
  const close = () => setNode(null);

  let actions: SheetAction[] = [];
  if (node) {
    const pinned = launcher.pinOf(node);
    if (pinned) {
      const at = launcher.pins.indexOf(pinned);
      actions = [
        ...(at > 0 ? [{ label: t('Move earlier'), icon: 'arrow-back' as const, onPress: () => void launcher.move(pinned, -1) }] : []),
        ...(at < launcher.pins.length - 1 ? [{ label: t('Move later'), icon: 'arrow-forward' as const, onPress: () => void launcher.move(pinned, 1) }] : []),
        { label: t('Unpin'), icon: 'close-circle-outline', tone: 'danger', onPress: () => void launcher.unpin(pinned) },
      ];
    } else {
      actions = [{ label: t('Pin to Home'), icon: 'pin-outline', onPress: () => void launcher.pin(node) }];
    }
  }

  const menu = node ? (
    <BottomSheet visible onClose={close} title={t(node.label)} subtitle={t(node.description)}>
      <SheetActions actions={actions} onClose={close} />
    </BottomSheet>
  ) : null;

  return { openMenu, menu };
}
