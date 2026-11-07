import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard, type SessionUser } from '../common/guards/jwt-auth.guard.js';
import { ApiZodBody, ApiZodQuery, uuidSchema } from '../common/zod.js';
import {
  createListingSchema,
  listingsQuerySchema,
  updateListingSchema,
  type CreateListingDto,
  type ListingsQuery,
  type UpdateListingDto,
} from './listings.schemas.js';
import { ListingsService, toListingView } from './listings.service.js';

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  @ApiOperation({ summary: 'Active farm-input listings (seed, fertilizer, soil, other)' })
  @ApiZodQuery(listingsQuerySchema)
  list(@Query({ schema: listingsQuerySchema }) q: ListingsQuery) {
    return this.listings.list(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One listing' })
  async get(@Param('id', { schema: uuidSchema }) id: string) {
    return toListingView(await this.listings.get(id));
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a listing (seller = signed-in account)' })
  @ApiZodBody(createListingSchema)
  create(@CurrentUser() user: SessionUser, @Body({ schema: createListingSchema }) body: CreateListingDto) {
    return this.listings.create(user.accountId, body);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update own listing' })
  @ApiZodBody(updateListingSchema)
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateListingSchema }) body: UpdateListingDto,
  ) {
    return this.listings.update(user.accountId, id, body);
  }
}
