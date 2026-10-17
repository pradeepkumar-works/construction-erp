'use client';

import React from 'react';
import { Button, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { useAsk } from '@/lib/ask';
import { SparkleIcon } from './SparkleIcon';

/**
 * Asks Ask Nirmaan a ready-made question about what is on the page ("Summarise this week", "Explain" beside a late
 * activity) and opens the panel with the answer. Shown only while the assistant can answer.
 */
export function AskButton({ question, label, title, ...rest }: { question: string; label: string; title?: string } & Omit<ButtonProps, 'onClick' | 'children' | 'icon'>) {
  const { available, ask } = useAsk();
  if (!available) return null;
  return (
    <Tooltip title={title ?? question}>
      <Button icon={<SparkleIcon />} onClick={() => ask(question)} {...rest}>
        {label}
      </Button>
    </Tooltip>
  );
}
