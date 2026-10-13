import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, SetPasswordDto, SignupDto } from './auth.dto';
import { Public } from '../common/decorators';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @ApiOperation({ summary: 'What the sign-in screens may offer: organisation sign-up and reset by email' })
  @Public()
  @Get('options')
  options() {
    return this.auth.options();
  }

  @ApiOperation({ summary: 'Create an organisation and its first admin (only when ORG_SIGNUP=open)', description: 'Signs the new admin in.' })
  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @ApiOperation({ summary: 'Email a password-reset link', description: 'Always answers ok, whether or not the email has an account.' })
  @Public()
  @HttpCode(200)
  @Post('forgot-password')
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @ApiOperation({ summary: 'Who an invite or reset link is for (to show before choosing a password)' })
  @Public()
  @Get('password-token/:token')
  passwordToken(@Param('token') token: string) {
    return this.auth.passwordToken(token);
  }

  @ApiOperation({ summary: 'Use an invite or reset link: set the password and sign in' })
  @Public()
  @HttpCode(200)
  @Post('set-password')
  setPassword(@Body() dto: SetPasswordDto) {
    return this.auth.setPassword(dto.token, dto.password);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user);
  }

  @ApiBearerAuth()
  @Post('change-password')
  changePassword(@CurrentUser() user: RequestUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
  }
}
