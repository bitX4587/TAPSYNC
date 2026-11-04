/**
 * Tests for the network-save service (link-handling flow).
 *
 * Covers:
 * - Public ID format validation — Requirement 12.1
 * - Custom name format validation — Requirement 2.8
 * - Custom-name-to-publicId resolution (current + retired + 404) — Requirement 13.1
 * - POST /network save call with correct DTO — Requirement 12.1
 *
 * Requirements: 12.1, 12.4, 13.1
 */

import {
  validatePublicId,
  validateCustomName,
  resolveCustomNameToPublicId,
  saveNetworkContactFromLink,
  isApiErrorWithStatus,
} from './network-save';
import { api, ApiError } from '../../lib/api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    statusCode: number;
    code?: string;
    constructor(message: string, statusCode: number, code?: string) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));

// ---------------------------------------------------------------------------
// validatePublicId — Requirement 12.1
// ---------------------------------------------------------------------------

describe('validatePublicId', () => {
  it('accepts a valid 10-character Public ID from the allowed alphabet', () => {
    expect(validatePublicId('abcdefghjk')).toBeNull();
    expect(validatePublicId('23456789ab')).toBeNull();
    expect(validatePublicId('mnpxyz2345')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(validatePublicId('')).toBe('No Public ID provided.');
  });

  it('rejects a string that is too short', () => {
    expect(validatePublicId('abc')).toMatch(/invalid Public ID/i);
  });

  it('rejects a string that is too long', () => {
    expect(validatePublicId('abcdefghjka')).toMatch(/invalid Public ID/i);
  });

  it('rejects characters outside the alphabet (0, o, l, i)', () => {
    expect(validatePublicId('abcdefghi0')).toMatch(/invalid Public ID/i); // 'i' and '0'
    expect(validatePublicId('abcdefgol0')).toMatch(/invalid Public ID/i); // 'o', 'l', '0'
  });

  it('rejects uppercase letters', () => {
    expect(validatePublicId('ABCDEFGHJK')).toMatch(/invalid Public ID/i);
  });
});

// ---------------------------------------------------------------------------
// validateCustomName — Requirement 2.8
// ---------------------------------------------------------------------------

describe('validateCustomName', () => {
  it('accepts a valid custom name (3–30 chars, lowercase, digits, _ and -)', () => {
    expect(validateCustomName('jane')).toBeNull();
    expect(validateCustomName('jane_doe')).toBeNull();
    expect(validateCustomName('jane-doe')).toBeNull();
    expect(validateCustomName('jane123')).toBeNull();
    expect(validateCustomName('abc')).toBeNull(); // min length
    expect(validateCustomName('a'.repeat(30))).toBeNull(); // max length
  });

  it('rejects an empty string', () => {
    expect(validateCustomName('')).toBe('No custom name provided.');
  });

  it('rejects a name shorter than 3 characters', () => {
    expect(validateCustomName('ab')).toMatch(/3–30 characters/);
  });

  it('rejects a name longer than 30 characters', () => {
    expect(validateCustomName('a'.repeat(31))).toMatch(/3–30 characters/);
  });

  it('rejects uppercase letters', () => {
    expect(validateCustomName('Jane')).toMatch(/lowercase letters, numbers, _ and -/);
  });

  it('rejects spaces and special characters', () => {
    expect(validateCustomName('jane doe')).toMatch(/lowercase letters, numbers, _ and -/);
    expect(validateCustomName('jane@doe')).toMatch(/lowercase letters, numbers, _ and -/);
  });
});

// ---------------------------------------------------------------------------
// resolveCustomNameToPublicId — Requirement 13.1
// ---------------------------------------------------------------------------

describe('resolveCustomNameToPublicId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the publicId from the profile when the name is current', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      profile: { publicId: 'abcdefghjk' },
    });

    const publicId = await resolveCustomNameToPublicId('janedoe');
    expect(publicId).toBe('abcdefghjk');
  });

  it('extracts the publicId from the redirectTo path when the name is retired', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      redirectTo: '/c/xyz2345678',
    });

    const publicId = await resolveCustomNameToPublicId('oldname');
    expect(publicId).toBe('xyz2345678');
  });

  it('calls the public profiles endpoint with withAuth disabled', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      profile: { publicId: 'abcdefghjk' },
    });

    await resolveCustomNameToPublicId('janedoe');

    expect(api.get).toHaveBeenCalledWith(
      '/public/profiles/p/janedoe',
      { withAuth: false },
    );
  });

  it('URL-encodes the custom name', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      profile: { publicId: 'abcdefghjk' },
    });

    await resolveCustomNameToPublicId('jane_doe');

    expect(api.get).toHaveBeenCalledWith(
      '/public/profiles/p/jane_doe',
      { withAuth: false },
    );
  });

  it('throws an ApiError when the name does not exist (404 propagates)', async () => {
    const notFoundError = new ApiError('Profile not found', 404, 'NOT_FOUND');
    (api.get as jest.Mock).mockRejectedValue(notFoundError);

    await expect(resolveCustomNameToPublicId('nonexistent')).rejects.toThrow(
      'Profile not found',
    );
  });
});

// ---------------------------------------------------------------------------
// saveNetworkContactFromLink — Requirement 12.1
// ---------------------------------------------------------------------------

describe('saveNetworkContactFromLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls POST /network with source: "link" and an ISO timestamp', async () => {
    const mockContact = { id: 'contact-1', publicId: 'abcdefghjk' };
    (api.post as jest.Mock).mockResolvedValue(mockContact);

    const before = Date.now();
    const result = await saveNetworkContactFromLink('abcdefghjk');
    const after = Date.now();

    expect(api.post).toHaveBeenCalledTimes(1);
    const [endpoint, dto] = (api.post as jest.Mock).mock.calls[0];
    expect(endpoint).toBe('/network');
    expect(dto.publicId).toBe('abcdefghjk');
    expect(dto.source).toBe('link');
    // tappedAt should be a valid ISO string within the test window
    const tappedAtMs = new Date(dto.tappedAt).getTime();
    expect(tappedAtMs).toBeGreaterThanOrEqual(before);
    expect(tappedAtMs).toBeLessThanOrEqual(after);
    expect(result).toEqual(mockContact);
  });

  it('propagates a 404 when the profile does not exist', async () => {
    const notFoundError = new ApiError('Profile not found', 404, 'NOT_FOUND');
    (api.post as jest.Mock).mockRejectedValue(notFoundError);

    await expect(saveNetworkContactFromLink('unknown000')).rejects.toThrow(
      'Profile not found',
    );
  });

  it('propagates a 403 when the server detects an own-profile save', async () => {
    const forbiddenError = new ApiError('Cannot save your own profile', 403, 'FORBIDDEN');
    (api.post as jest.Mock).mockRejectedValue(forbiddenError);

    await expect(saveNetworkContactFromLink('abcdefghjk')).rejects.toThrow(
      'Cannot save your own profile',
    );
  });
});

// ---------------------------------------------------------------------------
// isApiErrorWithStatus
// ---------------------------------------------------------------------------

describe('isApiErrorWithStatus', () => {
  it('returns true for an ApiError with the matching status code', () => {
    const error = new ApiError('Not found', 404, 'NOT_FOUND');
    expect(isApiErrorWithStatus(error, 404)).toBe(true);
  });

  it('returns false for an ApiError with a different status code', () => {
    const error = new ApiError('Forbidden', 403, 'FORBIDDEN');
    expect(isApiErrorWithStatus(error, 404)).toBe(false);
  });

  it('returns false for a generic Error', () => {
    expect(isApiErrorWithStatus(new Error('something'), 404)).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isApiErrorWithStatus(null, 404)).toBe(false);
    expect(isApiErrorWithStatus(undefined, 404)).toBe(false);
  });
});
