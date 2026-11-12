import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'primary' | 'warn' | 'danger' | 'success' | 'info';
  icon?: string;
  showCancelButton?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss']
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) {
    // Set default values
    this.data.confirmText = this.data.confirmText || 'Confirm';
    this.data.cancelText = this.data.cancelText || 'Cancel';
    this.data.type = this.data.type || 'primary';
    this.data.showCancelButton = this.data.showCancelButton !== false; // default true
  }

  /**
   * Get icon based on dialog type
   */
  get dialogIcon(): string {
    if (this.data.icon) {
      return this.data.icon;
    }

    switch (this.data.type) {
      case 'danger':
        return 'warning';
      case 'warn':
        return 'error_outline';
      case 'success':
        return 'check_circle';
      case 'info':
        return 'info';
      default:
        return 'help_outline';
    }
  }

  /**
   * Get icon color class based on type
   */
  get iconColorClass(): string {
    switch (this.data.type) {
      case 'danger':
        return 'text-danger';
      case 'warn':
        return 'text-warning';
      case 'success':
        return 'text-success';
      case 'info':
        return 'text-info';
      default:
        return 'text-primary';
    }
  }

  /**
   * Get confirm button color
   */
  get confirmButtonColor(): 'primary' | 'accent' | 'warn' {
    switch (this.data.type) {
      case 'danger':
      case 'warn':
        return 'warn';
      default:
        return 'primary';
    }
  }

  /**
   * Handle confirm action
   */
  onConfirm(): void {
    this.dialogRef.close(true);
  }

  /**
   * Handle cancel action
   */
  onCancel(): void {
    this.dialogRef.close(false);
  }
}