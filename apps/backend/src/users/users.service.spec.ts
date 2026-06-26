import { Database } from '../database/database.module';
import {
  createTestDatabase,
  migrateTestDatabase,
  truncateAll,
} from '../database/testing/test-database';
import { UsersService } from './users.service';

describe('UsersService (against scheduler_test)', () => {
  let db: Database;
  let service: UsersService;

  beforeAll(async () => {
    db = createTestDatabase();
    await migrateTestDatabase(db);
  }, 30000);

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await truncateAll(db);
    service = new UsersService(db);
  });

  describe('upsertByEmail', () => {
    it('creates a user once and returns the same id on repeat calls', async () => {
      const first = await service.upsertByEmail({
        email: 'alice@example.com',
        name: 'Alice',
      });
      expect(first.id).toBeTruthy();
      expect(first.email).toBe('alice@example.com');
      expect(first.name).toBe('Alice');

      const second = await service.upsertByEmail({
        email: 'alice@example.com',
      });
      expect(second.id).toBe(first.id);

      const users = await db.selectFrom('users').selectAll().execute();
      expect(users).toHaveLength(1);
    });

    it('preserves an existing name when called again without a name', async () => {
      const first = await service.upsertByEmail({
        email: 'bob@example.com',
        name: 'Bob',
      });
      const second = await service.upsertByEmail({ email: 'bob@example.com' });

      expect(second.id).toBe(first.id);
      expect(second.name).toBe('Bob');
    });
  });

  describe('upsertByGoogle', () => {
    it('creates a user keyed by google_id/email and maps to camelCase', async () => {
      const user = await service.upsertByGoogle({
        googleId: 'g-123',
        email: 'carol@example.com',
        name: 'Carol',
        avatarUrl: 'https://example.com/avatar.png',
      });

      expect(user.id).toBeTruthy();
      expect(user.googleId).toBe('g-123');
      expect(user.email).toBe('carol@example.com');
      expect(user.name).toBe('Carol');
      expect(user.avatarUrl).toBe('https://example.com/avatar.png');
    });

    it('updates the same user on repeat google login (idempotent by email)', async () => {
      const first = await service.upsertByGoogle({
        googleId: 'g-1',
        email: 'dan@example.com',
        name: 'Dan',
      });
      const second = await service.upsertByGoogle({
        googleId: 'g-1',
        email: 'dan@example.com',
        name: 'Daniel',
        avatarUrl: 'https://example.com/dan.png',
      });

      expect(second.id).toBe(first.id);
      expect(second.name).toBe('Daniel');
      expect(second.avatarUrl).toBe('https://example.com/dan.png');

      const users = await db.selectFrom('users').selectAll().execute();
      expect(users).toHaveLength(1);
    });

    it('returns the same user when the same google_id logs in with a changed email', async () => {
      const first = await service.upsertByGoogle({
        googleId: 'g-shift',
        email: 'old@example.com',
        name: 'Grace',
        avatarUrl: 'https://example.com/grace.png',
      });

      const second = await service.upsertByGoogle({
        googleId: 'g-shift',
        email: 'new@example.com',
      });

      expect(second.id).toBe(first.id);
      expect(second.email).toBe('new@example.com');
      expect(second.googleId).toBe('g-shift');
      expect(second.name).toBe('Grace');
      expect(second.avatarUrl).toBe('https://example.com/grace.png');

      const users = await db.selectFrom('users').selectAll().execute();
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('new@example.com');
    });

    it('links a google_id onto a user previously created by email', async () => {
      const byEmail = await service.upsertByEmail({
        email: 'erin@example.com',
        name: 'Erin',
      });
      expect(byEmail.googleId).toBeNull();

      const byGoogle = await service.upsertByGoogle({
        googleId: 'g-erin',
        email: 'erin@example.com',
      });

      expect(byGoogle.id).toBe(byEmail.id);
      expect(byGoogle.googleId).toBe('g-erin');
      expect(byGoogle.name).toBe('Erin');
    });
  });

  describe('findById', () => {
    it('returns the user when it exists', async () => {
      const created = await service.upsertByEmail({
        email: 'frank@example.com',
        name: 'Frank',
      });

      const found = await service.findById(created.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.email).toBe('frank@example.com');
    });

    it('returns null when the user does not exist', async () => {
      const found = await service.findById(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(found).toBeNull();
    });
  });
});
