export interface Department {
  id: number;
  faculty_id: number;
  faculty_name?: string;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateDepartmentRequest {
  faculty_id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
}

export interface UpdateDepartmentRequest {
  faculty_id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
}

export interface DepartmentResponse {
  success: boolean;
  message: string;
  data: Department | Department[] | PaginatedDepartments;
}

export interface PaginatedDepartments {
  data: Department[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}