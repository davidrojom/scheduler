import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateBoardDto } from './create-board.dto';

export class ImportColumnDto {
  @IsUUID()
  id!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsNumber()
  position?: number;
}

export class ImportTaskDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  columnId!: string;

  @IsString()
  title!: string;

  @IsString()
  startHour!: string;

  @IsString()
  endHour!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participants?: string[];

  @IsOptional()
  @IsNumber()
  position?: number;
}

export class ImportBoardEntryDto {
  @ValidateNested()
  @Type(() => CreateBoardDto)
  board!: CreateBoardDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportColumnDto)
  columns?: ImportColumnDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportTaskDto)
  tasks?: ImportTaskDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participants?: string[];
}

export class ImportBoardsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportBoardEntryDto)
  boards!: ImportBoardEntryDto[];
}
