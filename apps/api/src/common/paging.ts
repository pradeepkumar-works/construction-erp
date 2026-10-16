import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SORT_ORDERS, type Paginated, type SortOrder } from '@erp/shared';

/** `page`, `pageSize`, `q` and `sortOrder`; each list adds its own `sortBy` with the allowed columns. */
export class PageQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @IsOptional() @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: DEFAULT_PAGE_SIZE, minimum: 1, maximum: MAX_PAGE_SIZE }) @IsOptional() @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) pageSize?: number;
  /** Deprecated alias of pageSize kept for older app builds. */
  @ApiPropertyOptional({ deprecated: true, description: 'Use pageSize' }) @IsOptional() @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) limit?: number;
  @ApiPropertyOptional({ description: 'Free-text search (case-insensitive, matches any word in the listed columns)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;
  @ApiPropertyOptional({ enum: SORT_ORDERS }) @IsOptional() @IsIn(SORT_ORDERS as unknown as string[]) sortOrder?: SortOrder;
}

export interface PageArgs {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function pageArgs(q: PageQuery): PageArgs {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? q.limit ?? DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export const paginated = <T>(items: T[], total: number, args: PageArgs): Paginated<T> => ({ items, total, page: args.page, pageSize: args.pageSize });

/** Search words: "cement opc" matches rows that contain both words somewhere in the searched columns. */
export const searchWords = (q: string | undefined): string[] => (q ? q.split(/\s+/).filter(Boolean).slice(0, 5) : []);

/** Case-insensitive `contains` filter for Prisma string columns. */
export const ilike = (word: string) => ({ contains: word, mode: 'insensitive' as const });

/** Query-string booleans: `?mine=false` must be false (implicit conversion would make any non-empty string true). */
export const QueryBool = () =>
  Transform(({ obj, key }) => {
    const raw = obj[key];
    if (raw === undefined || raw === null || raw === '') return undefined;
    return raw === true || raw === 'true' || raw === '1';
  });

/** `from`/`to` (YYYY-MM-DD, both ends included) on a date column; undefined when neither is given. */
export const dateRange = (from?: string, to?: string) =>
  from || to ? { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}) } : undefined;

/** The same on a timestamp, by the days as the sites see them (India, UTC+05:30). */
export const istDayRange = (from?: string, to?: string) =>
  from || to ? { ...(from ? { gte: new Date(`${from}T00:00:00.000+05:30`) } : {}), ...(to ? { lt: new Date(new Date(`${to}T00:00:00.000+05:30`).getTime() + 86_400_000) } : {}) } : undefined;
