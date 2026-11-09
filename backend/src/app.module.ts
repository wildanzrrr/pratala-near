import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfig } from './config/app-config.service.js';
import { AppConfigModule } from './config/config.module.js';
import { NearModule } from './common/near/near.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { FastAuthModule } from './fastauth/fastauth.module.js';
import { UsersModule } from './users/users.module.js';
import { EvidenceModule } from './evidence/evidence.module.js';
import { PlotsModule } from './plots/plots.module.js';
import { AiModule } from './ai/ai.module.js';
import { LotsModule } from './lots/lots.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { IndexerModule } from './indexer/indexer.module.js';
import { ListingsModule } from './listings/listings.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { IntentsModule } from './intents/intents.module.js';
import { StatsModule } from './stats/stats.module.js';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    NearModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    JwtModule.registerAsync({
      global: true,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_TTL_SECONDS') },
      }),
    }),
    HealthModule,
    AuthModule,
    FastAuthModule,
    UsersModule,
    EvidenceModule,
    PlotsModule,
    AiModule,
    LotsModule,
    NotificationsModule,
    IndexerModule,
    ListingsModule,
    OrdersModule,
    PaymentsModule,
    IntentsModule,
    StatsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
