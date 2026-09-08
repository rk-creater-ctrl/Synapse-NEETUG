import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ContentManagementRoles } from '../../shared/decorators/content-management-roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import {
  MediaAssetDto,
  MediaAssetListDto,
  UpdateMediaAssetDto,
} from './media-asset.dto';
import { MediaAssetsService } from './media-assets.service';

@ApiTags('admin media assets')
@ApiBearerAuth()
@Controller('admin/media-assets')
@UseGuards(JwtAuthGuard, RolesGuard)
@ContentManagementRoles()
export class MediaAssetsController {
  constructor(private readonly mediaAssets: MediaAssetsService) {}

  @Get()
  list(@Query() query: MediaAssetListDto) {
    return this.mediaAssets.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.mediaAssets.get(id);
  }

  @Post()
  create(@Body() dto: MediaAssetDto) {
    return this.mediaAssets.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMediaAssetDto) {
    return this.mediaAssets.update(id, dto);
  }
}
