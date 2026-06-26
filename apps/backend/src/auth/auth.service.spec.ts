import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UsersService } from '../users/users.service';
import { UserDto } from '../users/users.types';
import { AuthService } from './auth.service';

const JWT_SECRET = 'test-secret-for-auth-service-spec';

function makeUser(overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    googleId: null,
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let upsertByEmail: jest.Mock;

  beforeEach(async () => {
    upsertByEmail = jest.fn();
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: JWT_SECRET })],
      providers: [
        AuthService,
        { provide: UsersService, useValue: { upsertByEmail } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwtService = moduleRef.get(JwtService);
  });

  it('signs a well-formed JWT carrying the { sub, email, name } payload', async () => {
    const user = makeUser();
    const token = await service.login(user);

    expect(token.split('.')).toHaveLength(3);

    const decoded = jwtService.verify<JwtPayloadForTest>(token, {
      secret: JWT_SECRET,
    });
    expect(decoded.sub).toBe(user.id);
    expect(decoded.email).toBe(user.email);
    expect(decoded.name).toBe(user.name);
  });

  it('produces a token that fails verification under a different secret', async () => {
    const token = await service.login(makeUser());
    expect(() => {
      jwtService.verify(token, { secret: 'wrong-secret' });
    }).toThrow();
  });

  describe('impersonate', () => {
    it('upserts the user by email and returns a real JWT plus the user', async () => {
      const user = makeUser({
        email: 'validator@example.com',
        name: 'Validator',
      });
      upsertByEmail.mockResolvedValue(user);

      const result = await service.impersonate({
        email: 'validator@example.com',
        name: 'Validator',
      });

      expect(upsertByEmail).toHaveBeenCalledWith({
        email: 'validator@example.com',
        name: 'Validator',
      });
      expect(result.user).toEqual({
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      });
      expect(result.token.split('.')).toHaveLength(3);

      const decoded = jwtService.verify<JwtPayloadForTest>(result.token, {
        secret: JWT_SECRET,
      });
      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe(user.email);
    });

    it('passes an undefined name through to the upsert', async () => {
      const user = makeUser({ email: 'noname@example.com', name: null });
      upsertByEmail.mockResolvedValue(user);

      await service.impersonate({ email: 'noname@example.com' });

      expect(upsertByEmail).toHaveBeenCalledWith({
        email: 'noname@example.com',
        name: undefined,
      });
    });
  });
});

interface JwtPayloadForTest {
  sub: string;
  email: string;
  name: string | null;
}
