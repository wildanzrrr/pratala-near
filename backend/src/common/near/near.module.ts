import { Global, Module } from '@nestjs/common';
import { ChainRolesService } from './roles.service.js';
import { NearRpcService } from './rpc.service.js';

@Global()
@Module({
  providers: [NearRpcService, ChainRolesService],
  exports: [NearRpcService, ChainRolesService],
})
export class NearModule {}
