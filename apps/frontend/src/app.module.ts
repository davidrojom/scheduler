import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app/app.routes';

import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { SchedulerComponent } from './app/pages/scheduler/scheduler.component';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { SharedModule } from './app/shared/shared.module';
import { authInterceptor } from './app/shared/interceptors/auth.interceptor';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    SchedulerComponent,
    RouterModule.forRoot(routes),
    NgbModule,
    SharedModule,
  ],
  providers: [provideHttpClient(withInterceptors([authInterceptor]))],
  bootstrap: [AppComponent],
})
export class AppModule {}
