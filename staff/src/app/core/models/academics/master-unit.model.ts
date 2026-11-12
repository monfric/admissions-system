export interface MasterUnit {
  id: number;
  department_id?: number;
  name: string;
  code: string;
  description: string;
  default_credit_hours: number;
  default_theory_hours: number;
  default_practical_hours: number;
  has_sub_units: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  
  // Relationships (populated when needed)
  department?: Department;
  sub_units?: MasterSubUnit[];
  semester_units?: SemesterUnit[];
}

export interface MasterSubUnit {
  id: number;
  parent_unit_id: number;
  name: string;
  code: string;
  description: string;
  default_theory_hours: number;
  default_practical_hours: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  
  // Relationships
  parent_unit?: MasterUnit;
}

export interface Department {
  id: number;
  faculty_id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  
  // Relationships
  faculty?: Faculty;
}

export interface Faculty {
  id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
}

export interface SemesterUnit {
  id: number;
  semester_id: number;
  master_unit_id: number;
  lecturer_id?: number;
  credit_hours: number;
  theory_hours: number;
  practical_hours: number;
  venue: string;
  custom_notes: string;
  is_active: boolean;
}

// DTOs for Master Units
export interface CreateMasterUnitRequest {
  department_id?: number;
  name: string;
  code: string;
  description: string;
  default_credit_hours: number;
  default_theory_hours: number;
  default_practical_hours: number;
  has_sub_units?: boolean;
  is_active?: boolean;
}

export interface UpdateMasterUnitRequest {
  department_id?: number;
  name?: string;
  code?: string;
  description?: string;
  default_credit_hours?: number;
  default_theory_hours?: number;
  default_practical_hours?: number;
  has_sub_units?: boolean;
  is_active?: boolean;
}

export interface MasterUnitFilterRequest {
  department_id?: number;
  has_sub_units?: boolean;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// DTOs for Sub Units
export interface CreateMasterSubUnitRequest {
  parent_unit_id: number;
  name: string;
  code: string;
  description: string;
  default_theory_hours: number;
  default_practical_hours: number;
  is_active?: boolean;
}

export interface UpdateMasterSubUnitRequest {
  name?: string;
  code?: string;
  description?: string;
  default_theory_hours?: number;
  default_practical_hours?: number;
  is_active?: boolean;
}

export interface MasterSubUnitFilterRequest {
  parent_unit_id?: number;
  is_active?: boolean;
  search?: string;
}

// Response DTOs
export interface MasterUnitResponse extends MasterUnit {
  department_name?: string;
  total_sub_units?: number;
  total_semester_offerings?: number;
  total_hours?: number; // sum of theory + practical
}

export interface MasterSubUnitResponse extends MasterSubUnit {
  parent_unit_name?: string;
  parent_unit_code?: string;
  total_hours?: number;
}

// Generic Response Types
export interface PaginatedResult<T> {
  data: T[];
  total_items: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}