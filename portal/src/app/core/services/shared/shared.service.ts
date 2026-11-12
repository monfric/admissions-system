import { Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { Observable, Subject } from 'rxjs';
import CryptoJS from 'crypto-js';

@Injectable({
  providedIn: 'root'
})
export class SharedService {

  private subject = new Subject<any>();

  encryptSecretKey = environment.encryptSecretKey;
 
  constructor() { }
  
  sendClickEvent() {
    this.subject.next(0)
  }
  
  getClickEvent(): Observable<any>{ 
    return this.subject.asObservable();
  }

  // URL-safe encryption
  encryptData(data: any): string {
    const encrypted = CryptoJS.AES.encrypt(
      JSON.stringify(data), 
      this.encryptSecretKey
    ).toString();
    
    // Convert to URL-safe format
    return this.makeUrlSafe(encrypted);
  }

  //  URL-safe decryption
  decryptData(data: string): any {
    try {
      // Convert from URL-safe format back to standard Base64
      const standardBase64 = this.fromUrlSafe(data);
      
      const bytes = CryptoJS.AES.decrypt(standardBase64, this.encryptSecretKey);
      
      if (bytes.toString()) {
        return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
      }
      
      return data;
    } catch (e) {
      console.error('Decryption error:', e);
      return null;
    }
  }

  // Convert Base64 to URL-safe format
  private makeUrlSafe(base64: string): string {
    return base64
      .replace(/\+/g, '-')  // Replace + with -
      .replace(/\//g, '_')  // Replace / with _
      .replace(/=/g, '');   // Remove = padding
  }

  //  Convert URL-safe format back to Base64
  private fromUrlSafe(urlSafe: string): string {
    let base64 = urlSafe
      .replace(/-/g, '+')  // Replace - with +
      .replace(/_/g, '/'); // Replace _ with /
    
    // Add back = padding
    const padding = (4 - (base64.length % 4)) % 4;
    base64 += '='.repeat(padding);
    
    return base64;
  }
}
