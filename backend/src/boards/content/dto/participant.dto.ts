import { IsNotEmpty, IsString } from 'class-validator';

export class ParticipantDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
