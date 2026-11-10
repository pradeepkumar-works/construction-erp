import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { CurrentUser, RequestUser } from '../common/current-user';
import { AllowWhenUnpaid } from '../common/billing';
import { clientIp } from './login-guard.service';
import { cookieOf, STATE_MINUTES } from './sso-rules';
import { ssoCallbackUrl } from './sso-config';
import { SSO_COOKIE, SsoService } from './sso.service';
import { SaveSsoSettingsDto, SsoExchangeDto } from './sso.dto';

/** The state cookie lives on the API's own address, only as long as a sign-in may take. */
function stateCookie(value: string, maxAge: number) {
  const secure = ssoCallbackUrl()?.startsWith('https://') ? '; Secure' : '';
  return `${SSO_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

/** Single sign-on with Microsoft Entra ID or Google Workspace (ARCHITECTURE "Single sign-on"). */
@ApiTags('auth')
@AllowWhenUnpaid()
@Controller('auth/sso')
export class SsoController {
  constructor(private sso: SsoService) {}

  // Declared before `:orgCode`, which would otherwise take the word "callback" for a company code.
  @ApiOperation({ summary: "The provider's answer (the redirect URI registered with it)", description: 'Redirects to the web sign-in page with a one-time code, or with what went wrong.' })
  @Public()
  @Get('callback')
  async callback(@Query() q: { state?: string; code?: string; error?: string }, @Req() req: Request, @Res() res: Response) {
    const location = await this.sso.callback(q, cookieOf(req.headers.cookie, SSO_COOKIE), clientIp(req));
    res.setHeader('Set-Cookie', stateCookie('', 0));
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, location);
  }

  @ApiOperation({ summary: "Exchange the one-time code for a session (the same answer as a password sign-in)" })
  @Public()
  @HttpCode(200)
  @Post('exchange')
  exchange(@Body() dto: SsoExchangeDto, @Req() req: Request) {
    return this.sso.exchange(dto.code, clientIp(req));
  }

  @ApiOperation({ summary: 'Whether a company signs in with single sign-on, and with whom' })
  @Public()
  @Get(':orgCode')
  company(@Param('orgCode') code: string) {
    return this.sso.company(code);
  }

  @ApiOperation({ summary: "Start a single sign-on: redirects to the company's provider" })
  @Public()
  @Get(':orgCode/start')
  async start(@Param('orgCode') code: string, @Req() req: Request, @Res() res: Response) {
    const { location, state } = await this.sso.start(code, clientIp(req));
    if (state) res.setHeader('Set-Cookie', stateCookie(state, STATE_MINUTES * 60));
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, location);
  }
}

/** Company settings › Sign-in (admins). */
@ApiTags('company-settings')
@ApiBearerAuth()
@Controller('sso-settings')
export class SsoSettingsController {
  constructor(private sso: SsoService) {}

  @ApiOperation({ summary: "The company's single sign-on: provider, domains, whether it is required (never the secret)" })
  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.sso.settings(user);
  }

  @ApiOperation({ summary: 'Set up or change single sign-on', description: 'Requiring it needs this session to have signed in through it.' })
  @Put()
  save(@CurrentUser() user: RequestUser, @Body() dto: SaveSsoSettingsDto) {
    return this.sso.save(user, dto);
  }

  @ApiOperation({ summary: 'Stop single sign-on: everyone signs in with passwords again' })
  @Delete()
  remove(@CurrentUser() user: RequestUser) {
    return this.sso.remove(user);
  }
}
