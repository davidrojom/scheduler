import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
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

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: JWT_SECRET })],
      providers: [AuthService],
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
});

interface JwtPayloadForTest {
  sub: string;
  email: string;
  name: string | null;
}
