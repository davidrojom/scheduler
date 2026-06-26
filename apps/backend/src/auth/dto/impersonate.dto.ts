import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ImpersonateDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
