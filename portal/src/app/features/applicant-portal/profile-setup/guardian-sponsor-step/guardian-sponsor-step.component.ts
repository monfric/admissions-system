import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DigitsOnlyDirective } from '../../../../shared/directives/digits-only.directive';
import { PROFILE_OPTIONS, profileFieldError } from '../profile-form';

/** Profile form step — markup mirrors the matching tab of the staff applicant dialog. */
@Component({
  selector: 'app-guardian-sponsor-step',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DigitsOnlyDirective],
  templateUrl: './guardian-sponsor-step.component.html',
  styleUrls: ['../profile-form.scss']
})
export class GuardianSponsorStepComponent {
  @Input({ required: true }) form!: FormGroup;
  options = PROFILE_OPTIONS;

  fieldError(name: string): string {
    return profileFieldError(this.form, name);
  }
}
