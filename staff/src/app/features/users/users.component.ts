import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { AuthService, StaffUser } from '../../core/services/auth/auth.service';
import { StaffUserStats, UserService } from '../../core/services/user.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog/confirm-dialog.component';
import { UserDialogComponent } from './user-dialog/user-dialog.component';

/** Staff Users (admins only): add, edit, activate/deactivate and delete staff accounts. */
@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule, PaginationComponent],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss'
})
export class UsersComponent implements OnInit {
  users: StaffUser[] = [];
  loading = false;
  stats: StaffUserStats | null = null;

  searchTerm = '';
  statusFilter: 'all' | 'active' | 'inactive' = 'all';
  page = 1;
  pageSize = 20;
  pageSizeOptions = [10, 20, 50, 100];
  totalItems = 0;
  totalPages = 0;
  openMenuId: number | null = null;

  constructor(
    private userService: UserService,
    private authService: AuthService,
    private dialog: MatDialog,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.loadUsers();
    this.loadStats();
  }

  get currentUserId(): number | undefined {
    return this.authService.currentUser?.id;
  }

  get statCards(): { label: string; value: number | string; subtext: string; icon: string; color: string }[] {
    const s = this.stats;
    return [
      { label: 'Staff Users', value: s ? s.total : '—', subtext: s ? `${s.active} active · ${s.inactive} inactive` : 'Loading…',
        icon: 'fas fa-users', color: 'primary' },
      { label: 'Administrators', value: s ? s.admins : '—', subtext: 'Can manage staff users',
        icon: 'fas fa-user-shield', color: 'success' }
    ];
  }

  loadStats(): void {
    this.userService.getStats().subscribe({
      next: res => this.stats = res.data,
      error: err => console.error('Failed to load statistics:', err)
    });
  }

  loadUsers(): void {
    this.loading = true;
    const active = this.statusFilter === 'all' ? undefined : this.statusFilter === 'active';
    this.userService.getAll(this.page, this.pageSize, this.searchTerm || undefined, active).subscribe({
      next: res => {
        this.loading = false;
        this.users = res.data.data;
        this.totalItems = res.data.total_items;
        this.totalPages = res.data.total_pages;
      },
      error: () => {
        this.loading = false;
        this.toast.showError('Error', 'Failed to load staff users.');
      }
    });
  }

  setStatusFilter(filter: 'all' | 'active' | 'inactive'): void {
    this.statusFilter = filter;
    this.page = 1;
    this.loadUsers();
  }

  onSearch(): void {
    this.page = 1;
    this.loadUsers();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.onSearch();
  }

  onPageChange(page: number): void {
    this.page = page;
    this.loadUsers();
  }

  changePageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
    this.loadUsers();
  }

  private refresh(): void {
    this.loadUsers();
    this.loadStats();
  }

  // ── Row actions ────────────────────────────────────────────

  @HostListener('document:click')
  closeMenus(): void {
    this.openMenuId = null;
  }

  toggleMenu(id: number, event: MouseEvent): void {
    event.stopPropagation();
    this.openMenuId = this.openMenuId === id ? null : id;
  }

  addUser(): void {
    this.openDialog();
  }

  editUser(user: StaffUser): void {
    this.openMenuId = null;
    this.openDialog(user);
  }

  private openDialog(user?: StaffUser): void {
    this.dialog.open(UserDialogComponent, { width: '560px', maxWidth: '95vw', data: { user } })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.toast.showSuccess('Success', user ? 'Staff user updated.' : 'Staff user added.');
        this.refresh();
      });
  }

  toggleActive(user: StaffUser): void {
    this.openMenuId = null;
    this.userService.setActive(user.id, !user.is_active).subscribe({
      next: () => {
        this.toast.showSuccess('Success', user.is_active ? 'Staff user deactivated.' : 'Staff user activated.');
        this.refresh();
      },
      error: err => this.toast.showError('Error', err.error?.message || 'Failed to update staff user.')
    });
  }

  confirmDelete(user: StaffUser): void {
    this.openMenuId = null;
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Delete Staff User',
        message: `Are you sure you want to delete ${user.full_name}'s account? They will no longer be able to log in.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        type: 'danger'
      }
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.userService.delete(user.id).subscribe({
        next: () => {
          this.toast.showSuccess('Success', 'Staff user deleted.');
          if (this.users.length === 1 && this.page > 1) this.page--;
          this.refresh();
        },
        error: err => this.toast.showError('Error', err.error?.message || 'Failed to delete staff user.')
      });
    });
  }
}
