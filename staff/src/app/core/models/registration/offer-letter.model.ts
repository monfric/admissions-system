export type OfferLetterType = 'provisional' | 'admission';
export type OfferLetterStatus = 'active' | 'inactive';

export interface OfferLetter {
  id: number;
  intake_programme_id: number;
  intake_id: number;
  intake_name: string;
  programme_id: number;
  programme_name: string;
  programme_code: string;
  type: OfferLetterType | string;
  body: string;
  status: OfferLetterStatus | string;
  created_at: string;
  updated_at: string;
}

export interface CreateOfferLetterRequest {
  intake_programme_id: number;
  type: OfferLetterType;
  body: string;
  status?: OfferLetterStatus;
}

export type UpdateOfferLetterRequest = Partial<CreateOfferLetterRequest>;

export interface OfferLetterResponse {
  success: boolean;
  message: string;
  data: OfferLetter;
}

export interface PaginatedOfferLetters {
  data: OfferLetter[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface OfferLetterListResponse {
  success: boolean;
  message: string;
  data: PaginatedOfferLetters;
}
