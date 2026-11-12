import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { PROFILE_OPTIONS, profileFieldError } from '../profile-form';
import { DENOMINATION_OPTIONS } from '../../../../core/models/registration/applicant-background';

/** Profile form step — markup mirrors the matching tab of the staff applicant dialog. */
@Component({
  selector: 'app-location-background-step',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './location-background-step.component.html',
  styleUrls: ['../profile-form.scss']
})
export class LocationBackgroundStepComponent {
  @Input({ required: true }) form!: FormGroup;
  options = PROFILE_OPTIONS;
  readonly denominations = DENOMINATION_OPTIONS;

  fieldError(name: string): string {
    return profileFieldError(this.form, name);
  }
}
