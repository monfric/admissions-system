import { Component, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartOptions } from 'chart.js';

import { DashboardService } from '../../core/services/dashboard/dashboard.service';
import { DashboardActivity, DashboardStats, DecisionSlice } from '../../core/models/dashboard.model';

interface StatCard {
  label: string;
  value: number | string;
  subtext: string;
  icon: string;
  color: string;
  link?: string;
}

// Categorical series colours, always used in this order (validated for
// colour-blind separation). Text stays in the page's own ink colours.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const GRID = '#eef0f2';
const TICK = '#6b7280';

const DECISION_LABELS: Record<DecisionSlice, string> = {
  awaiting_payment: 'Awaiting payment',
  awaiting_decision: 'Awaiting decision',
  notified: 'Notified',
  approved: 'Approved',
  rejected: 'Rejected',
  recalled: 'Recalled'
};

/** Staff landing page: figures and charts across the whole Applications module. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, BaseChartDirective],
  providers: [DecimalPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {

  stats: DashboardStats | null = null;
  loading = false;
  /** 0 = all intakes. */
  intakeId = 0;

  statCards: StatCard[];

  // Chart data, rebuilt whenever the stats load.
  decisionChart: ChartData<'doughnut'> = { labels: [], datasets: [] };
  trendChart: ChartData<'line'> = { labels: [], datasets: [] };
  feesChart: ChartData<'bar'> = { labels: [], datasets: [] };
  programmeChart: ChartData<'bar'> = { labels: [], datasets: [] };
  levelChart: ChartData<'bar'> = { labels: [], datasets: [] };
  facultyChart: ChartData<'bar'> = { labels: [], datasets: [] };
  genderChart: ChartData<'doughnut'> = { labels: [], datasets: [] };
  residenceChart: ChartData<'doughnut'> = { labels: [], datasets: [] };
  countyChart: ChartData<'bar'> = { labels: [], datasets: [] };

  readonly donutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, padding: 14 } } }
  };

  readonly trendOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12 } } },
    // Monotone curves never dip below zero between points.
    elements: { line: { borderWidth: 2, cubicInterpolationMode: 'monotone' }, point: { radius: 0, hoverRadius: 5, hitRadius: 12 } },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK, maxTicksLimit: 8 } },
      y: { beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { color: TICK, precision: 0 } }
    }
  };

  readonly feesOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => 'KES ' + this.decimal.transform(ctx.parsed.y, '1.0-0') } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK } },
      y: {
        beginAtZero: true, grid: { color: GRID }, border: { display: false },
        ticks: { color: TICK, callback: v => this.decimal.transform(Number(v), '1.0-0') }
      }
    }
  };

  readonly groupedBarOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12 } } },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK } },
      y: { beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { color: TICK, precision: 0 } }
    }
  };

  /** Horizontal bars; stacked when there's more than one series. */
  readonly stackedRowOptions: ChartOptions<'bar'> = this.rowOptions(true);
  readonly rowBarOptions: ChartOptions<'bar'> = this.rowOptions(false);

  constructor(private dashboardService: DashboardService, private decimal: DecimalPipe) {
    // Built here rather than as a field initializer, which would run before decimal is set.
    this.statCards = this.buildCards(null);
  }

  ngOnInit(): void {
    this.loadStats();
  }

  loadStats(): void {
    this.loading = true;
    this.dashboardService.getStats(this.intakeId).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) this.applyStats(res.data);
        else console.error('Failed to load dashboard:', res.message);
      },
      error: err => {
        this.loading = false;
        console.error('Failed to load dashboard:', err);
      }
    });
  }

  onIntakeChange(): void {
    this.loadStats();
  }

  /** Width (% of Applied) and conversion from the previous stage, for the pipeline bars. */
  get pipeline(): { stage: string; count: number; width: number; conversion: number | null }[] {
    const stages = this.stats?.pipeline ?? [];
    const top = stages[0]?.count || 0;
    return stages.map((s, i) => ({
      ...s,
      width: top ? Math.max((s.count / top) * 100, s.count ? 2 : 0) : 0,
      conversion: i === 0 ? null : this.percent(s.count, stages[i - 1].count)
    }));
  }

  /** Each post-admission step as a share of active admissions. */
  get postAdmission(): { label: string; done: number; total: number; percent: number; icon: string; link: string }[] {
    const p = this.stats?.post_admission;
    if (!p) return [];
    return [
      { label: 'Admission letter available for their programme', done: p.with_offer_letter, icon: 'fas fa-envelope-open-text', link: '/offer-letter' },
      { label: 'Admission documents uploaded for their programme', done: p.with_documents, icon: 'fas fa-file-pdf', link: '/application-documents' },
      { label: 'Uniform measurements submitted', done: p.uniform_submitted, icon: 'fas fa-tshirt', link: '/uniform-measurements' }
    ].map(step => ({ ...step, total: p.admitted, percent: this.percent(step.done, p.admitted) ?? 0 }));
  }

  get selectedIntakeLabel(): string {
    return this.stats?.intakes.find(i => i.id === this.intakeId)?.label ?? 'All intakes';
  }

  /** Charts with nothing to draw show a "No data yet" note instead. */
  hasData(chart: ChartData): boolean {
    return chart.datasets.some(d => (d.data as number[]).some(v => Number(v) > 0));
  }

  activityIcon(type: DashboardActivity['type']): string {
    return { application: 'fas fa-file-alt bg-info', payment: 'fas fa-money-bill-wave bg-success', admission: 'fas fa-user-graduate bg-primary' }[type];
  }

  activityLabel(type: DashboardActivity['type']): string {
    return { application: 'New application', payment: 'Payment received', admission: 'Admitted' }[type];
  }

  daysBadge(days: number): string {
    if (days <= 0) return 'badge-danger';
    if (days <= 3) return 'badge-warning';
    return 'badge-info';
  }

  private applyStats(s: DashboardStats): void {
    this.stats = s;
    this.statCards = this.buildCards(s);

    const decision = s.decision_status;
    this.decisionChart = {
      labels: decision.map(d => DECISION_LABELS[d.status]),
      datasets: [{ data: decision.map(d => d.count), backgroundColor: SERIES, borderColor: '#fff', borderWidth: 2, hoverOffset: 6 }]
    };

    this.trendChart = {
      labels: s.trend.map(t => this.shortDate(t.date)),
      datasets: [
        this.line('Applications', s.trend.map(t => t.applications), SERIES[0]),
        this.line('Payments', s.trend.map(t => t.payments), SERIES[1])
      ]
    };

    this.feesChart = {
      labels: s.fees_by_month.map(m => this.shortMonth(m.month)),
      datasets: [this.bar('Fees collected (KES)', s.fees_by_month.map(m => m.amount), SERIES[0])]
    };

    this.programmeChart = {
      labels: s.programmes.map(p => p.code || p.name),
      datasets: [
        this.bar('1st choice', s.programmes.map(p => p.first_choice), SERIES[0]),
        this.bar('2nd choice', s.programmes.map(p => p.other_choice), SERIES[1])
      ]
    };

    this.levelChart = {
      labels: s.training_levels.map(l => l.name),
      datasets: [
        this.bar('Applied', s.training_levels.map(l => l.applied), SERIES[0]),
        this.bar('Paid', s.training_levels.map(l => l.paid), SERIES[1]),
        this.bar('Approved', s.training_levels.map(l => l.approved), SERIES[2])
      ]
    };

    this.facultyChart = {
      labels: s.faculties.map(f => f.name),
      datasets: [this.bar('1st-choice applications', s.faculties.map(f => f.count), SERIES[0])]
    };

    const g = s.demographics.gender;
    const genderSlices = [['Male', g.male], ['Female', g.female], ['Other', g.other]] as [string, number][];
    // "Other" only appears when someone has it, so the slices never repaint.
    const shownGender = genderSlices.filter(([label, n]) => label !== 'Other' || n > 0);
    this.genderChart = {
      labels: shownGender.map(([label]) => label),
      datasets: [{ data: shownGender.map(([, n]) => n), backgroundColor: SERIES.slice(0, shownGender.length), borderColor: '#fff', borderWidth: 2, hoverOffset: 6 }]
    };

    const r = s.demographics.residence;
    this.residenceChart = {
      labels: ['Boarders', 'Day scholars'],
      datasets: [{ data: [r.boarders, r.day_scholars], backgroundColor: SERIES.slice(0, 2), borderColor: '#fff', borderWidth: 2, hoverOffset: 6 }]
    };

    this.countyChart = {
      labels: s.demographics.counties.map(c => c.county),
      datasets: [this.bar('Applicants', s.demographics.counties.map(c => c.count), SERIES[0])]
    };
  }

  /** The cards above the charts; values show "—" until the figures arrive (or if they fail to load). */
  private buildCards(s: DashboardStats | null): StatCard[] {
    const c = s?.cards;
    const a = c?.applications;
    const n = (v: number | undefined) => (v === undefined ? '—' : this.decimal.transform(v, '1.0-0') ?? '0');
    const loading = 'Loading…';
    return [
      { label: 'Registered Applicants', value: n(c?.applicants.total), icon: 'fas fa-users', color: 'primary', link: '/new-applicants',
        subtext: c ? `+${c.applicants.today} today · +${c.applicants.this_month} this month` : loading },
      { label: 'Applications Submitted', value: n(a?.total), icon: 'fas fa-file-alt', color: 'info',
        subtext: c ? `${c.applicants.not_yet_applied} applicant(s) not yet applied` : loading },
      { label: 'Unpaid Applications', value: n(a?.unpaid), icon: 'fas fa-hourglass-half', color: 'warning', link: '/unpaid-applications',
        subtext: c ? 'Awaiting application fee' : loading },
      { label: 'Paid Applications', value: n(a?.paid), icon: 'fas fa-check-circle', color: 'success', link: '/paid-applications',
        subtext: a ? `+${a.paid_today} paid today` : loading },
      { label: 'Fees Collected', value: c ? 'KES ' + n(c.fees.total) : '—', icon: 'fas fa-money-bill-wave', color: 'teal',
        subtext: c ? `KES ${n(c.fees.this_month)} this month` : loading },
      { label: 'Awaiting Decision', value: n(a?.pending_decision), icon: 'fas fa-gavel', color: 'orange', link: '/paid-applications',
        subtext: c ? 'Paid, not yet notified · needs action' : loading },
      { label: 'Notified', value: n(a?.notified), icon: 'fas fa-bell', color: 'purple', link: '/notified-applications',
        subtext: c ? `${a!.expiring_soon} expiring within ${c.expiring_within_days} days` : loading },
      { label: 'Admitted', value: n(c?.admitted.total), icon: 'fas fa-user-graduate', color: 'indigo', link: '/approved-applications',
        subtext: c ? `+${c.admitted.this_month} this month · ${this.percent(c.admitted.total, a!.paid) ?? 0}% of paid` : loading }
    ];
  }

  private rowOptions(stacked: boolean): ChartOptions<'bar'> {
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: stacked, position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12 } },
        tooltip: { callbacks: { title: items => this.fullLabel(items[0].label, items[0].dataIndex) } }
      },
      scales: {
        x: { stacked, beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { color: TICK, precision: 0 } },
        y: { stacked, grid: { display: false }, ticks: { color: TICK } }
      }
    };
  }

  /** Programme bars are labelled by code; the tooltip shows the full name. */
  private fullLabel(label: string, index: number): string {
    const programme = this.stats?.programmes[index];
    return programme && (programme.code || programme.name) === label
      ? `${programme.name} (${programme.training_level})`
      : label;
  }

  private bar(label: string, data: number[], color: string): ChartConfiguration<'bar'>['data']['datasets'][number] {
    return { label, data, backgroundColor: color, hoverBackgroundColor: color, borderRadius: 4, maxBarThickness: 28, borderColor: '#fff', borderWidth: 1 };
  }

  private line(label: string, data: number[], color: string): ChartConfiguration<'line'>['data']['datasets'][number] {
    return { label, data, borderColor: color, backgroundColor: color, pointBackgroundColor: color, fill: false };
  }

  /** Whole-number percentage of a part, or null when the whole is 0. */
  private percent(part: number, whole: number): number | null {
    return whole ? Math.round((part / whole) * 100) : null;
  }

  /** "2026-11-03" → "3 Nov" */
  private shortDate(iso: string): string {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  /** "2026-11" → "Nov 26" */
  private shortMonth(ym: string): string {
    return new Date(ym + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  }
}
