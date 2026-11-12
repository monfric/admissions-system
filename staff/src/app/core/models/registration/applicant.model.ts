import { PreviousApplication } from './application-batch.model';

export interface Applicant {
  id: number;
  email: string;

  first_name: string;
  middle_name?: string;
  last_name: string;
  full_name: string;
  phone_number: string;
  id_number: string;
  date_of_birth: string;
  gender: 'Male' | 'Female' | 'Other';

  county: string;
  sub_county: string;

  denomination?: string;

  has_disability: boolean;
  disability_details?: string;

  guardian_name: string;
  relationship: string;
  guardian_contact: string;
  sponsor_name?: string;
  sponsor_contact?: string;

  secondary_school: string;
  index_number: string;
  kcse_year: number;
  aggregate: string;

  english_grade: string;
  kiswahili_grade: string;
  biology_grade: string;
  maths_grade: string;
  chemistry_grade: string;
  physics_grade: string;

  college_grade?: string;
  graduation_year?: number;

  profile_photo?: string;
  documents?: ApplicantDocument[];
  mark_complete: boolean;
  /** Applicant-portal profile-form step the applicant is on (0-based). */
  profile_step?: number;
  applications: PreviousApplication[];

  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApplicantDocument {
  id: number;
  document_type: ApplicantDocumentType | string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface CreateApplicantRequest {
  email: string;
  password: string;

  first_name: string;
  middle_name?: string;
  last_name: string;
  phone_number: string;
  id_number: string;
  date_of_birth: string;
  gender: 'Male' | 'Female' | 'Other';

  county?: string;
  sub_county?: string;

  denomination?: string;

  has_disability: boolean;
  disability_details?: string;

  guardian_name: string;
  relationship: string;
  guardian_contact: string;
  sponsor_name?: string;
  sponsor_contact?: string;

  secondary_school: string;
  index_number: string;
  kcse_year: number;
  aggregate: string;

  english_grade: string;
  kiswahili_grade: string;
  biology_grade: string;
  maths_grade: string;
  chemistry_grade: string;
  physics_grade: string;

  college_grade?: string;
  graduation_year?: number | null;

  mark_complete: boolean;

  is_active?: boolean;
}

export type UpdateApplicantRequest = Partial<CreateApplicantRequest>;

export interface PaginatedApplicants {
  data: Applicant[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ApplicantResponse {
  success: boolean;
  message: string;
  data: Applicant;
}

export interface ApplicantListResponse {
  success: boolean;
  message: string;
  data: PaginatedApplicants;
}

export interface FileUploadResponse {
  success: boolean;
  message: string;
  data?: {
    file_path: string;
    file_name: string;
    file_type: string;
    file_size: number;
  };
}

export type ApplicantDocumentType =
  | 'profile'
  | 'id_card'
  | 'kcse_certificate'
  | 'leaving_certificate'
  | 'post_secondary_certificate';

/** Counts for the cards on the staff New Applicants page (all applicants). */
export interface ApplicantStats {
  total: number;
  male: number;
  female: number;
  other_gender: number;
  new_this_month: number;
  new_today: number;
  /** Profile not yet submitted (portal) or marked complete (staff). */
  incomplete_profiles: number;
  /** No application for any intake. */
  not_yet_applied: number;
}
