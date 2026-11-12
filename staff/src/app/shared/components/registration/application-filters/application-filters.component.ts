import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ApplicationListFilters } from '../../../../core/services/registration/application-batch.service';
import { IntakeService } from '../../../../core/services/registration/intake.service';
import { IntakeProgrammeService } from '../../../../core/services/registration/intake-programme.service';
import { ProgrammeService } from '../../../../core/services/programme/programme.service';
import { TrainingLevelService } from '../../../../core/services/training-level/training-level.service';
import { Intake } from '../../../../core/models/registration/intake.model';
import { Programme } from '../../../../core/models/academics/programme.model';
import { TrainingLevel } from '../../../../core/models/academics/training-level.model';
import { GENDER_OPTIONS, RESIDENCE_OPTIONS } from '../../../../core/models/academics/student.model';

/**
 * Dropdown filters for the staff application list pages: Intake, Training
 * Level, Programme (either choice), Gender and a date filter — Date Applied,
 * or Date Paid where payment timing matters (`dateFilter="paid"`). Emits the
 * current filters whenever one changes; the page reloads its list with them.
 * The Programme list narrows to the chosen intake and training level.
 */
@Component({
  selector: 'app-application-filters',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './application-filters.component.html',
  styleUrls: ['./application-filters.component.scss']
})
export class ApplicationFiltersComponent implements OnInit {
  /**
   * The last filter: Date Applied, Date Paid, or Days Remaining (days left to
   * respond, for notified applications).
   */
  @Input() dateFilter: 'applied' | 'paid' | 'days_remaining' | 'admitted' | 'none' = 'applied';
  /** 'notified' / 'recalled': Programme matches only that programme (default: either choice). */
  @Input() programmeMatch: 'any' | 'notified' | 'recalled' = 'any';
  /** Overrides the Programme filter's label (e.g. "Programme Admitted"). */
  @Input() programmeLabel = '';
  /** Adds an Active / Inactive Status filter (admissions list). */
  @Input() showStatus = false;
  /** Shows the Gender filter (off for lists that aren't about people, e.g. offer letters). */
  @Input() showGender = true;
  /** Adds a Residence (Boarder / Day Scholar) filter (application and admission lists). */
  @Input() showResidence = false;
  /** Adds a Provisional / Admission type filter (offer letters, application documents). */
  @Input() showLetterType = false;
  /** Label for that type filter. */
  @Input() letterTypeLabel = 'Letter Type';
  /** Adds a Measurements (Submitted / Pending / Unlocked) filter (uniform measurements list). */
  @Input() showMeasurement = false;
  @Output() filtersChange = new EventEmitter<ApplicationListFilters>();

  intakeId: number | null = null;
  trainingLevelId: number | null = null;
  programmeId: number | null = null;
  gender = '';
  applied = '';
  status = '';
  letterType = '';
  residence = '';
  measurement = '';

  intakes: Intake[] = [];
  trainingLevels: TrainingLevel[] = [];
  private allProgrammes: Programme[] = [];
  /** Programme IDs offered in the chosen intake; null when no intake is chosen. */
  private intakeProgrammeIds: Set<number> | null = null;

  readonly genders = GENDER_OPTIONS;
  readonly residenceOptions = RESIDENCE_OPTIONS;
  private readonly periodOptions = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    { value: '30days', label: 'Last 30 days' }
  ];
  private readonly daysRemainingOptions = [
    { value: 'last_day', label: 'Last day' },
    { value: 'le3', label: '3 days or fewer' },
    { value: 'le7', label: '7 days or fewer' },
    { value: 'le10', label: '10 days or fewer' },
    { value: 'gt10', label: 'More than 10 days' }
  ];

  get lastFilterLabel(): string {
    return { applied: 'Date Applied', paid: 'Date Paid', days_remaining: 'Days Remaining', admitted: 'Date Admitted', none: '' }[this.dateFilter];
  }

  get lastFilterAllLabel(): string {
    return this.dateFilter === 'days_remaining' ? 'All' : 'Any time';
  }

  get lastFilterOptions(): { value: string; label: string }[] {
    return this.dateFilter === 'days_remaining' ? this.daysRemainingOptions : this.periodOptions;
  }

  constructor(
    private intakeService: IntakeService,
    private intakeProgrammeService: IntakeProgrammeService,
    private programmeService: ProgrammeService,
    private trainingLevelService: TrainingLevelService
  ) {}

  ngOnInit(): void {
    this.intakeService.getIntakes(1, 100).subscribe({
      next: res => { if (res.success) this.intakes = res.data.data; },
      error: () => {}
    });
    this.trainingLevelService.getAllTrainingLevels().subscribe({
      next: res => { if (res.success) this.trainingLevels = asList<TrainingLevel>(res.data); },
      error: () => {}
    });
    this.programmeService.getAllProgrammes().subscribe({
      next: res => { if (res.success) this.allProgrammes = asList<Programme>(res.data); },
      error: () => {}
    });
  }

  /** Programmes to offer, narrowed by the chosen intake and training level. */
  get programmes(): Programme[] {
    return this.allProgrammes.filter(p =>
      (!this.trainingLevelId || p.training_level_id === this.trainingLevelId) &&
      (!this.intakeProgrammeIds || this.intakeProgrammeIds.has(p.id)));
  }

  get hasActiveFilters(): boolean {
    return !!(this.intakeId || this.trainingLevelId || this.programmeId || this.gender || this.applied || this.status || this.letterType || this.residence || this.measurement);
  }

  onIntakeChange(): void {
    this.intakeProgrammeIds = null;
    if (!this.intakeId) {
      this.onChange();
      return;
    }
    this.intakeProgrammeService.getByIntake(this.intakeId).subscribe({
      next: res => {
        if (res.success) this.intakeProgrammeIds = new Set(res.data.map(ip => ip.programme_id));
        this.onChange();
      },
      error: () => this.onChange()
    });
  }

  onChange(): void {
    // Drop a programme that's no longer offered under the chosen intake/level.
    if (this.programmeId && !this.programmes.some(p => p.id === this.programmeId)) {
      this.programmeId = null;
    }
    this.filtersChange.emit({
      intakeId: this.intakeId ?? undefined,
      trainingLevelId: this.trainingLevelId ?? undefined,
      programmeId: this.programmeId ?? undefined,
      programmeMatch: this.programmeMatch === 'any' ? undefined : this.programmeMatch,
      gender: this.gender || undefined,
      ...(this.dateFilter === 'none' ? {} : {
        [this.dateFilter === 'days_remaining' ? 'daysRemaining' : this.dateFilter]: this.applied || undefined
      }),
      status: this.status || undefined,
      letterType: this.letterType || undefined,
      residence: this.residence || undefined,
      measurement: this.measurement || undefined
    });
  }

  clear(): void {
    this.intakeId = null;
    this.trainingLevelId = null;
    this.programmeId = null;
    this.gender = '';
    this.applied = '';
    this.status = '';
    this.letterType = '';
    this.residence = '';
    this.measurement = '';
    this.intakeProgrammeIds = null;
    this.onChange();
  }
}

/** The list endpoints return either an array or a paginated { data: [] } object. */
function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const inner = (data as { data?: unknown } | null)?.data;
  return Array.isArray(inner) ? (inner as T[]) : [];
}
