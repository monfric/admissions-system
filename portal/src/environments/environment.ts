// NMTC applicant portal settings. Only what the portal needs: no staff, mail or
// payroll settings, because everything here ends up in the browser bundle.
export const environment = {
  production: true,
  // Backend API (the same backend as the staff app).
  apiUrl: 'https://api.pamojaci.org/api/v1',
  // Encrypts the applicant session kept in localStorage.
  encryptSecretKey: '9fa2db328660d07eee9baddf28518691c31057478c692c84'
};
