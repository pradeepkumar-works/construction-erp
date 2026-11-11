import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PasswordLinksService } from './password-links.service';
import { LoginGuardService } from './login-guard.service';
import { SsoService } from './sso.service';
import { SsoController, SsoSettingsController } from './sso.controller';
import { jwtSecret } from '../common/jwt-secret';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any },
      }),
    }),
  ],
  controllers: [SsoController, AuthController, SsoSettingsController],
  providers: [AuthService, JwtStrategy, PasswordLinksService, LoginGuardService, SsoService],
  exports: [AuthService, PasswordLinksService],
})
export class AuthModule {}
