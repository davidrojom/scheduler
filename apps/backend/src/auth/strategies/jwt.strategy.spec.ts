import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { UserDto } from '../../users/users.types';
import { JwtStrategy } from './jwt.strategy';

const config = {
  getOrThrow: () => 'jwt-strategy-spec-secret',
} as unknown as ConfigService;

const user: UserDto = {
  id: '33333333-3333-3333-3333-333333333333',
  googleId: null,
  email: 'jwt@example.com',
  name: 'Jwt User',
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('JwtStrategy', () => {
  it('resolves the user identified by the token subject', async () => {
    const findById = jest.fn().mockResolvedValue(user);
    const users = { findById } as unknown as UsersService;
    const strategy = new JwtStrategy(config, users);

    const result = await strategy.validate({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    expect(result).toEqual(user);
    expect(findById).toHaveBeenCalledWith(user.id);
  });

  it('throws Unauthorized when the token subject has no matching user', async () => {
    const findById = jest.fn().mockResolvedValue(null);
    const users = { findById } as unknown as UsersService;
    const strategy = new JwtStrategy(config, users);

    await expect(
      strategy.validate({ sub: 'missing', email: 'x@y.z', name: null }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
