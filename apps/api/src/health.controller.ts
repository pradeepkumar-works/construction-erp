import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators';
import { EmailService } from './notifications/email.service';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService, private email: EmailService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', time: new Date().toISOString(), tenantGuard: await this.prisma.tenantGuardStatus(), email: this.email.enabled ? this.email.provider : 'disabled' };
  }
}
