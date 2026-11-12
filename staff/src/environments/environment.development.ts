// NMTC staff app settings. Only what the portal needs: no staff, mail or
// payroll settings, because everything here ends up in the browser bundle.
export const environment = {
  production: false,
  // Backend API (the same backend as the applicant portal).
  apiUrl: 'http://127.0.0.1:8002/api/v1',
  // Encrypts the staff session kept in localStorage.
  encryptSecretKey: 'a82a7ae52bf384aa3379a2d302b096234612143cdb548b30'
};
