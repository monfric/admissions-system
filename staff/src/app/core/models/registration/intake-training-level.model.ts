export interface IntakeTrainingLevel {
  id: number;
  intake_id: number;
  training_level_id: number;
  training_level_name: string;
  training_level_code: string;
  application_fee: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateIntakeTrainingLevelRequest {
  training_level_id: number;
  application_fee: number;
  is_active?: boolean;
}

export type UpdateIntakeTrainingLevelRequest = Partial<CreateIntakeTrainingLevelRequest>;

export interface IntakeTrainingLevelResponse {
  success: boolean;
  message: string;
  data: IntakeTrainingLevel;
}

export interface IntakeTrainingLevelListResponse {
  success: boolean;
  message: string;
  data: IntakeTrainingLevel[];
}
