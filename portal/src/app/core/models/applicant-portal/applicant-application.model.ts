import { UniformMeasurement, UniformSet } from '../registration/uniform-measurement.model';

/** A programme the applicant can pick on the Apply page. */
export interface ApplyProgrammeOption {
  intake_programme_id: number;
  programme_name: string;
  programme_code: string;
}

/** A training level open on an intake, with its application fee. */
export interface ApplyTrainingLevelOption {
  training_level_id: number;
  training_level_name: string;
  application_fee: number;
  programmes: ApplyProgrammeOption[];
}

/** An open intake. `already_applied` is set when the applicant has an application for it. */
export interface ApplyIntakeOption {
  intake_id: number;
  intake_name: string;
  already_applied: boolean;
  application_number?: string;
  training_levels: ApplyTrainingLevelOption[];
}

export interface ApplyRequest {
  intake_id: number;
  training_level_id: number;
  intake_programme_ids: number[];
  /** "Boarder" | "Day Scholar" */
  residence: string;
}

export interface PortalProgrammeChoice {
  programme_name: string;
  programme_code: string;
  application_status: string;
  /** 1 = 1st choice, 2 = 2nd choice; 0 if not recorded. */
  choice: number;
}

export interface PortalLetter {
  type: 'provisional' | 'admission';
  title: string;
}

export interface PortalDocument {
  id: number;
  document_name: string;
  type: 'provisional' | 'admission' | string;
  file_name: string;
  mime_type: string;
}

/** The admission an approved applicant was given. */
export interface PortalAdmission {
  admission_number: string;
  programme_name: string;
  programme_code: string;
  intake_name: string;
  admitted_at: string;
}

/** An application as the applicant sees it (no staff-only details). */
export interface PortalApplication {
  id: number;
  application_number: string;
  intake_name: string;
  training_level_name: string;
  /** "Boarder" | "Day Scholar" ('' for older applications) */
  residence: string;
  application_fee: number;
  payment_status: 'unpaid' | 'paid' | string;
  decision_status: 'pending' | 'notified' | 'recalled' | 'approved' | 'rejected' | string;
  notified_at?: string;
  /** Last day to respond after being notified (YYYY-MM-DD). */
  respond_by?: string;
  /** Only while notified: whole days left to respond (0 = last day, negative = window passed). */
  days_remaining?: number;
  /** Set once approved, while the admission is active. */
  admission?: PortalAdmission;
  /** Letters the applicant can download as PDFs. */
  letters: PortalLetter[];
  /** Staff-uploaded documents (fee structure, joining requirements, …). */
  documents: PortalDocument[];
  /** Documents held back until an admitted applicant submits their uniform measurements. */
  locked_documents: number;
  /** Set once admitted: pending (form not submitted) | submitted | unlocked (reopened by staff). */
  uniform_status?: 'pending' | 'submitted' | 'unlocked' | string;
  programmes: PortalProgrammeChoice[];
  created_at: string;
}

/** How each decision status is shown to applicants. */
export const DECISION_STATUS_DISPLAY: Record<string, { label: string; badge: string; icon: string }> = {
  awaiting_payment: { label: 'Awaiting Payment', badge: 'badge-warning', icon: 'fa-money-bill-wave' },
  pending:  { label: 'Under Review', badge: 'badge-warning',   icon: 'fa-hourglass-half' },
  notified: { label: 'Notified',     badge: 'badge-info',      icon: 'fa-bell' },
  recalled: { label: 'Recalled',     badge: 'badge-secondary', icon: 'fa-history' },
  approved: { label: 'Approved',     badge: 'badge-success',   icon: 'fa-check-circle' },
  rejected: { label: 'Unsuccessful', badge: 'badge-danger',    icon: 'fa-times-circle' }
};

export function decisionDisplay(status: string): { label: string; badge: string; icon: string } {
  return DECISION_STATUS_DISPLAY[status] ?? { label: status, badge: 'badge-secondary', icon: 'fa-circle' };
}

/**
 * The status to show applicants for an application. A pending application
 * isn't reviewed until its fee is paid, so it shows "Awaiting Payment" rather
 * than "Under Review" while unpaid.
 */
export function applicationStatus(app: PortalApplication): string {
  if (app.decision_status === 'pending' && app.payment_status !== 'paid') return 'awaiting_payment';
  return app.decision_status;
}

/**
 * The status to show for one programme in an application. When the
 * application is notified or recalled, the server leaves the programmes that
 * weren't chosen as "pending"; applicants see those as unsuccessful.
 */
export function programmeStatus(app: PortalApplication, programme: PortalProgrammeChoice): string {
  if (programme.application_status === 'pending' && applicationStatus(app) === 'awaiting_payment') {
    return 'awaiting_payment';
  }
  if (programme.application_status === 'pending' && ['notified', 'recalled'].includes(app.decision_status)) {
    return 'rejected';
  }
  return programme.application_status;
}

/**
 * Countdown shown to a notified applicant. Colours follow the staff Notified
 * Applications page: green above 10 days, amber above 3, red otherwise.
 */
export function countdownDisplay(days: number): { text: string; level: 'ok' | 'warn' | 'urgent' | 'ended' } {
  if (days < 0) return { text: 'Offer period ended', level: 'ended' };
  if (days === 0) return { text: 'Last day', level: 'urgent' };
  const text = `${days} ${days === 1 ? 'day' : 'days'} left`;
  if (days > 10) return { text, level: 'ok' };
  if (days > 3) return { text, level: 'warn' };
  return { text, level: 'urgent' };
}

/** The portal's Uniform Measurements page: who it's for, the form and any saved values. */
export interface PortalUniformForm {
  application_id: number;
  full_name: string;
  gender: string;
  admission_number: string;
  programme_name: string;
  intake_name: string;
  /** ['gents'] or ['ladies'] from the profile gender; both when the gender is Other. */
  allowed_sets: string[];
  sets: UniformSet[];
  /** False once submitted, until staff unlock it. */
  editable: boolean;
  measurement?: UniformMeasurement;
}

export interface SubmitUniformRequest {
  uniform_set: string;
  /** Inches, keyed by field key. */
  measurements: Record<string, number>;
  tailor_confirmed: boolean;
}

/** An application-fee payment, as listed on the applicant's Payments page. */
export interface PortalPayment {
  id: number;
  application_number: string;
  intake_name: string;
  transaction_code: string;
  payment_method: string;
  amount: number;
  paid_at?: string;
}
