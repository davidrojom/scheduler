import { Routes } from '@angular/router';
import { SchedulerComponent } from './pages/scheduler/scheduler.component';
import { AuthCallbackComponent } from './pages/auth-callback/auth-callback.component';

export const routes: Routes = [
  {
    path: 'auth/callback',
    component: AuthCallbackComponent,
  },
  {
    path: '',
    component: SchedulerComponent,
  },
];
