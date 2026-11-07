import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  JwtAuthGuard,
  type SessionUser,
} from '../common/guards/jwt-auth.guard.js';
import {
  sha256ParamSchema,
  uploadEvidenceSchema,
  type UploadEvidenceDto,
} from './evidence.schemas.js';
import { EvidenceService } from './evidence.service.js';
import { MAX_EVIDENCE_BYTES } from './evidence.util.js';

@ApiTags('evidence')
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload an evidence photo (≤ 8 MB). Returns sha256, EXIF GPS and capture time.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'kind'],
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: ['PLOT', 'FIELD_VISIT', 'COOP_REVIEW', 'WEIGH_IN', 'OTHER'] },
        lotId: { type: 'string', example: 'lot-1' },
        plotId: { type: 'string', format: 'uuid' },
      },
    },
  })
  upload(
    @CurrentUser() user: SessionUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body({ schema: uploadEvidenceSchema }) body: UploadEvidenceDto,
  ) {
    return this.evidence.upload(user.accountId, file, body);
  }

  @Get(':sha256')
  @ApiOperation({ summary: 'Stream an evidence file by its sha256 (content-addressed, immutable)' })
  async file(
    @Param('sha256', { schema: sha256ParamSchema }) sha256: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { mime, obj } = await this.evidence.open(sha256);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `"${sha256}"`);
    return new StreamableFile(obj.stream, { type: mime, length: obj.size });
  }
}
