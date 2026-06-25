import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BoardRole } from '../database/database.types';
import { UserDto } from '../users/users.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BoardsService } from './boards.service';
import {
  BoardDetailDto,
  BoardDto,
  BoardSummaryDto,
  CreatedBoardDto,
  ImportResultDto,
} from './boards.types';
import { BoardRoles, MemberRole } from './decorators/board-roles.decorator';
import { CreateBoardDto } from './dto/create-board.dto';
import { ImportBoardsDto } from './dto/import-boards.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { BoardRoleGuard } from './guards/board-role.guard';

@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  list(@CurrentUser() user: UserDto): Promise<BoardSummaryDto[]> {
    return this.boards.listForUser(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: UserDto,
    @Body() dto: CreateBoardDto,
  ): Promise<CreatedBoardDto> {
    return this.boards.create(user.id, dto);
  }

  @Post('import')
  async import(
    @CurrentUser() user: UserDto,
    @Body() dto: ImportBoardsDto,
  ): Promise<ImportResultDto> {
    const boards = await this.boards.importForUser(user.id, dto);
    return { boards };
  }

  @Get(':id')
  @UseGuards(BoardRoleGuard)
  getOne(
    @Param('id') id: string,
    @MemberRole() role: BoardRole,
  ): Promise<BoardDetailDto> {
    return this.boards.getDetail(id, role);
  }

  @Patch(':id')
  @BoardRoles('owner', 'editor')
  @UseGuards(BoardRoleGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBoardDto,
  ): Promise<BoardDto> {
    return this.boards.update(id, dto);
  }

  @Delete(':id')
  @BoardRoles('owner')
  @UseGuards(BoardRoleGuard)
  @HttpCode(200)
  async remove(@Param('id') id: string): Promise<{ success: true }> {
    await this.boards.remove(id);
    return { success: true };
  }
}
