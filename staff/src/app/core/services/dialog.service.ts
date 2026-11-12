import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog/confirm-dialog.component';


@Injectable({
  providedIn: 'root'
})
export class DialogService {
  constructor(private dialog: MatDialog) {}

  /**
   * Open a confirmation dialog
   */
  confirm(data: ConfirmDialogData): Observable<boolean> {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: data
    });

    return dialogRef.afterClosed();
  }

  /**
   * Confirm delete action
   */
  confirmDelete(itemName: string, itemType: string = 'item'): Observable<boolean> {
    return this.confirm({
      title: `Delete ${itemType}`,
      message: `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
  }

  /**
   * Confirm activate/deactivate action
   */
  confirmStatusChange(itemName: string, isActivating: boolean): Observable<boolean> {
    const action = isActivating ? 'activate' : 'deactivate';
    const actionTitle = isActivating ? 'Activate' : 'Deactivate';
    
    return this.confirm({
      title: `${actionTitle} Item`,
      message: `Are you sure you want to ${action} "${itemName}"?`,
      confirmText: actionTitle,
      cancelText: 'Cancel',
      type: isActivating ? 'primary' : 'warn'
    });
  }

  /**
   * Show success message
   */
  success(title: string, message: string): Observable<boolean> {
    return this.confirm({
      title: title,
      message: message,
      confirmText: 'OK',
      type: 'success',
      showCancelButton: false
    });
  }

  /**
   * Show info message
   */
  info(title: string, message: string): Observable<boolean> {
    return this.confirm({
      title: title,
      message: message,
      confirmText: 'OK',
      type: 'info',
      showCancelButton: false
    });
  }

  /**
   * Show warning message
   */
  warning(title: string, message: string): Observable<boolean> {
    return this.confirm({
      title: title,
      message: message,
      confirmText: 'I Understand',
      cancelText: 'Cancel',
      type: 'warn'
    });
  }
}