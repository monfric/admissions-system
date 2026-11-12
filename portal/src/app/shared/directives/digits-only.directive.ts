import { Directive, HostListener, Optional, Self } from '@angular/core';
import { NgControl, Validators } from '@angular/forms';

/** Validator for fields that may contain digits only (phone numbers, contacts). */
export const DIGITS_ONLY = Validators.pattern(/^\d*$/);

/**
 * Keeps an input to digits only: anything else typed or pasted is removed
 * as it's entered. Pair it with the DIGITS_ONLY validator so values loaded
 * from the server (e.g. "+254…") are still flagged.
 *
 *   <input type="tel" appDigitsOnly formControlName="phone_number">
 */
@Directive({
  selector: 'input[appDigitsOnly]',
  standalone: true,
  host: { inputmode: 'numeric' }
})
export class DigitsOnlyDirective {
  constructor(@Optional() @Self() private control: NgControl) {}

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '');
    if (digits === input.value) return;
    input.value = digits;
    this.control?.control?.setValue(digits);
  }
}
