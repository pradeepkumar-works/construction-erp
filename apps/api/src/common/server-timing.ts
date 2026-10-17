import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { tenantStore, type RequestTiming } from '../prisma/tenant-context';

/** `total;dur=…, db;dur=…;desc="N queries"`: the request's time in the function and the part spent waiting on Postgres. */
export const serverTimingHeader = (t: RequestTiming, now = performance.now()) =>
  `total;dur=${(now - t.start).toFixed(1)}, db;dur=${t.dbMs.toFixed(1)};desc="${t.queries} ${t.queries === 1 ? 'query' : 'queries'}"`;

/**
 * Adds a Server-Timing header to every API answer, so a slow page can be split into network, function and database
 * time from the browser's network panel (or `curl -D -`). The clock starts in `tenantMiddleware`, before the sign-in
 * check; the database time is summed by `PrismaService` (parallel queries overlap, so it can exceed the total).
 */
@Injectable()
export class ServerTimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const timing = tenantStore()?.timing;
    if (!timing) return next.handle();
    const write = () => {
      if (res.headersSent) return; // streamed answers (Ask Nirmaan, file downloads) have already sent theirs
      res.setHeader('Server-Timing', serverTimingHeader(timing));
      // Lets the web app read the figures from the Resource Timing API (it is on another origin).
      if (req.headers.origin) res.setHeader('Timing-Allow-Origin', req.headers.origin);
    };
    return next.handle().pipe(tap({ next: write, error: write }));
  }
}
