import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { UserDto } from '../users/users.types';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const user: UserDto = {
  id: '22222222-2222-2222-2222-222222222222',
  googleId: 'g-77',
  email: 'grace@example.com',
  name: 'Grace',
  avatarUrl: 'https://example.com/grace.png',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthController', () => {
  it('GET /me maps the current user to { id, email, name, avatarUrl }', () => {
    const controller = new AuthController(
      {} as AuthService,
      {} as ConfigService,
    );

    expect(controller.me(user)).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    });
  });

  it('google callback signs a JWT and redirects to FRONTEND_URL/auth/callback?token=', async () => {
    const login = jest.fn().mockResolvedValue('signed.jwt.token');
    const authService = { login } as unknown as AuthService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue('http://localhost:4200'),
    } as unknown as ConfigService;
    const controller = new AuthController(authService, config);

    const redirect = jest.fn();
    await controller.googleCallback(user, { redirect } as unknown as Response);

    expect(login).toHaveBeenCalledWith(user);
    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:4200/auth/callback?token=signed.jwt.token',
    );
  });
});
