'use client';

import React, { useState } from 'react';
import { Button, Tooltip } from 'antd';
import type { AuthUser } from '@erp/shared';
import { TreeIcon } from '@/components/shell/nav-icons';
import { pinEntry, usePins } from './pins';
import s from './EditPins.module.css';

/**
 * Pinned, being arranged: drag a pin by its grip, or use Move left and Move right (the keyboard way); × unpins with Undo.
 * The order is saved to the account, so it is the same on every device.
 */
export function EditPins({ user }: { user: AuthUser }) {
  const { pins, move, moveTo, unpin } = usePins(user);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);

  return (
    <div>
      <p className={s.help}>Drag a pin by its grip, or move it with the arrows. The order follows you to your phone.</p>
      <ol className={s.list} aria-label="Pinned, in order">
        {pins.map((p, i) => {
          const entry = pinEntry(p);
          const label = entry.label ?? entry.node?.label ?? p.label;
          return (
            <li
              key={p.id}
              className={`${s.item} ${dragging === p.id ? s.dragging : ''} ${over === i && dragging && dragging !== p.id ? s.over : ''}`}
              draggable
              onDragStart={(e) => {
                setDragging(p.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', p.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(i);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const moved = pins.find((x) => x.id === e.dataTransfer.getData('text/plain'));
                if (moved) moveTo(moved, i);
                setDragging(null);
                setOver(null);
              }}
            >
              <span className={s.grip} aria-hidden>
                <TreeIcon name="grip-vertical" />
              </span>
              <span className={s.icon} aria-hidden>
                <TreeIcon name={entry.icon ?? entry.node?.icon ?? 'pin'} />
              </span>
              <span className={s.label}>{label}</span>
              <span className={s.actions}>
                <Tooltip title="Move left">
                  <Button type="text" aria-label={`Move ${label} left`} icon={<TreeIcon name="arrow-left" />} disabled={i === 0} onClick={() => move(p, -1)} />
                </Tooltip>
                <Tooltip title="Move right">
                  <Button type="text" aria-label={`Move ${label} right`} icon={<TreeIcon name="arrow-right" />} disabled={i === pins.length - 1} onClick={() => move(p, 1)} />
                </Tooltip>
                <Tooltip title="Unpin">
                  <Button type="text" aria-label={`Unpin ${label}`} icon={<TreeIcon name="pin-off" />} onClick={() => unpin(p)} />
                </Tooltip>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
