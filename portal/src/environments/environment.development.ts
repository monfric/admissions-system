// NMTC applicant portal settings. Only what the portal needs: no staff, mail or
// payroll settings, because everything here ends up in the browser bundle.
export const environment = {
  production: false,
  // Backend API (the same backend as the staff app).
  apiUrl: 'http://127.0.0.1:8002/api/v1',
  // Encrypts the applicant session kept in localStorage.
  encryptSecretKey: '9fa2db328660d07eee9baddf28518691c31057478c692c84'
};
