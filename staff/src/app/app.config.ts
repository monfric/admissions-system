import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MatDialogModule } from '@angular/material/dialog';
import { provideToastr } from 'ngx-toastr';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { methodOverrideInterceptor } from './core/interceptors/method-override.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Hash URLs (#/new-applicants), so the web server needs no rewrite rules.
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withInterceptors([authInterceptor, methodOverrideInterceptor])),
    provideAnimations(),
    provideToastr({
      timeOut: 3000,
      positionClass: 'toast-top-right',
      preventDuplicates: true,
      progressBar: true,
      closeButton: true
    }),
    importProvidersFrom(MatDialogModule),
    provideCharts(withDefaultRegisterables(), {
      defaults: { font: { family: "'Source Sans Pro', -apple-system, 'Segoe UI', Roboto, sans-serif" }, color: '#374151' }
    })
  ]
};
