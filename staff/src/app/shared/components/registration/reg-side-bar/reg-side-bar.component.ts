import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AuthService, StaffUser } from '../../../../core/services/auth/auth.service';
import { ChangePasswordDialogComponent } from '../../../../features/auth/change-password-dialog/change-password-dialog.component';

/** NMTC staff sidebar: Applications, Academic Structure, Staff Users (admins) and the user's own account. */
@Component({
  selector: 'app-reg-side-bar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatDialogModule],
  templateUrl: './reg-side-bar.component.html',
  styleUrl: './reg-side-bar.component.scss'
})
export class RegSideBarComponent {
  menuStates: { [key: string]: boolean } = {
    applications: true,
    academic: false
  };

  constructor(private authService: AuthService, private dialog: MatDialog) {}

  get user(): StaffUser | null {
    return this.authService.currentUser;
  }

  get isAdmin(): boolean {
    return this.authService.isAdmin;
  }

  toggleMenu(menu: string): void {
    this.menuStates[menu] = !this.menuStates[menu];
  }

  changePassword(): void {
    this.dialog.open(ChangePasswordDialogComponent, { width: '460px', maxWidth: '95vw' });
  }

  logout(): void {
    this.authService.logout();
  }
}
