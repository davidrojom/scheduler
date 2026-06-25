import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Profile } from 'passport-google-oauth20';
import { UsersService } from '../../users/users.service';
import { UserDto } from '../../users/users.types';
import { GoogleStrategy } from './google.strategy';

const config = {
  getOrThrow: (key: string) => `placeholder-${key}`,
} as unknown as ConfigService;

const user: UserDto = {
  id: '44444444-4444-4444-4444-444444444444',
  googleId: 'g-1',
  email: 'grace@example.com',
  name: 'Grace',
  avatarUrl: 'https://example.com/grace.png',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('GoogleStrategy', () => {
  it('upserts the user from the Google profile and returns it', async () => {
    const upsertByGoogle = jest.fn().mockResolvedValue(user);
    const users = { upsertByGoogle } as unknown as UsersService;
    const strategy = new GoogleStrategy(config, users);

    const profile = {
      id: 'g-1',
      displayName: 'Grace',
      emails: [{ value: 'grace@example.com' }],
      photos: [{ value: 'https://example.com/grace.png' }],
    } as unknown as Profile;

    const result = await strategy.validate('access', 'refresh', profile);

    expect(result).toEqual(user);
    expect(upsertByGoogle).toHaveBeenCalledWith({
      googleId: 'g-1',
      email: 'grace@example.com',
      name: 'Grace',
      avatarUrl: 'https://example.com/grace.png',
    });
  });

  it('throws Unauthorized when the Google profile has no email', async () => {
    const upsertByGoogle = jest.fn();
    const users = { upsertByGoogle } as unknown as UsersService;
    const strategy = new GoogleStrategy(config, users);

    const profile = {
      id: 'g-2',
      displayName: 'No Email',
      emails: [],
    } as unknown as Profile;

    await expect(
      strategy.validate('access', 'refresh', profile),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(upsertByGoogle).not.toHaveBeenCalled();
  });
});
