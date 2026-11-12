export interface TrainingLevel {
  id: number;
  name: string;
  code: string;
  description: string;
  order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateTrainingLevelRequest {
  name: string;
  code: string;
  description: string;
  order: number;
  is_active: boolean;
}

export interface UpdateTrainingLevelRequest {
  name: string;
  code: string;
  description: string;
  order: number;
  is_active: boolean;
}

export interface TrainingLevelResponse {
  success: boolean;
  message: string;
  data: TrainingLevel | TrainingLevel[] | PaginatedTrainingLevels;
}

export interface PaginatedTrainingLevels {
  data: TrainingLevel[];
  total_items: number;
  page: number;
  page_size: number;
  total_pages: number;
}