import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

const OVERRIDDEN = ['PUT', 'PATCH', 'DELETE'];

/**
 * Sends PUT, PATCH and DELETE to the API as a POST with an
 * X-HTTP-Method-Override header (the API reads it back). Some shared hosts'
 * firewalls (ModSecurity) refuse PUT and DELETE with "406 Not Acceptable".
 * The host also refuses an empty POST, so a body-less request gets {}.
 */
export const methodOverrideInterceptor: HttpInterceptorFn = (req, next) => {
  if (!OVERRIDDEN.includes(req.method) || !req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }
  return next(req.clone({
    method: 'POST',
    body: req.body ?? {},
    setHeaders: { 'X-HTTP-Method-Override': req.method }
  }));
};
