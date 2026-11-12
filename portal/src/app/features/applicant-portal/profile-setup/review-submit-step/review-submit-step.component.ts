import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup } from '@angular/forms';
import { Applicant } from '../../../../core/models/registration/applicant.model';
import { PROFILE_STEPS, REQUIRED_DOCUMENTS } from '../profile-form';
import { joinDenomination } from '../../../../core/models/registration/applicant-background';

const FIELD_LABELS: Record<string, string> = {
  first_name: 'First Name', middle_name: 'Middle Name', last_name: 'Last Name',
  phone_number: 'Phone Number', id_number: 'ID Number', date_of_birth: 'Date of Birth', gender: 'Gender',
  county: 'County', sub_county: 'Sub-County', denomination: 'Denomination', has_disability: 'Has Disability',
  disability_details: 'Disability Details',
  guardian_name: 'Guardian Name', relationship: 'Relationship', guardian_contact: 'Guardian Contact',
  sponsor_name: 'Sponsor Name', sponsor_contact: 'Sponsor Contact',
  secondary_school: 'Secondary School', index_number: 'Index Number', kcse_year: 'KCSE Year', aggregate: 'Aggregate',
  english_grade: 'English', kiswahili_grade: 'Kiswahili', biology_grade: 'Biology', maths_grade: 'Mathematics',
  chemistry_grade: 'Chemistry', physics_grade: 'Physics', college_grade: 'College Grade', graduation_year: 'Graduation Year'
};

/** Read-only summary of every step, plus the required-documents checklist. */
@Component({
  selector: 'app-review-submit-step',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './review-submit-step.component.html',
  styleUrls: ['../profile-form.scss']
})
export class ReviewSubmitStepComponent {
  @Input({ required: true }) form!: FormGroup;
  @Input() profile: Applicant | null = null;
  /** Asks the parent to jump to the step with this index. */
  @Output() editStep = new EventEmitter<number>();

  readonly sections = PROFILE_STEPS
    .map((step, index) => ({ ...step, index }))
    .filter(step => step.fields.length > 0);
  readonly requiredDocuments = REQUIRED_DOCUMENTS;
  readonly documentsStepIndex = PROFILE_STEPS.findIndex(step => step.key === 'documents');

  /** Fields shown in the summary: the "Other" text is folded into Denomination,
   *  and disability details only appear when the applicant has a disability. */
  visibleFields(fields: string[]): string[] {
    return fields.filter(f =>
      f !== 'denomination_other' && (f !== 'disability_details' || !!this.form.get('has_disability')?.value));
  }

  label(field: string): string {
    return FIELD_LABELS[field] ?? field;
  }

  value(field: string): string {
    const v = this.form.get(field)?.value;
    if (field === 'has_disability') return v ? 'Yes' : 'No';
    if (field === 'denomination') return joinDenomination(v, this.form.get('denomination_other')?.value);
    return v === null || v === undefined ? '' : String(v);
  }

  isMissing(field: string): boolean {
    if (field === 'denomination') return !!this.form.get('denomination')?.invalid || !!this.form.get('denomination_other')?.invalid;
    return !!this.form.get(field)?.invalid;
  }

  hasDocument(type: string): boolean {
    if (!this.profile) return false;
    if (type === 'profile') return !!this.profile.profile_photo;
    return (this.profile.documents || []).some(d => d.document_type === type);
  }
}
