import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TestModeGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<string>('AUTH_TEST_MODE') !== 'true') {
      throw new NotFoundException();
    }
    return true;
  }
}
