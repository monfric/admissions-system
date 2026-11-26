/** GET /dashboard/stats: everything on the staff Dashboard. */
export interface DashboardStats {
  intakes: DashboardIntake[];
  /** The intake the figures are for; null = all intakes. */
  intake_id: number | null;
  cards: {
    /** Registrations aren't tied to an intake, so these are always for all intakes. */
    applicants: { total: number; today: number; this_month: number; not_yet_applied: number };
    applications: {
      total: number;
      today: number;
      unpaid: number;
      paid: number;
      paid_today: number;
      pending_decision: number;
      reached_notified: number;
      notified: number;
      approved: number;
      rejected: number;
      recalled: number;
      expiring_soon: number;
      boarders: number;
      day_scholars: number;
    };
    fees: { total: number; this_month: number; today: number };
    admitted: { total: number; this_month: number };
    expiring_within_days: number;
  };
  pipeline: { stage: string; count: number }[];
  decision_status: { status: DecisionSlice; count: number }[];
  /** One entry per day for the last 30 days. */
  trend: { date: string; applications: number; payments: number }[];
  /** One entry per month (YYYY-MM) for the last 12 months. */
  fees_by_month: { month: string; amount: number }[];
  payment_methods: { method: string; count: number; amount: number }[];
  programmes: { name: string; code: string; training_level: string; first_choice: number; other_choice: number }[];
  training_levels: { name: string; applied: number; paid: number; approved: number }[];
  /** 1st-choice applications per faculty. */
  faculties: { name: string; count: number }[];
  demographics: {
    applicants: number;
    gender: { male: number; female: number; other: number };
    with_disability: number;
    counties: { county: string; count: number }[];
    residence: { boarders: number; day_scholars: number };
  };
  post_admission: { admitted: number; with_offer_letter: number; with_documents: number; uniform_submitted: number };
  expiring: DashboardExpiring[];
  recent_activity: DashboardActivity[];
  /** Admins only. */
  staff_activity?: DashboardStaffActivity[];
}

export interface DashboardIntake {
  id: number;
  label: string;
  is_active: boolean;
}

export type DecisionSlice = 'awaiting_payment' | 'awaiting_decision' | 'notified' | 'approved' | 'rejected' | 'recalled';

export interface DashboardExpiring {
  id: number;
  application_number: string;
  applicant_name: string;
  phone_number: string;
  training_level: string;
  notified_at: string;
  /** 0 = last day before automatic recall. */
  days_remaining: number;
}

export interface DashboardActivity {
  type: 'application' | 'payment' | 'admission';
  at: string;
  applicant_name: string;
  reference: string;
  detail: string;
}

export interface DashboardStaffActivity {
  id: number;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  approvals: number;
}
