import { Module } from '@nestjs/common';
import { FastAuthModule } from '../fastauth/fastauth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [UsersModule, FastAuthModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
