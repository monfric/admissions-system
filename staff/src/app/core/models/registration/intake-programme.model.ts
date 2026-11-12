export interface IntakeProgramme {
  id: number;
  intake_id: number;
  programme_id: number;
  programme_name: string;
  programme_code: string;
  training_level_id: number;
  training_level_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateIntakeProgrammeRequest {
  programme_id: number;
  is_active?: boolean;
}

export type UpdateIntakeProgrammeRequest = Partial<CreateIntakeProgrammeRequest>;

export interface IntakeProgrammeResponse {
  success: boolean;
  message: string;
  data: IntakeProgramme;
}

export interface IntakeProgrammeListResponse {
  success: boolean;
  message: string;
  data: IntakeProgramme[];
}
