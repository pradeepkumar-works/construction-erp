import type { ModuleFigureDto } from '@erp/shared';
import type { StripFigure } from '@/components/common/FigureStrip';
import { formatINR, formatINRCompact, formatPct } from '@/lib/format';

export function moduleFigure(f: ModuleFigureDto): StripFigure {
  const value = f.format === 'money' ? formatINRCompact(f.value) : f.format === 'ratio' ? `${f.value} of ${f.of ?? 0}` : f.format === 'percent' ? formatPct(f.value) : f.value;
  const note = f.note ? (f.noteMoney != null ? f.note.replace('{money}', formatINR(f.noteMoney)) : f.note) : null;
  return { key: f.key, label: f.label, value, note, noteTone: f.tone === 'danger' || f.tone === 'warning' ? f.tone : undefined, href: f.href };
}
