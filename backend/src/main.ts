import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppConfig } from './config/app-config.service.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get(AppConfig);
  const logger = new Logger('Bootstrap');
  if (!process.env.JWT_SECRET) {
    logger.warn(
      'JWT_SECRET is not set: using a random per-process secret (sessions reset on restart).',
    );
  }
  if (!config.aiConfigured) {
    logger.warn('NEAR_AI_API_KEY is empty: POST /api/ai/check returns 503.');
  }
  const port = config.get('PORT');
  await app.listen(port, '0.0.0.0');
  logger.log(`Pratala API on :${port} (docs at /api/docs)`);
}
await bootstrap();
