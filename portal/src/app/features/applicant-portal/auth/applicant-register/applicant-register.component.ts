import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApplicantAuthService } from '../../../../core/services/applicant-portal/applicant-auth.service';
import { ToastService } from '../../../../core/services/toast/toast.service';
import { DigitsOnlyDirective } from '../../../../shared/directives/digits-only.directive';

function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return password && confirmPassword && password !== confirmPassword ? { passwordMismatch: true } : null;
}

@Component({
  selector: 'app-applicant-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, DigitsOnlyDirective],
  templateUrl: './applicant-register.component.html',
  styleUrl: './applicant-register.component.scss'
})
export class ApplicantRegisterComponent implements OnInit {

  registerForm!: FormGroup;
  errorMessage = '';
  isLoading = false;
  /** Each password field shows its text while its flag is true (eye buttons). */
  showPassword = false;
  showConfirmPassword = false;

  constructor(
    private fb: FormBuilder,
    private applicantAuth: ApplicantAuthService,
    private router: Router,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.registerForm = this.fb.group({
      first_name: ['', [Validators.required, Validators.maxLength(100)]],
      last_name: ['', [Validators.required, Validators.maxLength(100)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
      phone_number: ['', [Validators.required, Validators.pattern(/^\d{9,15}$/)]],
      id_number: ['', [Validators.required, Validators.maxLength(50)]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: passwordsMatchValidator });

    if (this.applicantAuth.isLoggedIn()) {
      this.router.navigate(['/applicant/dashboard']);
    }
  }

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    const { confirmPassword, ...raw } = this.registerForm.value;
    const payload = {
      ...raw,
      first_name: raw.first_name.trim(),
      last_name: raw.last_name.trim(),
      email: raw.email.trim(),
      id_number: raw.id_number.trim()
    };

    this.applicantAuth.register(payload).subscribe({
      next: session => {
        this.isLoading = false;
        this.toastService.showSuccess('Account Created', `Welcome, ${session.applicant.first_name}! Please complete your profile.`);
        this.router.navigate(['/applicant/profile-setup']);
      },
      error: err => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Registration failed. Please try again.';
      }
    });
  }

  invalid(name: string): boolean {
    const ctrl = this.registerForm.get(name);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }

  get passwordMismatch(): boolean {
    return !!this.registerForm.errors?.['passwordMismatch'] && !!this.registerForm.get('confirmPassword')?.touched;
  }
}
