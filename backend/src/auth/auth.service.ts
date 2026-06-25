import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { UserDto } from '../users/users.types';
import {
  ImpersonateInput,
  ImpersonateResponse,
  JwtPayload,
} from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly users: UsersService,
  ) {}

  async login(user: UserDto): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };
    return this.jwtService.signAsync(payload);
  }

  async impersonate(input: ImpersonateInput): Promise<ImpersonateResponse> {
    const user = await this.users.upsertByEmail({
      email: input.email,
      name: input.name,
    });
    const token = await this.login(user);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    };
  }
}
