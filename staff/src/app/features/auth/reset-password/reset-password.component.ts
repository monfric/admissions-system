import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ToastService } from '../../../core/services/toast/toast.service';

/** Opened from the emailed link (?token=…): choose a new password. */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './reset-password.component.html',
  // Same look as the login page.
  styleUrl: '../login/login.component.scss'
})
export class ResetPasswordComponent implements OnInit {
  form!: FormGroup;
  token = '';
  isLoading = false;
  errorMessage = '';
  showPassword = false;
  showConfirmPassword = false;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.form = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
      confirmPassword: ['', [Validators.required]]
    });
  }

  get password() { return this.form.get('password'); }

  get passwordMismatch(): boolean {
    const confirm = this.form.get('confirmPassword');
    return !!confirm?.touched && confirm.value !== this.password?.value;
  }

  onSubmit(): void {
    if (this.form.invalid || this.form.value.password !== this.form.value.confirmPassword) {
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    this.errorMessage = '';
    this.authService.resetPassword(this.token, this.form.value.password).subscribe({
      next: res => {
        this.isLoading = false;
        this.toastService.showSuccess('Password changed', res.message);
        this.router.navigate(['/login']);
      },
      error: err => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Could not change your password. Please try again.';
      }
    });
  }
}
