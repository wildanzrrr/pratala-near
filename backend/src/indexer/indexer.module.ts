import { Module } from '@nestjs/common';
import { LotsModule } from '../lots/lots.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { IndexerController } from './indexer.controller.js';
import { IndexerService } from './indexer.service.js';

@Module({
  imports: [LotsModule, NotificationsModule, OrdersModule],
  controllers: [IndexerController],
  providers: [IndexerService],
  exports: [IndexerService],
})
export class IndexerModule {}
