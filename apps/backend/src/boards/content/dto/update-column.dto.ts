import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateColumnDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsInt()
  position?: number;
}
