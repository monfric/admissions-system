import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { RegSideBarComponent } from '../shared/components/registration/reg-side-bar/reg-side-bar.component';
import { RegHeaderComponent } from '../shared/components/registration/reg-header/reg-header.component';
import { FooterComponent } from '../shared/components/footer/footer.component';

/** Shell for every logged-in staff page (same layout as the LMIS Registration module). */
@Component({
  selector: 'app-staff-layout',
  standalone: true,
  imports: [RouterModule, RegSideBarComponent, RegHeaderComponent, FooterComponent],
  template: `
    <app-reg-side-bar></app-reg-side-bar>
    <app-reg-header></app-reg-header>
    <router-outlet></router-outlet>
    <app-footer></app-footer>
  `
})
export class StaffLayoutComponent {}
