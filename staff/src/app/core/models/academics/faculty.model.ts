/**
 * Faculty Model
 * Represents a faculty entity in the NMTC admissions system
 */

export interface Faculty {
  id?: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FacultyResponse {
  success: boolean;
  message: string;
  data: Faculty;
}

export interface FacultyListResponse {
  success: boolean;
  message: string;
  data: {
    data: Faculty[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  };
}

export interface CreateFacultyDto {
  name: string;
  code: string;
  description: string;
  is_active: boolean;
}

export interface UpdateFacultyDto {
  name: string;
  code: string;
  description: string;
  is_active: boolean;
}

export interface FacultyFilters {
  page?: number;
  page_size?: number;
  search?: string;
  is_active?: boolean;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}