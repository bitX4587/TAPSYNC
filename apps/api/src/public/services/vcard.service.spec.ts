import { Test, TestingModule } from '@nestjs/testing';
import { PublicProfileDto } from '../dto/public-profile.dto.js';
import { VCardService } from './vcard.service.js';

// ---------------------------------------------------------------------------
// vCard Service Unit Tests
//
// Tests vCard 3.0 generation with proper escaping, photo support,
// and handling of empty/blank profiles.
//
// Requirements: 6.1–6.5, 10.7
// ---------------------------------------------------------------------------

describe('VCardService', () => {
  let service: VCardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VCardService],
    }).compile();

    service = module.get<VCardService>(VCardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateVCard', () => {
    it('should generate a valid vCard with all fields', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'John Doe',
        designation: 'Software Engineer',
        company: 'Acme Corp',
        bio: 'Building great software',
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
        contact: {
          phone: '+1234567890',
          email: 'john@example.com',
        },
        mode: 'work',
        links: [],
      };

      const vcard = service.generateVCard(profile, 'https://tapsync.app/c/abc123');

      expect(vcard).toContain('BEGIN:VCARD');
      expect(vcard).toContain('VERSION:3.0');
      expect(vcard).toContain('FN:John Doe');
      expect(vcard).toContain('N:;John Doe;;;');
      expect(vcard).toContain('ORG:Acme Corp');
      expect(vcard).toContain('TITLE:Software Engineer');
      expect(vcard).toContain('TEL;TYPE=WORK,VOICE:+1234567890');
      expect(vcard).toContain('EMAIL;TYPE=INTERNET:john@example.com');
      expect(vcard).toContain('URL:https://tapsync.app/c/abc123');
      expect(vcard).toContain('PHOTO;VALUE=URL:https://cdn.example.com/avatar.jpg');
      expect(vcard).toContain('REV:');
      expect(vcard).toContain('END:VCARD');
      expect(vcard).toMatch(/\r\n/); // CRLF line endings
    });

    it('should use placeholder name when fullName is blank (Requirement 2.3, 6.4)', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        contact: {},
        mode: 'work',
        links: [],
      };

      const vcard = service.generateVCard(profile, 'https://tapsync.app/c/abc123');

      expect(vcard).toContain('FN:TapSync user');
      expect(vcard).toContain('N:;TapSync user;;;');
      expect(vcard).toContain('URL:https://tapsync.app/c/abc123');
    });

    it('should handle empty contact fields (Requirement 6.4)', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'Jane Smith',
        contact: {}, // No phone or email
        mode: 'casual',
        links: [],
      };

      const vcard = service.generateVCard(profile, 'https://tapsync.app/c/abc123');

      expect(vcard).not.toContain('TEL');
      expect(vcard).not.toContain('EMAIL');
      expect(vcard).toContain('FN:Jane Smith');
      expect(vcard).toContain('URL:https://tapsync.app/c/abc123');
    });

    it('should escape commas (Requirement 6.5)', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'Doe, John',
        company: 'Smith, Jones & Associates',
        contact: {},
        mode: 'work',
        links: [],
      };

      const vcard = service.generateVCard(profile, 'https://tapsync.app/c/abc123');

      expect(vcard).toContain('FN:Doe\\, John');
      expect(vcard).toContain('N:;Doe\\, John;;;');
      expect(vcard).toContain('ORG:Smith\\, Jones & Associates');
    });

    it('should escape semicolons (Requirement 6.5)', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'John;Doe',
        designation: 'Engineer;Developer',
        contact: {},
        mode: 'work',
        links: [],
      };

      const vcard = service.generateVCard(profile, 'https://tapsync.app/c/abc123');

      expect(vcard).toContain('FN:John\\;Doe');
      expect(vcard).toContain('TITLE:Engineer\\;Developer');
    });

    it('should escape newlines (Requirement 6.5)', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'John\nDoe',
        designation: 'Software\nEngineer',
        contact: {},
        mode: 'work',
        links: [],
      };

      const vcard = service.generateVCard(profile, 'https://tapsync.app/c/abc123');

      expect(vcard).toContain('FN:John\\nDoe');
      expect(vcard).toContain('TITLE:Software\\nEngineer');
    });

    it('should escape backslashes (Requirement 6.5)', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'John\\Doe',
        company: 'C:\\Program Files',
        contact: {},
        mode: 'work',
        links: [],
      };

      const vcard = service.generateVCard(profile, 'https://tapsync.app/c/abc123');

      expect(vcard).toContain('FN:John\\\\Doe');
      expect(vcard).toContain('ORG:C:\\\\Program Files');
    });

    it('should handle unicode characters (Requirement 6.5)', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'José García',
        designation: 'Développeur',
        company: '株式会社',
        contact: {
          email: 'josé@example.com',
        },
        mode: 'work',
        links: [],
      };

      const vcard = service.generateVCard(profile, 'https://tapsync.app/c/abc123');

      // Unicode should pass through unescaped
      expect(vcard).toContain('FN:José García');
      expect(vcard).toContain('TITLE:Développeur');
      expect(vcard).toContain('ORG:株式会社');
      expect(vcard).toContain('EMAIL;TYPE=INTERNET:josé@example.com');
    });

    it('should handle mixed special characters', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'Doe, John; Jr.',
        company: 'Smith\\Jones, Inc.\nHeadquarters',
        designation: 'CEO; Founder',
        contact: {
          phone: '+1 (555) 123-4567',
        },
        mode: 'work',
        links: [],
      };

      const vcard = service.generateVCard(profile, 'https://tapsync.app/c/abc123');

      expect(vcard).toContain('FN:Doe\\, John\\; Jr.');
      expect(vcard).toContain('ORG:Smith\\\\Jones\\, Inc.\\nHeadquarters');
      expect(vcard).toContain('TITLE:CEO\\; Founder');
      expect(vcard).toContain('TEL;TYPE=WORK,VOICE:+1 (555) 123-4567');
    });

    it('should omit optional fields when not present', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'John Doe',
        contact: {},
        mode: 'work',
        links: [],
      };

      const vcard = service.generateVCard(profile, 'https://tapsync.app/c/abc123');

      expect(vcard).not.toContain('ORG:');
      expect(vcard).not.toContain('TITLE:');
      expect(vcard).not.toContain('TEL');
      expect(vcard).not.toContain('EMAIL');
      expect(vcard).not.toContain('PHOTO');
    });

    it('should include photo when avatarUrl is present', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'John Doe',
        avatarUrl: 'https://cdn.example.com/avatars/john.jpg',
        contact: {},
        mode: 'work',
        links: [],
      };

      const vcard = service.generateVCard(profile, 'https://tapsync.app/c/abc123');

      expect(vcard).toContain('PHOTO;VALUE=URL:https://cdn.example.com/avatars/john.jpg');
    });

    it('should use CRLF line endings per vCard spec', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'John Doe',
        contact: {},
        mode: 'work',
        links: [],
      };

      const vcard = service.generateVCard(profile, 'https://tapsync.app/c/abc123');

      // Check that all line breaks are CRLF
      expect(vcard).toMatch(/\r\n/);
      expect(vcard).not.toMatch(/(?<!\r)\n/); // No LF without CR
    });
  });

  describe('getVCardFilename', () => {
    it('should generate filename from fullName', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'John Doe',
        contact: {},
        mode: 'work',
        links: [],
      };

      const filename = service.getVCardFilename(profile);
      expect(filename).toBe('John_Doe.vcf');
    });

    it('should use publicId when fullName is blank', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        contact: {},
        mode: 'work',
        links: [],
      };

      const filename = service.getVCardFilename(profile);
      expect(filename).toBe('abc123.vcf');
    });

    it('should sanitize special characters', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'John@Doe#Jr!',
        contact: {},
        mode: 'work',
        links: [],
      };

      const filename = service.getVCardFilename(profile);
      expect(filename).toBe('John_Doe_Jr_.vcf');
    });

    it('should collapse multiple underscores', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'John   Doe',
        contact: {},
        mode: 'work',
        links: [],
      };

      const filename = service.getVCardFilename(profile);
      expect(filename).toBe('John_Doe.vcf');
    });

    it('should limit filename length', () => {
      const profile: PublicProfileDto = {
        publicId: 'abc123',
        fullName: 'A'.repeat(100),
        contact: {},
        mode: 'work',
        links: [],
      };

      const filename = service.getVCardFilename(profile);
      expect(filename.length).toBeLessThanOrEqual(54); // 50 chars + ".vcf"
    });
  });
});
