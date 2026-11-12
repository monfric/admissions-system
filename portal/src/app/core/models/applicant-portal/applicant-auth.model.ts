export interface ApplicantSessionInfo {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone_number: string;
  id_number: string;
  profile_complete: boolean;
}

export interface ApplicantSession {
  token: string;
  expires_at: number; // unix seconds
  applicant: ApplicantSessionInfo;
}

export interface ApplicantRegisterRequest {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  id_number: string;
  password: string;
}

export interface ApplicantApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}
