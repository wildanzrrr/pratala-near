import { INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppConfig } from './config/app-config.service.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

/** Shared by main.ts and the e2e tests so both run the same HTTP stack. */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);

  app.setGlobalPrefix('api');
  app.use(cookieParser());

  // JSON API + evidence images consumed cross-origin by the web app.
  const strict = helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
  });
  // Swagger UI needs inline scripts/styles.
  const docs = helmet({ contentSecurityPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith('/api/docs')
      ? docs(req, res, next)
      : strict(req, res, next),
  );

  const origins = config
    .get('FRONTEND_ORIGIN')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle('Pratala API')
    .setDescription(
      'Off-chain API for Pratala (evidence, AI checks, lot mirror, payments, notifications). ' +
        'Shapes follow docs/INTERFACES.md §5. Session: httpOnly cookie `pratala_session` from POST /api/auth/verify.',
    )
    .setVersion('0.1.0')
    .addCookieAuth('pratala_session')
    .build();
  SwaggerModule.setup('api/docs', app, () =>
    SwaggerModule.createDocument(app, doc),
  );
}
