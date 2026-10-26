import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import type { IncomingMessage } from 'http';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { tenantMiddleware } from './prisma/tenant-context';
import { SANDBOXED_FILE_CSP, securityHeaders } from './common/security-headers';
import { PRODUCT_NAME } from '@erp/shared';

async function bootstrap() {
  // rawBody: the Razorpay webhook signature is over the exact bytes sent
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Biometric devices with the ADMS push protocol (v6 item 101) call /iclock/… at the server's root, so it stays outside /api.
  app.setGlobalPrefix('api', { exclude: ['iclock/cdata', 'iclock/getrequest', 'iclock/devicecmd'] });
  // …and they post their punch tables as plain text, often with no content type.
  // Schedule files imported as text in JSON (v6 item 114) run to a few MB; Vercel takes at most 4.5 MB a request.
  app.useBodyParser('json', { limit: '4mb' });
  app.useBodyParser('text', { type: (req: IncomingMessage) => !req.headers['content-type'] || /^text\//.test(req.headers['content-type']), limit: '5mb' });
  app.use(tenantMiddleware);
  app.use(securityHeaders);
  // CORS_ORIGINS: comma-separated list of allowed origins; unset = allow any origin (dev / mobile apps)
  const origins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
  // maxAge: the browser asks once per URL per 2 hours (Chrome's cap) instead of before every call, which on a list doubled
  // the round trips; Server-Timing is exposed so the web app can report where a slow call spent its time.
  app.enableCors({ origin: origins.length ? origins : true, credentials: true, maxAge: 7200, exposedHeaders: ['Server-Timing'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));

  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  app.useStaticAssets(join(process.cwd(), uploadDir), {
    prefix: '/uploads/',
    setHeaders: (res, path) => {
      if (/\.(html?|xhtml|svg|xml)$/i.test(path)) res.setHeader('Content-Security-Policy', SANDBOXED_FILE_CSP);
    },
  });

  const config = new DocumentBuilder()
    .setTitle(`${PRODUCT_NAME} API`)
    .setDescription(`API for the ${PRODUCT_NAME} construction ERP and its site app`)
    .setVersion('0.1')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-cron-secret', description: 'CRON_SECRET for the scheduled notification jobs' }, 'cron')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT || 4000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}/api  (docs at /api/docs)`);
}
bootstrap();
