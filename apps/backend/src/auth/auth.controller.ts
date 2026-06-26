import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserDto } from '../users/users.types';
import { ImpersonateResponse, MeResponse } from './auth.types';
import { AuthService } from './auth.service';
import { ImpersonateDto } from './dto/impersonate.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TestModeGuard } from './guards/test-mode.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth(): void {
    // GoogleAuthGuard issues the 302 redirect to Google before this runs.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @CurrentUser() user: UserDto,
    @Res() res: Response,
  ): Promise<void> {
    const token = await this.authService.login(user);
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }

  @Post('impersonate')
  @UseGuards(TestModeGuard)
  impersonate(@Body() dto: ImpersonateDto): Promise<ImpersonateResponse> {
    return this.authService.impersonate(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: UserDto): MeResponse {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
  }
}
