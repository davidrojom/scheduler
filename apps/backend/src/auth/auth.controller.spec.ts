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
  it('GET /me maps the current user and slides the session via X-Refreshed-Token', async () => {
    const login = jest.fn().mockResolvedValue('refreshed.jwt.token');
    const authService = { login } as unknown as AuthService;
    const controller = new AuthController(authService, {} as ConfigService);

    const setHeader = jest.fn();
    const response = { setHeader } as unknown as Response;

    await expect(controller.me(user, response)).resolves.toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    });
    expect(login).toHaveBeenCalledWith(user);
    expect(setHeader).toHaveBeenCalledWith('X-Refreshed-Token', 'refreshed.jwt.token');
  });

  it('google callback signs a JWT and redirects to FRONTEND_URL/auth/callback?token=', async () => {
    const login = jest.fn().mockResolvedValue('signed.jwt.token');
    const authService = { login } as unknown as AuthService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue('http://localhost:4200'),
    } as unknown as ConfigService;
    const controller = new AuthController(authService, config);

    const writeHead = jest.fn();
    const end = jest.fn();
    await controller.googleCallback(user, {
      writeHead,
      end,
    } as unknown as Response);

    expect(login).toHaveBeenCalledWith(user);
    expect(writeHead).toHaveBeenCalledWith(302, {
      Location: 'http://localhost:4200/auth/callback?token=signed.jwt.token',
    });
    expect(end).toHaveBeenCalled();
  });
});
