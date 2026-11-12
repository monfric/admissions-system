import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ToastService } from '../../../core/services/toast/toast.service';

/** The logged-in user changes their own password. */
@Component({
  selector: 'app-change-password-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './change-password-dialog.component.html',
  styleUrls: ['./change-password-dialog.component.scss']
})
export class ChangePasswordDialogComponent {
  form: FormGroup;
  submitting = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<ChangePasswordDialogComponent>,
    private authService: AuthService,
    private toast: ToastService
  ) {
    this.form = this.fb.group({
      old_password: ['', Validators.required],
      new_password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
      confirm_password: ['', Validators.required]
    }, { validators: ChangePasswordDialogComponent.passwordsMatch });
  }

  private static passwordsMatch(group: AbstractControl): ValidationErrors | null {
    return group.get('new_password')?.value === group.get('confirm_password')?.value ? null : { mismatch: true };
  }

  fieldError(name: string): string {
    const ctrl = this.form.get(name);
    if (!ctrl || !ctrl.touched) return '';
    if (ctrl.errors?.['required']) return 'This field is required';
    if (ctrl.errors?.['minlength']) return 'At least 8 characters';
    if (ctrl.errors?.['maxlength']) return 'At most 72 characters';
    if (name === 'confirm_password' && this.form.errors?.['mismatch']) return 'Passwords do not match';
    return '';
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.submitting = true;
    this.errorMessage = '';
    const { old_password, new_password } = this.form.value;
    this.authService.changePassword(old_password, new_password).subscribe({
      next: () => {
        this.submitting = false;
        this.toast.showSuccess('Password changed', 'Use your new password next time you log in.');
        this.dialogRef.close(true);
      },
      error: err => {
        this.submitting = false;
        this.errorMessage = err.error?.message || 'Failed to change password.';
      }
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
