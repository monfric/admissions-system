import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApplicantAuthService } from '../../../../core/services/applicant-portal/applicant-auth.service';

/** "Forgot password?": asks for the email and sends a reset link to it. */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './forgot-password.component.html',
  // Same look as the login page.
  styleUrl: '../applicant-login/applicant-login.component.scss'
})
export class ForgotPasswordComponent implements OnInit {
  form!: FormGroup;
  isLoading = false;
  errorMessage = '';
  /** The API's reply once sent (the same whether or not the email has an account). */
  sentMessage = '';

  constructor(private fb: FormBuilder, private applicantAuth: ApplicantAuthService) {}

  ngOnInit(): void {
    this.form = this.fb.group({ email: ['', [Validators.required, Validators.email]] });
  }

  get email() { return this.form.get('email'); }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    this.errorMessage = '';
    this.applicantAuth.forgotPassword(String(this.form.value.email).trim()).subscribe({
      next: res => {
        this.isLoading = false;
        this.sentMessage = res.message;
      },
      error: err => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Could not send the reset link. Please try again.';
      }
    });
  }
}
