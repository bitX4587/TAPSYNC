import { Injectable } from '@nestjs/common';
import { PublicProfileDto } from '../dto/public-profile.dto.js';

// ---------------------------------------------------------------------------
// vCard Builder Service
//
// Generates vCard 3.0 format with proper RFC 2426 escaping.
// Handles name, organization, title, phone, email, URL and photo.
// Excludes fields the Owner marked as hidden (Requirement 6.2).
//
// Requirements: 6.1–6.5, 10.7
// ---------------------------------------------------------------------------

@Injectable()
export class VCardService {
  /**
   * Generate a vCard 3.0 string from a public profile.
   * Uses the placeholder "TapSync user" when no name is set (Requirement 2.3).
   *
   * @param profile - The public profile DTO
   * @param profileUrl - The canonical profile URL (https://tapsync.app/c/{publicId})
   * @returns vCard 3.0 formatted string
   */
  generateVCard(profile: PublicProfileDto, profileUrl: string): string {
    const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];

    // Full Name (required in vCard spec; use placeholder if blank)
    // Requirement 2.3, 6.4
    const displayName = profile.fullName || 'TapSync user';
    lines.push(`FN:${this.escape(displayName)}`);

    // Structured Name (N property; required in vCard 3.0)
    // Format: Family;Given;Middle;Prefix;Suffix
    // For simplicity, treat fullName as Given name
    lines.push(`N:;${this.escape(displayName)};;;`);

    // Organization and Title
    if (profile.company) {
      lines.push(`ORG:${this.escape(profile.company)}`);
    }
    if (profile.designation) {
      lines.push(`TITLE:${this.escape(profile.designation)}`);
    }

    // Phone (filtered by hiddenFields at the service layer before reaching here)
    // Requirement 6.2
    if (profile.contact.phone) {
      lines.push(`TEL;TYPE=WORK,VOICE:${this.escape(profile.contact.phone)}`);
    }

    // Email (filtered by hiddenFields)
    if (profile.contact.email) {
      lines.push(`EMAIL;TYPE=INTERNET:${this.escape(profile.contact.email)}`);
    }

    // Profile URL (canonical /c/{publicId})
    // Requirement 6.2, 6.4
    lines.push(`URL:${this.escape(profileUrl)}`);

    // Photo (avatar URL)
    // vCard 3.0 supports both VALUE=URL and inline base64.
    // Using VALUE=URL for simplicity; the phone will fetch the CDN image.
    if (profile.avatarUrl) {
      lines.push(`PHOTO;VALUE=URL:${this.escape(profile.avatarUrl)}`);
    }

    // Revision timestamp (optional but useful)
    lines.push(`REV:${new Date().toISOString()}`);

    lines.push('END:VCARD');

    return lines.join('\r\n') + '\r\n';
  }

  /**
   * Escape special characters for vCard 3.0 (RFC 2426).
   * - Backslash, comma, semicolon, newline must be escaped with backslash.
   * - Unicode is supported; no encoding transformation needed for UTF-8.
   *
   * Requirement 6.5 — proper escaping for commas, semicolons, newlines, non-ASCII.
   */
  private escape(value: string): string {
    return value
      .replace(/\\/g, '\\\\') // backslash first
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, ''); // strip carriage returns; \n is sufficient
  }

  /**
   * Generate a safe filename for the vCard download.
   * Uses the profile's name or publicId, sanitized for filesystem safety.
   *
   * @param profile - The public profile DTO
   * @returns Filename like "John_Doe.vcf" or "publicId.vcf"
   */
  getVCardFilename(profile: PublicProfileDto): string {
    const baseName = profile.fullName || profile.publicId;
    // Replace unsafe characters with underscores
    const safeName = baseName
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_{2,}/g, '_') // collapse multiple underscores
      .substring(0, 50); // limit length
    return `${safeName}.vcf`;
  }
}
