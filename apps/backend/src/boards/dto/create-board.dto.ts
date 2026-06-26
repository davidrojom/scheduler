import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class BoardConfigDto {
  @IsOptional()
  @IsNumber()
  dayStartHour?: number;

  @IsOptional()
  @IsNumber()
  dayEndHour?: number;

  @IsOptional()
  @IsNumber()
  segmentsByHour?: number;

  @IsOptional()
  @IsString()
  logo?: string;
}

export class CreateBoardDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BoardConfigDto)
  config?: BoardConfigDto;
}
