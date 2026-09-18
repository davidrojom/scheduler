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

    let origin: string;
    let target: URL;
    try {
      origin = new URL(frontendUrl).origin;
      target = new URL('/auth/callback', origin);
    } catch {
      throw new Error(`Invalid FRONTEND_URL: ${frontendUrl}`);
    }

    // Allowlist: only ever send the user back to the configured frontend origin.
    if (target.origin !== origin) {
      throw new Error(
        'Redirect target does not match the configured frontend origin',
      );
    }
    target.searchParams.set('token', token);

    res.writeHead(302, { Location: target.toString() });
    res.end();
  }

  @Post('impersonate')
  @UseGuards(TestModeGuard)
  impersonate(@Body() dto: ImpersonateDto): Promise<ImpersonateResponse> {
    return this.authService.impersonate(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(
    @CurrentUser() user: UserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    // Sliding session: re-issue the JWT on every app load so active users
    // stay logged in; the frontend interceptor persists the new token.
    res.setHeader('X-Refreshed-Token', await this.authService.login(user));

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
  }
}
