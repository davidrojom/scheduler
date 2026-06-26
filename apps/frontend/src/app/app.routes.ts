import { Routes } from '@angular/router';
import { SchedulerComponent } from './pages/scheduler/scheduler.component';
import { AuthCallbackComponent } from './pages/auth-callback/auth-callback.component';
import { JoinComponent } from './pages/join/join.component';

export const routes: Routes = [
  {
    path: 'auth/callback',
    component: AuthCallbackComponent,
  },
  {
    path: 'join/:token',
    component: JoinComponent,
  },
  {
    path: '',
    component: SchedulerComponent,
  },
];
