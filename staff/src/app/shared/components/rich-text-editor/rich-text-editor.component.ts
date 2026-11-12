import { Component, ElementRef, HostListener, Input, ViewChild, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

type FormatCommand = 'bold' | 'italic' | 'underline' | 'superscript' | 'insertOrderedList' | 'insertUnorderedList';

/**
 * A small formatting editor for letter bodies: bold, italic, underline,
 * superscript (e.g. 8th) and numbered/bulleted lists. It stores simple HTML
 * (p, strong/b, em/i, u, sup, ol/ul/li) — the same subset the letter PDF
 * renders. Pasted text is inserted as plain text so formatting from other
 * documents doesn't come along.
 */
@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rich-text-editor.component.html',
  styleUrls: ['./rich-text-editor.component.scss'],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RichTextEditorComponent), multi: true }]
})
export class RichTextEditorComponent implements ControlValueAccessor {
  @Input() placeholder = '';
  @Input() invalid = false;
  @ViewChild('editable', { static: true }) editable!: ElementRef<HTMLDivElement>;

  disabled = false;
  empty = true;
  active: Partial<Record<FormatCommand, boolean>> = {};

  readonly tools: { command: FormatCommand; icon: string; title: string }[] = [
    { command: 'bold',                icon: 'fa-bold',        title: 'Bold' },
    { command: 'italic',              icon: 'fa-italic',      title: 'Italic' },
    { command: 'underline',           icon: 'fa-underline',   title: 'Underline' },
    { command: 'superscript',         icon: 'fa-superscript', title: 'Superscript (e.g. 8th)' },
    { command: 'insertOrderedList',   icon: 'fa-list-ol',     title: 'Numbered list (i, ii, iii)' },
    { command: 'insertUnorderedList', icon: 'fa-list-ul',     title: 'Bulleted list' }
  ];

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.editable.nativeElement.innerHTML = this.toHtml(value ?? '');
    this.updateEmpty();
  }

  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
  }

  format(command: FormatCommand): void {
    if (this.disabled) return;
    this.editable.nativeElement.focus();
    document.execCommand(command, false);
    this.emit();
  }

  onInput(): void {
    this.emit();
  }

  onBlur(): void {
    this.onTouched();
  }

  onFocus(): void {
    // New lines become <p> paragraphs rather than <div>s.
    document.execCommand('defaultParagraphSeparator', false, 'p');
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  }

  @HostListener('document:selectionchange')
  updateActive(): void {
    const selection = document.getSelection();
    if (!selection || !this.editable.nativeElement.contains(selection.anchorNode)) {
      this.active = {};
      return;
    }
    const active: Partial<Record<FormatCommand, boolean>> = {};
    for (const tool of this.tools) {
      active[tool.command] = document.queryCommandState(tool.command);
    }
    this.active = active;
  }

  private emit(): void {
    this.updateEmpty();
    this.onChange(this.empty ? '' : this.editable.nativeElement.innerHTML);
  }

  private updateEmpty(): void {
    this.empty = (this.editable.nativeElement.textContent ?? '').trim() === '';
  }

  /** Letters saved before the editor existed are plain text: one paragraph per line. */
  private toHtml(value: string): string {
    if (!value || /<[a-z][\s\S]*>/i.test(value)) return value;
    return value
      .split(/\r?\n/)
      .filter(line => line.trim() !== '')
      .map(line => `<p>${this.escape(line)}</p>`)
      .join('');
  }

  private escape(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
