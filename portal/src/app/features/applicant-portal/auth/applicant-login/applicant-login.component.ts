import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApplicantAuthService } from '../../../../core/services/applicant-portal/applicant-auth.service';
import { ToastService } from '../../../../core/services/toast/toast.service';

@Component({
  selector: 'app-applicant-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './applicant-login.component.html',
  styleUrl: './applicant-login.component.scss'
})
export class ApplicantLoginComponent implements OnInit {

  loginForm!: FormGroup;
  errorMessage = '';
  isLoading = false;
  /** Password field shows its text while true (eye button). */
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private applicantAuth: ApplicantAuthService,
    private router: Router,
    private route: ActivatedRoute,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });

    // Already logged in as an applicant — skip the form.
    if (this.applicantAuth.isLoggedIn()) {
      this.router.navigate(['/applicant/dashboard']);
    }
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    const { email, password } = this.loginForm.value;

    this.applicantAuth.login(email, password).subscribe({
      next: session => {
        this.isLoading = false;
        this.toastService.showSuccess('Login Successful', `Welcome back, ${session.applicant.first_name}!`);

        // Only follow returnUrl within the applicant portal.
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        if (session.applicant.profile_complete && returnUrl?.startsWith('/applicant/')) {
          this.router.navigateByUrl(returnUrl);
        } else {
          this.router.navigate([session.applicant.profile_complete ? '/applicant/dashboard' : '/applicant/profile-setup']);
        }
      },
      error: err => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Login failed. Please try again.';
      }
    });
  }

  get email() { return this.loginForm.get('email'); }
  get password() { return this.loginForm.get('password'); }
}
