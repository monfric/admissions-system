import { FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';

/**
 * Denomination and disability rules shared by the staff New Applicants dialog
 * and the applicant portal profile form.
 *
 * Both forms use these controls:
 *  - denomination        Catholic / Protestant / Other (required)
 *  - denomination_other  the denomination typed in when "Other" is chosen
 *  - has_disability      toggle
 *  - disability_details  required while has_disability is on
 *
 * The API stores a single `denomination` string: "Catholic", "Protestant",
 * or the typed denomination itself.
 */
export const DENOMINATION_OPTIONS = ['Catholic', 'Protestant', 'Other'];

/** Form values for a stored denomination; anything not listed shows as "Other". */
export function splitDenomination(value: string | null | undefined): { denomination: string; denomination_other: string } {
  const v = (value ?? '').trim();
  if (!v) return { denomination: '', denomination_other: '' };
  if (v === 'Catholic' || v === 'Protestant') return { denomination: v, denomination_other: '' };
  return { denomination: 'Other', denomination_other: v === 'Other' ? '' : v };
}

/** The denomination to save from the form's choice and "Other" text. */
export function joinDenomination(choice: string, other: string): string {
  return choice === 'Other' ? (other ?? '').trim() : (choice ?? '');
}

/**
 * Makes "Specify denomination" required only while "Other" is chosen, and
 * "Specify disability" required only while "Has disability" is on — clearing
 * each when it no longer applies. Returns the subscription to unsubscribe.
 */
export function applyBackgroundRules(form: FormGroup): Subscription {
  const subs = new Subscription();
  const other = form.get('denomination_other')!;
  const details = form.get('disability_details')!;

  const syncDenomination = (choice: string) => {
    if (choice === 'Other') {
      other.setValidators([Validators.required, Validators.maxLength(100)]);
    } else {
      other.clearValidators();
      if (other.value) other.setValue('', { emitEvent: false });
    }
    other.updateValueAndValidity({ emitEvent: false });
  };

  const syncDisability = (has: boolean) => {
    if (has) {
      details.setValidators([Validators.required, Validators.maxLength(255)]);
    } else {
      details.clearValidators();
      if (details.value) details.setValue('', { emitEvent: false });
    }
    details.updateValueAndValidity({ emitEvent: false });
  };

  syncDenomination(form.get('denomination')!.value);
  syncDisability(!!form.get('has_disability')!.value);
  subs.add(form.get('denomination')!.valueChanges.subscribe(syncDenomination));
  subs.add(form.get('has_disability')!.valueChanges.subscribe(v => syncDisability(!!v)));
  return subs;
}
