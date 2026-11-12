import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export interface DocumentViewerData {
  fileUrl?: string;
  /** Pre-fetched blob (e.g. from a POST-generated report) — used instead of fetching fileUrl. */
  blob?: Blob;
  fileType: 'image' | 'pdf';
  title: string;
  /** Optional filename override for the download action. */
  fileName?: string;
}

@Component({
  selector: 'app-document-viewer-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="document-viewer-dialog">
      <!-- Dialog Header -->
      <div class="dialog-header">
        <div class="header-content">
          <mat-icon class="header-icon">{{ getHeaderIcon() }}</mat-icon>
          <h2 mat-dialog-title>{{ data.title }}</h2>
        </div>
        <button mat-icon-button (click)="close()" class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <!-- Dialog Content -->
      <mat-dialog-content>
        <!-- Loading State -->
        <div *ngIf="loading" class="loading-container">
          <mat-spinner diameter="50"></mat-spinner>
          <p>Loading document...</p>
        </div>

        <!-- Error State -->
        <div *ngIf="error && !loading" class="error-container">
          <mat-icon class="error-icon">error_outline</mat-icon>
          <h3>Failed to load document</h3>
          <p>{{ error }}</p>
          <button mat-raised-button color="primary" (click)="retry()">
            <mat-icon>refresh</mat-icon>
            Retry
          </button>
        </div>

        <!-- Image Viewer -->
        <div *ngIf="!loading && !error && data.fileType === 'image'" class="image-viewer">
          <img [src]="documentUrl" 
               alt="{{ data.title }}"
               (error)="onLoadError()"
               (load)="onLoadSuccess()">
        </div>

        <!-- PDF Viewer -->
        <div *ngIf="!loading && !error && data.fileType === 'pdf'" class="pdf-viewer">
          <iframe [src]="documentUrl" 
                  frameborder="0"
                  (error)="onLoadError()"
                  (load)="onLoadSuccess()">
          </iframe>
        </div>
      </mat-dialog-content>

      <!-- Dialog Actions -->
      <mat-dialog-actions>
        <button mat-stroked-button (click)="download()" *ngIf="!loading && !error">
          <mat-icon>download</mat-icon>
          Download
        </button>
        <button mat-raised-button color="primary" (click)="close()">
          <mat-icon>close</mat-icon>
          Close
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .document-viewer-dialog {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;

      .header-content {
        display: flex;
        align-items: center;
        gap: 12px;

        .header-icon {
          font-size: 28px;
          width: 28px;
          height: 28px;
        }

        h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
        }
      }

      .close-btn {
        color: white;
      }
    }

    ::ng-deep .mat-mdc-dialog-content {
      flex: 1;
      padding: 0 !important;
      margin: 0 !important;
      overflow: hidden !important;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #f5f5f5;
    }

    .loading-container,
    .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      text-align: center;

      p {
        margin-top: 16px;
        color: #6c757d;
      }
    }

    .error-container {
      .error-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        color: #dc3545;
        margin-bottom: 16px;
      }

      h3 {
        color: #495057;
        margin: 0 0 8px 0;
      }

      button {
        margin-top: 16px;
      }
    }

    .image-viewer {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;

      img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border-radius: 4px;
      }
    }

    .pdf-viewer {
      width: 100%;
      height: 100%;

      iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
    }

    ::ng-deep .mat-mdc-dialog-actions {
      padding: 16px 24px;
      margin: 0;
      border-top: 1px solid #e9ecef;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
  `]
})
export class DocumentViewerDialogComponent implements OnInit {
  loading = true;
  error: string | null = null;
  documentUrl: SafeResourceUrl | null = null;
  private blob: Blob | null = null;

  constructor(
    public dialogRef: MatDialogRef<DocumentViewerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DocumentViewerData,
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.loadDocument();
  }

  loadDocument(): void {
    this.loading = true;
    this.error = null;

    // Already-fetched blob (e.g. a POST-generated PDF) — no request needed
    if (this.data.blob) {
      this.setBlob(this.data.blob);
      return;
    }

    if (!this.data.fileUrl) {
      this.error = 'No document available.';
      this.loading = false;
      return;
    }

    // Fetch document with authentication
    this.http.get(this.data.fileUrl, {
      responseType: 'blob',
      // Authentication headers will be added automatically by HTTP interceptor
    }).subscribe({
      next: (blob) => this.setBlob(blob),
      error: (error) => {
        console.error('Error loading document:', error);
        this.error = error.error?.message || 'Failed to load document. Please try again.';
        this.loading = false;
      }
    });
  }

  private setBlob(blob: Blob): void {
    this.blob = blob;
    const objectUrl = URL.createObjectURL(blob);
    this.documentUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl);
    this.loading = false;
  }

  onLoadSuccess(): void {
    this.loading = false;
  }

  onLoadError(): void {
    this.error = 'Failed to display document';
    this.loading = false;
  }

  retry(): void {
    this.loadDocument();
  }

  download(): void {
    if (!this.blob) return;

    const url = window.URL.createObjectURL(this.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = this.getFileName();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  private getFileName(): string {
    if (this.data.fileName) return this.data.fileName;
    const extension = this.data.fileType === 'pdf' ? 'pdf' : 'jpg';
    const title = this.data.title.toLowerCase().replace(/\s+/g, '_');
    return `${title}.${extension}`;
  }

  getHeaderIcon(): string {
    return this.data.fileType === 'pdf' ? 'picture_as_pdf' : 'image';
  }

  close(): void {
    // Clean up object URL
    if (this.documentUrl) {
      const url = this.sanitizer.sanitize(4, this.documentUrl); // SecurityContext.RESOURCE_URL = 4
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
    this.dialogRef.close();
  }
}