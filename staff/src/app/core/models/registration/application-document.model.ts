export type ApplicationDocumentType = 'provisional' | 'admission';
export type ApplicationDocumentStatus = 'active' | 'inactive';

export interface ApplicationDocument {
  id: number;
  document_name: string;
  intake_id: number;
  intake_name: string;
  programme_id: number;
  programme_name: string;
  programme_code: string;
  type: ApplicationDocumentType;
  file_name: string;
  file_size: number;
  mime_type: string;
  status: ApplicationDocumentStatus;
  created_at: string;
  updated_at: string;
}

export interface ApplicationDocumentRequest {
  document_name: string;
  intake_id: number;
  programme_id: number;
  type: ApplicationDocumentType;
  status: ApplicationDocumentStatus;
}

export interface ApplicationDocumentResponse {
  success: boolean;
  message: string;
  data: ApplicationDocument;
}

export interface PaginatedApplicationDocuments {
  data: ApplicationDocument[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ApplicationDocumentListResponse {
  success: boolean;
  message: string;
  data: PaginatedApplicationDocuments;
}

/** Counts for the cards on the staff Application Documents page. */
export interface ApplicationDocumentStats {
  documents: number;
  provisional_documents: number;
  admission_documents: number;
  /** Active programmes in open intakes. */
  running_programmes: number;
  provisional_covered: number;
  admission_covered: number;
  provisional_missing: number;
  admission_missing: number;
}
