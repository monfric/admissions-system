export interface Admission {
  id: number;
  admission_number: string;
  applicant_id: number;
  applicant_full_name: string;
  applicant_email: string;
  applicant_phone: string;
  applicant_profile_photo?: string;
  application_id: number;
  intake_id: number;
  intake_name: string;
  programme_id: number;
  programme_name: string;
  programme_code: string;
  /** Mode of residence from the admitted application ('' if not recorded). */
  residence: string;
  status: string;
  admitted_at: string;
  updated_at: string;
}

export interface PaginatedAdmissions {
  data: Admission[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface AdmissionListResponse {
  success: boolean;
  message: string;
  data: PaginatedAdmissions;
}

/** Counts for the cards on the staff Approved Applications page (all admissions). */
export interface AdmissionStats {
  total: number;
  male: number;
  female: number;
  other_gender: number;
  admitted_this_month: number;
  admitted_today: number;
  /** Split by the admitted application's mode of residence. */
  boarders: number;
  day_scholars: number;
}
