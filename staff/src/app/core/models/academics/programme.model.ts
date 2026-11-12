export interface Programme {
  id: number;
  department_id: number;
  department_name?: string;
  department_code?: string;
  training_level_id: number;
  training_level_name?: string;
  training_level_code?: string;
  name: string;
  code: string;
  description: string;
  duration_years: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateProgrammeRequest {
  department_id: number;
  training_level_id: number;
  name: string;
  code: string;
  description: string;
  duration_years: number;
  is_active: boolean;
}

export interface UpdateProgrammeRequest {
  department_id: number;
  training_level_id: number;
  name: string;
  code: string;
  description: string;
  duration_years: number;
  is_active: boolean;
}

export interface ProgrammeResponse {
  success: boolean;
  message: string;
  data: Programme | Programme[] | PaginatedProgrammes;
}

export interface PaginatedProgrammes {
  data: Programme[];
  total_items: number;
  page: number;
  page_size: number;
  total_pages: number;
}