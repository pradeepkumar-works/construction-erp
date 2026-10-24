'use client';

import React, { useEffect, useRef } from 'react';
import { Button, Checkbox, Flex, Tooltip, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { CaretDownOutlined, CaretRightOutlined } from '@/components/common/icons';
import type { PendingApprovalDto, SubmissionType } from '@erp/shared';
import { formatDateTime, formatINR, timeAgo } from '@/lib/format';
import { decidedInPlace, queueKey, TYPE_COLORS, type QueueGroup } from './queue';

interface Props {
  groups: QueueGroup[];
  current: string | null;
  onOpen: (item: PendingApprovalDto) => void;
  /** Ticked entries, all of `selectedType`. */
  selected: Set<string>;
  selectedType: SubmissionType | null;
  onSelect: (keys: string[], type: SubmissionType, on: boolean) => void;
  collapsed: Set<SubmissionType>;
  onToggleGroup: (type: SubmissionType) => void;
}

/**
 * The inbox's left side (UI roadmap item 58): what waits, in groups by type. A click opens an entry beside it; the
 * boxes pick entries of one type to approve together.
 */
export function ApprovalQueue({ groups, current, onOpen, selected, selectedType, onSelect, collapsed, onToggleGroup }: Props) {
  const { token } = theme.useToken();
  const currentRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  return (
    <div aria-label="Approval queue" role="region">
      {groups.map((g) => {
        const keys = g.items.map(queueKey);
        const ticked = keys.filter((k) => selected.has(k)).length;
        const other = selectedType !== null && selectedType !== g.type;
        const bulk = decidedInPlace(g.type);
        const isCollapsed = collapsed.has(g.type);
        return (
          <section key={g.type} aria-label={g.label}>
            <Flex
              align="center"
              gap={token.marginXS}
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                padding: `${token.paddingXS}px ${token.paddingSM}px`,
                // The fill is see-through, so it sits on the container colour to hide the entries scrolling under it.
                background: `linear-gradient(${token.colorFillQuaternary}, ${token.colorFillQuaternary}), ${token.colorBgContainer}`,
                borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
              }}
            >
              {bulk && (
                <Tooltip title={other ? 'Approve one type at a time' : undefined}>
                  <Checkbox
                    aria-label={`Select all ${g.label.toLowerCase()}`}
                    checked={ticked > 0 && ticked === keys.length}
                    indeterminate={ticked > 0 && ticked < keys.length}
                    disabled={other}
                    onChange={(e) => onSelect(keys, g.type, e.target.checked)}
                  />
                </Tooltip>
              )}
              <Button
                type="text"
                size="small"
                icon={isCollapsed ? <CaretRightOutlined aria-hidden /> : <CaretDownOutlined aria-hidden />}
                onClick={() => onToggleGroup(g.type)}
                aria-expanded={!isCollapsed}
                style={{ fontWeight: token.fontWeightStrong, paddingInline: token.paddingXXS }}
              >
                {g.label}
              </Button>
              <AppTag variant="filled" style={{ marginInlineStart: 'auto', marginInlineEnd: 0 }}>
                {g.items.length}
              </AppTag>
            </Flex>
            {!isCollapsed && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {g.items.map((p) => {
                  const key = queueKey(p);
                  const isCurrent = key === current;
                  return (
                    <li
                      key={key}
                      ref={isCurrent ? currentRef : undefined}
                      data-queue-item={key}
                      className="approval-item"
                      aria-current={isCurrent ? 'true' : undefined}
                      style={{
                        display: 'flex',
                        gap: token.marginXS,
                        alignItems: 'flex-start',
                        padding: `${token.paddingXS}px ${token.paddingSM}px`,
                        borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorSplit}`,
                        borderInlineStart: `${token.lineWidthBold}px solid ${isCurrent ? token.colorPrimary : 'transparent'}`,
                        background: isCurrent ? token.controlItemBgActive : undefined,
                      }}
                    >
                      {bulk && (
                        <Checkbox
                          aria-label={`Select ${p.title}`}
                          checked={selected.has(key)}
                          disabled={other}
                          onChange={(e) => onSelect([key], p.type, e.target.checked)}
                          style={{ marginTop: token.marginXXS / 2 }}
                        />
                      )}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpen(p)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onOpen(p);
                          }
                        }}
                        style={{ flex: 1, minWidth: 0, cursor: 'pointer', outlineOffset: token.lineWidthFocus }}
                      >
                        <Flex justify="space-between" gap={token.marginXS} align="baseline">
                          <Typography.Text strong={isCurrent} ellipsis={{ tooltip: p.title }} style={{ minWidth: 0 }}>
                            {p.title}
                          </Typography.Text>
                          {p.amount !== null && (
                            <Typography.Text className="mono" style={{ whiteSpace: 'nowrap', fontSize: token.fontSizeSM }}>
                              {formatINR(p.amount)}
                            </Typography.Text>
                          )}
                        </Flex>
                        <Flex justify="space-between" gap={token.marginXS} style={{ fontSize: token.fontSizeSM }}>
                          <Typography.Text type="secondary" ellipsis style={{ minWidth: 0, fontSize: token.fontSizeSM }}>
                            {[p.projectName, p.submittedByName, p.levels ? `Level ${p.level} of ${p.levels}` : null, p.escalated ? 'Escalated' : null].filter(Boolean).join(' · ')}
                          </Typography.Text>
                          <Tooltip title={formatDateTime(p.submittedAt)}>
                            <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap', fontSize: token.fontSizeSM }}>
                              {timeAgo(p.submittedAt)}
                            </Typography.Text>
                          </Tooltip>
                        </Flex>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function TypeTag({ type, label }: { type: SubmissionType; label: string }) {
  return (
    <AppTag color={TYPE_COLORS[type]} style={{ margin: 0 }}>
      {label}
    </AppTag>
  );
}
