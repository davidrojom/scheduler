export interface UserDto {
  id: string;
  googleId: string | null;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertByGoogleInput {
  googleId: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface UpsertByEmailInput {
  email: string;
  name?: string | null;
}
