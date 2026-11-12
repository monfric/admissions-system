import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Applicant, ApplicantDocumentType } from '../../../core/models/registration/applicant.model';
import { DIGITS_ONLY } from '../../../shared/directives/digits-only.directive';
import { applyBackgroundRules, joinDenomination, splitDenomination } from '../../../core/models/registration/applicant-background';
import { ApplicantProfileUpdate } from '../../../core/services/applicant-portal/applicant-portal.service';
import {
  GENDER_OPTIONS,
  KCSE_GRADES,
  KCSE_SUBJECT_GRADES,
  KENYA_COUNTIES,
  RELATIONSHIP_OPTIONS
} from '../../../core/models/academics/student.model';

// Same option lists as the staff New Applicants form.
export const PROFILE_OPTIONS = {
  genders: GENDER_OPTIONS,
  relationships: RELATIONSHIP_OPTIONS,
  counties: KENYA_COUNTIES,
  kcseGrades: KCSE_GRADES,
  subjectGrades: KCSE_SUBJECT_GRADES,
  years: Array.from({ length: 16 }, (_, i) => new Date().getFullYear() - i)
};

export interface ProfileStep {
  key: 'personal' | 'location' | 'guardian' | 'education' | 'documents' | 'review';
  label: string;
  /** One line shown under the step title. */
  description: string;
  icon: string;
  fields: string[];
}

export const PROFILE_STEPS: ProfileStep[] = [
  { key: 'personal',  label: 'Personal Details',      icon: 'fa-id-card',
    description: 'Tell us who you are.',
    fields: ['first_name', 'middle_name', 'last_name', 'phone_number', 'id_number', 'date_of_birth', 'gender'] },
  { key: 'location',  label: 'Location & Background', icon: 'fa-map-marker-alt',
    description: 'Where you live and a little about your background.',
    fields: ['county', 'sub_county', 'denomination', 'denomination_other', 'has_disability', 'disability_details'] },
  { key: 'guardian',  label: 'Guardian & Sponsor',    icon: 'fa-users',
    description: 'Who we should contact about you, and who is sponsoring your studies.',
    fields: ['guardian_name', 'relationship', 'guardian_contact', 'sponsor_name', 'sponsor_contact'] },
  { key: 'education', label: 'Education',             icon: 'fa-graduation-cap',
    description: 'Your KCSE results and any college qualifications.',
    fields: ['secondary_school', 'index_number', 'kcse_year', 'aggregate', 'english_grade', 'kiswahili_grade',
             'biology_grade', 'maths_grade', 'chemistry_grade', 'physics_grade', 'college_grade', 'graduation_year'] },
  { key: 'documents', label: 'Documents',             icon: 'fa-file-alt',
    description: 'Upload your photo and certificates. Each file is saved as soon as you choose it.',
    fields: [] },
  { key: 'review',    label: 'Review & Submit',       icon: 'fa-check-circle',
    description: 'Check everything is correct, then submit your profile.',
    fields: [] }
];

const IMAGE_TYPES = ['image/jpeg', 'image/png'];
const DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB, same as the staff form

/** Checks a chosen file before upload; returns an error message, or '' when it's fine. */
export function documentFileError(type: ApplicantDocumentType, file: File): string {
  const allowed = type === 'profile' ? IMAGE_TYPES : DOCUMENT_TYPES;
  if (!allowed.includes(file.type)) {
    return type === 'profile' ? 'Only JPEG or PNG files are allowed.' : 'Only JPEG, PNG or PDF files are allowed.';
  }
  if (file.size > MAX_FILE_SIZE) return 'File exceeds the maximum size of 2MB.';
  return '';
}

/** Documents the backend requires before a profile can be submitted. */
export const REQUIRED_DOCUMENTS: { type: ApplicantDocumentType; label: string }[] = [
  { type: 'profile', label: 'Profile photo' },
  { type: 'id_card', label: 'ID card' },
  { type: 'kcse_certificate', label: 'KCSE results certificate' }
];

/** Builds the profile form with the same fields and validators as the staff form (minus account fields). */
export function buildProfileForm(fb: FormBuilder): FormGroup {
  const form = fb.group({
    first_name:       ['', [Validators.required, Validators.maxLength(100)]],
    middle_name:      ['', [Validators.maxLength(100)]],
    last_name:        ['', [Validators.required, Validators.maxLength(100)]],
    phone_number:     ['', [Validators.required, DIGITS_ONLY, Validators.maxLength(20)]],
    id_number:        ['', [Validators.required, Validators.maxLength(50)]],
    date_of_birth:    ['', [Validators.required]],
    gender:           ['', [Validators.required]],
    county:           ['', [Validators.required]],
    sub_county:       ['', [Validators.required, Validators.maxLength(100)]],
    denomination:     ['', [Validators.required]],
    denomination_other: [''],
    has_disability:   [false],
    disability_details: [''],
    guardian_name:    ['', [Validators.required, Validators.maxLength(200)]],
    relationship:     ['', [Validators.required]],
    guardian_contact: ['', [Validators.required, DIGITS_ONLY, Validators.maxLength(20)]],
    sponsor_name:     ['', [Validators.maxLength(200)]],
    sponsor_contact:  ['', [DIGITS_ONLY, Validators.maxLength(20)]],
    secondary_school: ['', [Validators.required, Validators.maxLength(200)]],
    index_number:     ['', [Validators.required, Validators.maxLength(50)]],
    kcse_year:        [new Date().getFullYear(), [Validators.required]],
    aggregate:        ['', [Validators.required, Validators.maxLength(10)]],
    english_grade:    ['', [Validators.required]],
    kiswahili_grade:  ['', [Validators.required]],
    biology_grade:    ['', [Validators.required]],
    maths_grade:      ['', [Validators.required]],
    chemistry_grade:  ['', [Validators.required]],
    physics_grade:    ['', [Validators.required]],
    college_grade:    ['', [Validators.maxLength(50)]],
    graduation_year:  [null]
  });
  // Conditional fields; the subscriptions live as long as the form.
  applyBackgroundRules(form);
  return form;
}

export function patchProfileForm(form: FormGroup, a: Applicant): void {
  form.patchValue({
    first_name:       a.first_name ?? '',
    middle_name:      a.middle_name ?? '',
    last_name:        a.last_name ?? '',
    phone_number:     a.phone_number ?? '',
    id_number:        a.id_number ?? '',
    date_of_birth:    a.date_of_birth ? String(a.date_of_birth).substring(0, 10) : '',
    gender:           a.gender ?? '',
    county:           a.county ?? '',
    sub_county:       a.sub_county ?? '',
    ...splitDenomination(a.denomination),
    has_disability:   !!a.has_disability,
    disability_details: a.disability_details ?? '',
    guardian_name:    a.guardian_name ?? '',
    relationship:     a.relationship ?? '',
    guardian_contact: a.guardian_contact ?? '',
    sponsor_name:     a.sponsor_name ?? '',
    sponsor_contact:  a.sponsor_contact ?? '',
    secondary_school: a.secondary_school ?? '',
    index_number:     a.index_number ?? '',
    aggregate:        a.aggregate ?? '',
    english_grade:    a.english_grade ?? '',
    kiswahili_grade:  a.kiswahili_grade ?? '',
    biology_grade:    a.biology_grade ?? '',
    maths_grade:      a.maths_grade ?? '',
    chemistry_grade:  a.chemistry_grade ?? '',
    physics_grade:    a.physics_grade ?? '',
    college_grade:    a.college_grade ?? '',
    graduation_year:  a.graduation_year ?? null,
    // kcse_year is 0 until first saved — keep the form's default year then.
    ...(a.kcse_year ? { kcse_year: a.kcse_year } : {})
  });
}

/** Converts the form into the save payload (dates as ISO, empty year as null). */
export function toProfilePayload(form: FormGroup): ApplicantProfileUpdate {
  const raw = form.getRawValue();
  let dateOfBirth: string | undefined;
  if (raw.date_of_birth) {
    const d = new Date(raw.date_of_birth);
    d.setUTCHours(0, 0, 0, 0);
    dateOfBirth = d.toISOString();
  }
  const { denomination_other, ...rest } = raw;
  return {
    ...rest,
    denomination: joinDenomination(raw.denomination, denomination_other),
    date_of_birth: dateOfBirth,
    graduation_year: raw.graduation_year || null
  };
}

export function profileFieldError(form: FormGroup, name: string): string {
  const ctrl = form.get(name);
  if (!ctrl || !ctrl.touched || !ctrl.errors) return '';
  if (ctrl.errors['required'])  return 'This field is required';
  if (ctrl.errors['maxlength']) return `Max ${ctrl.errors['maxlength'].requiredLength} characters`;
  if (ctrl.errors['pattern'])   return 'Numbers only';
  return 'Invalid value';
}
