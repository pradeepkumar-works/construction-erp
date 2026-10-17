import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { Public } from './common/decorators';

const NAMES = new Set(['LCP', 'CLS', 'INP']);
const MAX_REPORTS = 20;

export class VitalsDto {
  /** A JSON array of `{ name, value, rating, overBudget, path, id }`, form-encoded so the browser's beacon needs no preflight. */
  @IsString()
  @MaxLength(8000)
  data!: string;
}

/** One measured Web Vital as logged: only the known fields, checked and trimmed. */
export function parseVitals(data: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_REPORTS).flatMap((r: Record<string, unknown>) => {
    if (!r || typeof r !== 'object' || typeof r.name !== 'string' || !NAMES.has(r.name)) return [];
    const value = Number(r.value);
    if (!Number.isFinite(value) || value < 0) return [];
    return [
      {
        name: r.name,
        value,
        rating: typeof r.rating === 'string' ? r.rating.slice(0, 20) : undefined,
        overBudget: r.overBudget === true,
        path: typeof r.path === 'string' ? r.path.slice(0, 200) : undefined,
      },
    ];
  });
}

/**
 * Web Vitals from the web app (item 83): each page load's LCP, CLS and INP, logged one JSON line each (`web-vital`) for
 * the function logs to search, with `overBudget` against the web's `WEB_VITAL_BUDGETS`. Nothing is stored.
 */
@ApiTags('health')
@Controller('vitals')
export class VitalsController {
  private readonly log = new Logger('WebVitals');

  @Public()
  @Post()
  @HttpCode(204)
  report(@Body() body: VitalsDto): void {
    for (const v of parseVitals(body.data)) this.log.log(JSON.stringify({ event: 'web-vital', ...v }));
  }
}
