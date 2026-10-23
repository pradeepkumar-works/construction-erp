import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, RawBodyRequest, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Public } from '../common/decorators';
import { WhatsappService } from './whatsapp.service';
import { CaptureListQuery, CaptureSetupInput, SavedInAppInput } from './whatsapp.dto';

/** WhatsApp entries (AI item 120): the providers' webhooks, each person's switch, and their messages with Save and Discard. */
@ApiTags('whatsapp')
@ApiBearerAuth()
@Controller('whatsapp')
export class WhatsappController {
  constructor(private wa: WhatsappService) {}

  @ApiOperation({ summary: "Meta's webhook check: echoes hub.challenge when hub.verify_token is WHATSAPP_VERIFY_TOKEN" })
  @Public()
  @Get('inbound')
  verify(@Query('hub.mode') mode?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string) {
    return this.wa.verify(mode, token, challenge);
  }

  @ApiOperation({ summary: 'WhatsApp Cloud API webhook (messages), signed with WHATSAPP_APP_SECRET in X-Hub-Signature-256' })
  @Public()
  @HttpCode(200)
  @Post('inbound')
  meta(@Req() req: RawBodyRequest<Request>, @Headers('x-hub-signature-256') signature: string | undefined, @Body() body: unknown) {
    return this.wa.metaWebhook(req.rawBody, signature, body);
  }

  @ApiOperation({ summary: 'WATI webhook (message received); the address carries WATI_WEBHOOK_SECRET' })
  @Public()
  @HttpCode(200)
  @Post('inbound/wati/:secret')
  wati(@Param('secret') secret: string, @Body() body: unknown) {
    return this.wa.watiWebhook(secret, body);
  }

  @ApiOperation({ summary: 'My switch, my number, and whether this server can take WhatsApp entries' })
  @Get('setup')
  setup(@CurrentUser() user: RequestUser) {
    return this.wa.setup(user);
  }

  @ApiOperation({ summary: 'Switch my WhatsApp entries on (from the mobile number on my profile) or off' })
  @Put('setup')
  updateSetup(@CurrentUser() user: RequestUser, @Body() dto: CaptureSetupInput) {
    return this.wa.updateSetup(user, dto.enabled);
  }

  @ApiOperation({ summary: "My WhatsApp messages and what became of them (admins: scope=company for everyone's)" })
  @Get('messages')
  list(@CurrentUser() user: RequestUser, @Query() q: CaptureListQuery) {
    return this.wa.list(user, q);
  }

  @ApiOperation({ summary: 'Save the draft as it is, in my name, submitted for approval' })
  @HttpCode(200)
  @Post('messages/:id/save')
  save(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.wa.save(user, id);
  }

  @ApiOperation({ summary: 'Discard the draft' })
  @HttpCode(200)
  @Post('messages/:id/discard')
  discard(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.wa.discard(user, id);
  }

  @ApiOperation({ summary: 'The draft was changed in its form and saved there: link that record' })
  @HttpCode(200)
  @Post('messages/:id/saved-in-app')
  savedInApp(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SavedInAppInput) {
    return this.wa.savedInApp(user, id, dto.recordId);
  }
}
