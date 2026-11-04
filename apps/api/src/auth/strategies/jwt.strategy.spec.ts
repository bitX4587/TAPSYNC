/**
 * Unit tests for JwtStrategy.validate()
 *
 * Strategy: instantiate JwtStrategy with a mock AppConfigService so no real
 * Passport wiring is required. We only test the `validate()` method directly,
 * which is the only custom logic in the strategy.
 *
 * Covers:
 *  - Returns `{ userId, publicId }` from a valid access token payload  (Req 1.2, 1.11)
 *  - Throws UnauthorizedException when `type !== 'access'`  (Req 10.4)
 */

import { UnauthorizedException } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service.js';
import { AccessTokenPayload } from '../auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal AppConfigService mock — only jwtAccessSecret is read by the strategy. */
function makeMockConfig(): AppConfigService {
  return {
    jwtAccessSecret: 'test-access-secret',
  } as unknown as AppConfigService;
}

function makeStrategy(): JwtStrategy {
  return new JwtStrategy(makeMockConfig());
}

/** Build a payload, accepting any string for `type` so invalid-type tests compile cleanly. */
function makeAccessPayload(overrides: Partial<{ sub: string; publicId: string; type: string }> = {}): AccessTokenPayload {
  return {
    sub: '507f1f77bcf86cd799439011',
    publicId: 'abc2345678',
    type: 'access',
    ...overrides,
  } as AccessTokenPayload;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = makeStrategy();
  });

  // ── validate() – happy path ─────────────────────────────────────────────

  describe('validate()', () => {
    it('returns { userId, publicId } from a valid access token payload', () => {
      const payload = makeAccessPayload();

      const result = strategy.validate(payload);

      expect(result).toEqual({
        userId: '507f1f77bcf86cd799439011',
        publicId: 'abc2345678',
      });
    });

    it('maps payload.sub to userId', () => {
      const payload = makeAccessPayload({ sub: 'aabbccddeeff001122334455' });

      const result = strategy.validate(payload);

      expect(result.userId).toBe('aabbccddeeff001122334455');
    });

    it('maps payload.publicId to publicId', () => {
      const payload = makeAccessPayload({ publicId: 'xyz9876543' });

      const result = strategy.validate(payload);

      expect(result.publicId).toBe('xyz9876543');
    });

    // ── type guard ──────────────────────────────────────────────────────

    it('throws UnauthorizedException when type is "refresh"', () => {
      const payload = makeAccessPayload({ type: 'refresh' });

      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when type is an empty string', () => {
      const payload = makeAccessPayload({ type: '' });

      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when type is undefined', () => {
      // Cast needed because exactOptionalPropertyTypes prevents passing undefined directly
      const payload = { sub: '507f1f77bcf86cd799439011', publicId: 'abc2345678' } as AccessTokenPayload;

      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when type is an unrecognised string', () => {
      const payload = makeAccessPayload({ type: 'unknown' });

      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it('does NOT throw for a valid access token with type "access"', () => {
      const payload = makeAccessPayload({ type: 'access' });

      expect(() => strategy.validate(payload)).not.toThrow();
    });
  });
});
