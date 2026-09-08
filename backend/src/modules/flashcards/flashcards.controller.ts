import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ContentManagementRoles } from '../../shared/decorators/content-management-roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import {
  AdminFlashcardListDto,
  FlashcardDto,
  FlashcardFilterDto,
  ReviewDto,
  UpdateFlashcardDto,
} from './flashcards.dto';
import { FlashcardsService } from './flashcards.service';

type AuthenticatedUser = { id: string };

@Controller('learning/flashcards')
@UseGuards(JwtAuthGuard)
export class FlashcardsController {
  constructor(private readonly flashcards: FlashcardsService) {}

  @Get()
  list(@Query() query: FlashcardFilterDto) {
    return this.flashcards.list(query);
  }

  @Get('session')
  session(@Query() query: FlashcardFilterDto) {
    return this.flashcards.session(query);
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.flashcards.one(id);
  }

  @Post(':id/review')
  review(
    @Req() request: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.flashcards.review(request.user.id, id, dto);
  }
}

@Controller('admin/learning/flashcards')
@UseGuards(JwtAuthGuard, RolesGuard)
@ContentManagementRoles()
export class AdminFlashcardsController {
  constructor(private readonly flashcards: FlashcardsService) {}

  @Get()
  list(@Query() query: AdminFlashcardListDto) {
    return this.flashcards.adminList(query);
  }

  @Post()
  create(@Body() dto: FlashcardDto) {
    return this.flashcards.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFlashcardDto) {
    return this.flashcards.update(id, dto);
  }
}
