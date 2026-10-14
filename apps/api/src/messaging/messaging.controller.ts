import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { GuestAllowed } from '../common/decorators';
import { MessagingService } from './messaging.service';
import { ListMessagesQuery, TestMessageDto, UpdateMessagingPrefsDto } from './messaging.dto';
import { AllowWhenUnpaid } from '../common/billing';

@ApiTags('messaging')
@ApiBearerAuth()
@AllowWhenUnpaid()
@Controller('messaging')
export class MessagingController {
  constructor(private messaging: MessagingService) {}

  @ApiOperation({ summary: "The caller's mobile number and WhatsApp / SMS alert choices, and which channels this server can send on" })
  @GuestAllowed()
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.messaging.prefs(user);
  }

  @ApiOperation({ summary: 'Switch WhatsApp / SMS alerts on or off and set the mobile number' })
  @GuestAllowed()
  @Put('me')
  update(@CurrentUser() user: RequestUser, @Body() dto: UpdateMessagingPrefsDto) {
    return this.messaging.updatePrefs(user, dto);
  }

  @ApiOperation({ summary: "Send a test message to the caller's number; the result says whether it went" })
  @GuestAllowed()
  @Post('me/test')
  test(@CurrentUser() user: RequestUser, @Body() dto: TestMessageDto) {
    return this.messaging.test(user, dto.channel);
  }

  @ApiOperation({ summary: "The company's WhatsApp and SMS log, newest first (admin and management)" })
  @Get('log')
  log(@CurrentUser() user: RequestUser, @Query() q: ListMessagesQuery) {
    return this.messaging.list(user, q);
  }
}
