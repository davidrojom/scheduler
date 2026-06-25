export interface JwtPayload {
  sub: string;
  email: string;
  name: string | null;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface ImpersonateInput {
  email: string;
  name?: string;
}

export interface ImpersonateResponse {
  token: string;
  user: MeResponse;
}
