/** One measurement on the uniform form, e.g. "Chest". */
export interface UniformField {
  key: string;
  label: string;
}

/** A garment's measurements, e.g. "Shirt". */
export interface UniformGarment {
  name: string;
  fields: UniformField[];
}

/** The gents or ladies form, as defined by the server. */
export interface UniformSet {
  key: 'gents' | 'ladies' | string;
  label: string;
  garments: UniformGarment[];
}

/** A submitted form. Values are in inches, keyed by field key. */
export interface UniformMeasurement {
  id: number;
  admission_id: number;
  uniform_set: 'gents' | 'ladies' | string;
  /** submitted (locked) | unlocked (reopened by staff for a correction) */
  status: 'submitted' | 'unlocked' | string;
  tailor_confirmed: boolean;
  submitted_at: string;
  unlocked_at?: string;
  values: Record<string, number>;
}

/** An admitted student on the staff Uniform Measurements page. */
export interface UniformMeasurementListItem {
  admission_id: number;
  admission_number: string;
  applicant_id: number;
  applicant_full_name: string;
  applicant_gender: string;
  applicant_phone: string;
  applicant_profile_photo?: string;
  programme_name: string;
  programme_code: string;
  intake_name: string;
  residence: string;
  admitted_at: string;
  measurement_status: 'pending' | 'submitted' | 'unlocked' | string;
  measurement?: UniformMeasurement;
}

export interface UniformMeasurementListResponse {
  success: boolean;
  message: string;
  data: {
    data: UniformMeasurementListItem[];
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

/** Counts for the staff Uniform Measurements page cards (active admissions). */
export interface UniformMeasurementStats {
  admitted: number;
  male: number;
  female: number;
  other_gender: number;
  /** Includes unlocked forms. */
  submitted: number;
  gents: number;
  ladies: number;
  pending: number;
  unlocked: number;
}

/** How each form status is shown on the staff page. */
export const MEASUREMENT_STATUS_DISPLAY: Record<string, { label: string; badge: string }> = {
  pending:   { label: 'Pending',   badge: 'badge-warning' },
  submitted: { label: 'Submitted', badge: 'badge-success' },
  unlocked:  { label: 'Unlocked',  badge: 'badge-info' }
};

/** Label and badge class for a form status. */
export function measurementStatusDisplay(status: string): { label: string; badge: string } {
  return MEASUREMENT_STATUS_DISPLAY[status] ?? { label: status, badge: 'badge-secondary' };
}

/** "Gents" / "Ladies" for a set key. */
export function uniformSetLabel(key: string | undefined): string {
  return key === 'gents' ? 'Gents' : key === 'ladies' ? 'Ladies' : '—';
}
