import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { Database, KYSELY } from '../src/database/database.module';
import {
  createTestDatabase,
  migrateTestDatabase,
  truncateAll,
} from '../src/database/testing/test-database';
import { UsersService } from '../src/users/users.service';

const CALLBACK_URL = 'http://localhost:3100/api/auth/google/callback';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let httpServer: Server;
  let usersService: UsersService;
  let authService: AuthService;

  beforeAll(async () => {
    db = createTestDatabase();
    await migrateTestDatabase(db);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KYSELY)
      .useValue(db)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    httpServer = app.getHttpServer() as Server;
    usersService = app.get(UsersService);
    authService = app.get(AuthService);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  describe('GET /api/auth/google', () => {
    it('responds 302 toward the Google OAuth server with client_id and matching redirect_uri', async () => {
      const res = await request(httpServer).get('/api/auth/google').expect(302);

      const location = res.headers['location'];
      expect(location).toContain(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(location).toContain('client_id=placeholder-google-client-id');
      expect(location).toContain(
        `redirect_uri=${encodeURIComponent(CALLBACK_URL)}`,
      );
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the authenticated user for a valid Bearer token', async () => {
      const user = await usersService.upsertByGoogle({
        googleId: 'g-e2e',
        email: 'me@example.com',
        name: 'Me User',
        avatarUrl: 'https://example.com/me.png',
      });
      const token = await authService.login(user);

      const res = await request(httpServer)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = res.body as {
        id: string;
        email: string;
        name: string | null;
        avatarUrl: string | null;
      };
      expect(body).toEqual({
        id: user.id,
        email: 'me@example.com',
        name: 'Me User',
        avatarUrl: 'https://example.com/me.png',
      });
    });

    it('responds 401 when no Authorization header is present', async () => {
      await request(httpServer).get('/api/auth/me').expect(401);
    });

    it('responds 401 for a malformed/garbage Bearer token', async () => {
      await request(httpServer)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.valid.jwt')
        .expect(401);
    });
  });
});
