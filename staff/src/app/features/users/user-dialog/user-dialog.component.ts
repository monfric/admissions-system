import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { StaffUser } from '../../../core/services/auth/auth.service';
import { StaffUserRequest, UserService } from '../../../core/services/user.service';
import { DigitsOnlyDirective, DIGITS_ONLY } from '../../../shared/directives/digits-only.directive';

export interface UserDialogData {
  /** The user to edit; omitted to add a new one. */
  user?: StaffUser;
}

/** Add or edit a staff user. The password is required for new users and optional when editing. */
@Component({
  selector: 'app-user-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, DigitsOnlyDirective],
  templateUrl: './user-dialog.component.html',
  styleUrls: ['./user-dialog.component.scss']
})
export class UserDialogComponent {
  form: FormGroup;
  submitting = false;
  errorMessage = '';
  readonly isEdit: boolean;

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    public dialogRef: MatDialogRef<UserDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: UserDialogData
  ) {
    const u = data.user;
    this.isEdit = !!u;
    this.form = this.fb.group({
      first_name:   [u?.first_name ?? '', [Validators.required, Validators.maxLength(100)]],
      last_name:    [u?.last_name ?? '', [Validators.required, Validators.maxLength(100)]],
      email:        [u?.email ?? '', [Validators.required, Validators.email, Validators.maxLength(100)]],
      phone_number: [u?.phone_number ?? '', [Validators.maxLength(20), DIGITS_ONLY]],
      password:     ['', this.isEdit ? [Validators.minLength(8), Validators.maxLength(72)] : [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
      role:         [u?.role ?? 'staff'],
      is_active:    [u?.is_active ?? true]
    });
  }

  get isAdminRole(): boolean {
    return this.form.get('role')?.value === 'admin';
  }

  toggleRole(): void {
    this.form.patchValue({ role: this.isAdminRole ? 'staff' : 'admin' });
  }

  toggleActive(): void {
    this.form.patchValue({ is_active: !this.form.get('is_active')?.value });
  }

  fieldError(name: string): string {
    const ctrl = this.form.get(name);
    if (!ctrl || !ctrl.touched || !ctrl.errors) return '';
    if (ctrl.errors['required']) return 'This field is required';
    if (ctrl.errors['email']) return 'Enter a valid email address';
    if (ctrl.errors['minlength']) return `At least ${ctrl.errors['minlength'].requiredLength} characters`;
    if (ctrl.errors['maxlength']) return `At most ${ctrl.errors['maxlength'].requiredLength} characters`;
    if (ctrl.errors['digitsOnly']) return 'Numbers only';
    return 'Invalid value';
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.value;
    const req: StaffUserRequest = {
      first_name: value.first_name.trim(),
      last_name: value.last_name.trim(),
      email: value.email.trim(),
      phone_number: value.phone_number.trim(),
      role: value.role,
      is_active: value.is_active
    };
    if (value.password) req.password = value.password;

    this.submitting = true;
    this.errorMessage = '';
    const call = this.isEdit ? this.userService.update(this.data.user!.id, req) : this.userService.create(req);
    call.subscribe({
      next: res => {
        this.submitting = false;
        this.dialogRef.close(res.data);
      },
      error: err => {
        this.submitting = false;
        this.errorMessage = err.error?.message || 'Failed to save user.';
      }
    });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
