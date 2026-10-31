import { Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Public } from '../common/decorators';
import { AllowWhenUnpaid } from '../common/billing';
import { EnquiriesService } from './enquiries.service';
import { CreateEnquiryDto, PublicQuoteDto } from './enquiries.dto';

@ApiTags('purchasing')
@ApiBearerAuth()
@Controller('material-requests/:id/enquiries')
export class EnquiriesController {
  constructor(private enquiries: EnquiriesService) {}

  @ApiOperation({ summary: 'Enquiries sent for a material request, newest first, with each vendor’s state' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.enquiries.list(user, id);
  }

  @ApiOperation({
    summary: 'Send an enquiry to vendors',
    description: 'v5 item 95. One-time link per vendor to a page where they type rates, GST, freight and delivery days; emailed when the vendor has an email. The answer carries the links (only here) to pass on by hand.',
  })
  @Post()
  create(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateEnquiryDto, @Headers('origin') origin?: string) {
    return this.enquiries.create(user, id, dto, origin);
  }
}

/** Sixty tries in ten minutes per address: the token is unguessable, this only keeps a script from hammering the page. */
const WINDOW_MS = 10 * 60_000;
const MAX_TRIES = 60;
const tries = new Map<string, { n: number; until: number }>();
function limit(req: { ip?: string; headers: Record<string, string | string[] | undefined> }) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim() || req.ip;
  const now = Date.now();
  if (tries.size > 5000) for (const [k, v] of tries) if (v.until < now) tries.delete(k);
  const k = ip || 'unknown';
  const t = tries.get(k);
  if (!t || t.until < now) tries.set(k, { n: 1, until: now + WINDOW_MS });
  else if (++t.n > MAX_TRIES) throw new HttpException('Too many tries from this connection. Wait a few minutes and try again.', HttpStatus.TOO_MANY_REQUESTS);
}

/** The supplier's quote page: no sign-in, the link's token is the key. */
@ApiTags('purchasing')
@Public()
@AllowWhenUnpaid()
@Controller('public/quotes')
export class PublicQuotesController {
  constructor(private enquiries: EnquiriesService) {}

  @ApiOperation({ summary: 'What an enquiry link asks for: the company, site and items (no sign-in)' })
  @Get(':token')
  info(@Param('token') token: string, @Req() req: Parameters<typeof limit>[0]) {
    limit(req);
    return this.enquiries.publicInfo(token);
  }

  @ApiOperation({ summary: 'Send a quote through an enquiry link (once)', description: 'Saved as the vendor’s quotation on the request, marked as from the supplier.' })
  @HttpCode(200)
  @Post(':token')
  respond(@Param('token') token: string, @Body() dto: PublicQuoteDto, @Req() req: Parameters<typeof limit>[0]) {
    limit(req);
    return this.enquiries.respond(token, dto);
  }
}
