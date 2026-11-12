export interface Student {
  id?: number;
  admission_number: string;
  first_name: string;
  other_names?: string;
  surname: string;
  full_name?: string;
  date_of_birth: string;
  age?: number;
  gender: 'Male' | 'Female' | 'Other';
  
  // Contact Information
  email: string;
  mobile_phone: string;
  id_number: string;
  
  // Location Information
  county: string;
  sub_county: string;
  
  // Academic Information
  current_class_id: number;
  class_name?: string;
  class_code?: string;
  programme_name?: string;
  admission_date: string;
  residence: 'Boarder' | 'Day Scholar';
  is_active: boolean;
  
  // KCSE Information
  index_number: string;
  kcse_year: number;
  kcse_series: string;
  kcse_aggregate: string;
  secondary_school: string;

  // External examination/regulation body index (e.g. TVET, NCK)
  external_body_index?: string;

  // Subject Grades
  english_grade: string;
  kiswahili_grade: string;
  maths_grade: string;
  biology_grade: string;
  chemistry_grade: string;
  physics_grade: string;
  
  // Guardian/Sponsor Information
  guardian_name: string;
  guardian_contact: string;
  relationship_guardian: string;
  sponsor_name?: string;

  // Files
  profile_photo?: string;
  id_document?: string;
  kcse_result_slip?: string;
  
  // Religious Information
  denomination?: string;
  
  // Disability Information
  has_disability: boolean;
  disability_details?: string;

  // Notes / Comments
  notes?: string;

  // Metadata
  created_at?: string;
  updated_at?: string;

  // Account linking
  user_id?: number | null;
}

export interface CreateStudentRequest {
  admission_number: string;
  first_name: string;
  other_names?: string;
  surname: string;
  date_of_birth: string;
  gender: 'Male' | 'Female' | 'Other';
  
  email: string;
  mobile_phone: string;
  id_number: string;
  
  county: string;
  sub_county: string;
  
  current_class_id: number;
  admission_date: string;
  residence: 'Boarder' | 'Day Scholar';
  is_active: boolean;
  
  index_number: string;
  kcse_year: number;
  kcse_series: string;
  kcse_aggregate: string;
  secondary_school: string;

  external_body_index?: string;

  english_grade: string;
  kiswahili_grade: string;
  maths_grade: string;
  biology_grade: string;
  chemistry_grade: string;
  physics_grade: string;
  
  guardian_name: string;
  guardian_contact: string;
  relationship_guardian: string;
  sponsor_name?: string;
  
  denomination?: string;
  
  has_disability: boolean;
  disability_details?: string;

  notes?: string;
}

export interface UpdateStudentRequest extends Partial<CreateStudentRequest> {
  user_id?: number;
}

export interface StudentResponse {
  success: boolean;
  message: string;
  data: Student | Student[] | PaginatedStudents;
}

export interface PaginatedStudents {
  data: Student[];
  total_items: number;
  page: number;
  page_size: number;
  total_pages: number;
}
export interface BulkImportStudent {
  admission_number: string;
  first_name: string;
  other_names?: string;
  surname: string;
  date_of_birth?: string;
  gender?: 'Male' | 'Female' | 'Other';
  email: string;
  mobile_phone?: string;
  id_number?: string;
  county?: string;
  sub_county?: string;
  current_class_id: number;
  admission_date?: string;
  residence?: 'Boarder' | 'Day Scholar';
  is_active?: boolean;
  index_number?: string;
  kcse_year?: number;
  kcse_series?: string;
  kcse_aggregate?: string;
  secondary_school?: string;
  external_body_index?: string;
  english_grade?: string;
  kiswahili_grade?: string;
  maths_grade?: string;
  biology_grade?: string;
  chemistry_grade?: string;
  physics_grade?: string;
  guardian_name?: string;
  guardian_contact?: string;
  relationship_guardian?: string;
  sponsor_name?: string;
  denomination?: string;
  has_disability?: boolean;
  disability_details?: string;
  notes?: string;
}

export interface BulkImportResponse {
  success: boolean;
  message: string;
  data: {
    total_requested: number;
    success_count: number;
    failed_count: number;
    imported: Array<{
      id: number;
      admission_number: string;
      full_name: string;
    }>;
    errors: Array<{
      admission_number: string;
      error: string;
    }>;
  };
}

export interface TransferStudentRequest {
  student_id: number;
  new_class_id: number;
  transfer_date: string;
  reason: string;
}

export interface StudentStatistics {
  total_students: number;
  active_students: number;
  male_count: number;
  female_count: number;
  boarders_count: number;
  day_scholars_count: number;
  students_with_disability: number;
  by_gender: any
  by_residence: any
  by_class: Array<{
    class_id: number;
    class_name: string;
    student_count: number;
  }>;
  by_programme: Array<{
    programme_id: number;
    programme_name: string;
    student_count: number;
  }>;
  by_county: Array<{
    county: string;
    student_count: number;
  }>;
}

// Helper constants
export const KCSE_GRADES = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E'];
/** Applicant subject grades: the KCSE grades plus "Not Applicable" for subjects not taken. */
export const KCSE_SUBJECT_GRADES = [...KCSE_GRADES, 'Not Applicable'];
export const RESIDENCE_OPTIONS = ['Boarder', 'Day Scholar'];
export const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
export const RELATIONSHIP_OPTIONS = ['Parent', 'Guardian', 'Relative', 'Sponsor', 'Other'];

// Kenya Counties
export const KENYA_COUNTIES = [
  'Mombasa', 'Kwale', 'Kilifi', 'Tana River', 'Lamu', 'Taita-Taveta', 'Garissa', 'Wajir',
  'Mandera', 'Marsabit', 'Isiolo', 'Meru', 'Tharaka-Nithi', 'Embu', 'Kitui', 'Machakos',
  'Makueni', 'Nyandarua', 'Nyeri', 'Kirinyaga', 'Murang\'a', 'Kiambu', 'Turkana', 'West Pokot',
  'Samburu', 'Trans-Nzoia', 'Uasin Gishu', 'Elgeyo-Marakwet', 'Nandi', 'Baringo', 'Laikipia',
  'Nakuru', 'Narok', 'Kajiado', 'Kericho', 'Bomet', 'Kakamega', 'Vihiga', 'Bungoma', 'Busia',
  'Siaya', 'Kisumu', 'Homa Bay', 'Migori', 'Kisii', 'Nyamira', 'Nairobi'
];