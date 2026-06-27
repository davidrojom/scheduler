import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  /**
   * Forces Google's account chooser on every login. Without `prompt`, Google
   * silently re-authenticates with the browser's active account, so a user who
   * wants to sign in with a different account never gets the option.
   * `passport-google-oauth20` reads `prompt` from the per-request authenticate
   * options (not the strategy constructor), which is exactly what this returns.
   */
  getAuthenticateOptions(): { prompt: string } {
    return { prompt: 'select_account' };
  }
}
