import {
  Global,
  Inject,
  Module,
  OnApplicationShutdown,
  Provider,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { DB } from './database.types';

export const KYSELY = Symbol('KYSELY');

export type Database = Kysely<DB>;

const kyselyProvider: Provider = {
  provide: KYSELY,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Database =>
    new Kysely<DB>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          max: 10,
        }),
      }),
    }),
};

@Global()
@Module({
  providers: [kyselyProvider],
  exports: [kyselyProvider],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
