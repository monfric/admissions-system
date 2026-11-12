import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MatDialogModule } from '@angular/material/dialog';
import { provideToastr } from 'ngx-toastr';

import { routes } from './app.routes';
import { applicantAuthInterceptor } from './core/interceptors/applicant-auth.interceptor';
import { methodOverrideInterceptor } from './core/interceptors/method-override.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Hash URLs (#/applicant/...), so the web server needs no rewrite rules.
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withInterceptors([applicantAuthInterceptor, methodOverrideInterceptor])),
    provideAnimations(),
    provideToastr({
      timeOut: 3000,
      positionClass: 'toast-top-right',
      preventDuplicates: true,
      progressBar: true,
      closeButton: true
    }),
    importProvidersFrom(MatDialogModule)
  ]
};
