import 'reflect-metadata';
import { validate, EnvironmentVariables, NodeEnv } from './env.validation.js';

/**
 * Minimal set of all required environment variables.
 * Tests that need to exercise missing/invalid values should omit or override
 * individual keys from this object.
 */
const VALID_ENV: Record<string, unknown> = {
  MONGODB_URI: 'mongodb://localhost:27017/tapsync',
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  GOOGLE_CLIENT_ID: 'google-client-id',
  REVALIDATION_SECRET: 'revalidation-secret',
  STORAGE_BUCKET: 'my-bucket',
  STORAGE_KEY_ID: 'key-id',
  STORAGE_SECRET: 'secret-value',
};

describe('validate()', () => {
  describe('with a complete, valid environment', () => {
    it('returns a validated EnvironmentVariables instance', () => {
      const result = validate({ ...VALID_ENV });
      expect(result).toBeInstanceOf(EnvironmentVariables);
    });

    it('applies default values for optional variables', () => {
      const result = validate({ ...VALID_ENV });
      expect(result.NODE_ENV).toBe(NodeEnv.Development);
      expect(result.PORT).toBe(3001);
      expect(result.JWT_ACCESS_EXPIRES_IN).toBe('15m');
      expect(result.JWT_REFRESH_EXPIRES_IN).toBe('365d');
      expect(result.NEXT_PUBLIC_URL).toBe('http://localhost:3000');
      expect(result.STORAGE_REGION).toBe('us-east-1');
    });

    it('accepts overridden optional values', () => {
      const result = validate({
        ...VALID_ENV,
        NODE_ENV: 'production',
        PORT: '8080',
        JWT_ACCESS_EXPIRES_IN: '5m',
        STORAGE_REGION: 'ap-southeast-1',
        STORAGE_CDN_URL: 'https://cdn.example.com',
      });
      expect(result.NODE_ENV).toBe(NodeEnv.Production);
      expect(result.PORT).toBe(8080);
      expect(result.JWT_ACCESS_EXPIRES_IN).toBe('5m');
      expect(result.STORAGE_REGION).toBe('ap-southeast-1');
      expect(result.STORAGE_CDN_URL).toBe('https://cdn.example.com');
    });
  });

  describe('required variable missing', () => {
    const requiredKeys = [
      'MONGODB_URI',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'GOOGLE_CLIENT_ID',
      'REVALIDATION_SECRET',
      'STORAGE_BUCKET',
      'STORAGE_KEY_ID',
      'STORAGE_SECRET',
    ] as const;

    it.each(requiredKeys)(
      'throws when %s is absent',
      (key) => {
        const env = { ...VALID_ENV };
        delete env[key];
        expect(() => validate(env)).toThrow('Environment validation failed');
      },
    );

    it('includes the missing variable name in the error message', () => {
      const env = { ...VALID_ENV };
      delete env['MONGODB_URI'];
      expect(() => validate(env)).toThrow('MONGODB_URI');
    });

    it('reports all missing variables in a single error', () => {
      expect(() => validate({})).toThrow('Environment validation failed');
    });
  });

  describe('invalid values', () => {
    it('throws when NODE_ENV is not a recognized enum value', () => {
      expect(() =>
        validate({ ...VALID_ENV, NODE_ENV: 'unknown-env' }),
      ).toThrow('Environment validation failed');
    });

    it('throws when PORT is below 1', () => {
      expect(() => validate({ ...VALID_ENV, PORT: '0' })).toThrow(
        'Environment validation failed',
      );
    });

    it('throws when PORT is above 65535', () => {
      expect(() => validate({ ...VALID_ENV, PORT: '99999' })).toThrow(
        'Environment validation failed',
      );
    });

    it('throws when NEXT_PUBLIC_URL is not a valid URL', () => {
      expect(() =>
        validate({ ...VALID_ENV, NEXT_PUBLIC_URL: 'not a url with spaces' }),
      ).toThrow('Environment validation failed');
    });

    it('throws when STORAGE_CDN_URL is not a valid URL', () => {
      expect(() =>
        validate({ ...VALID_ENV, STORAGE_CDN_URL: 'not a url with spaces' }),
      ).toThrow('Environment validation failed');
    });
  });

  describe('NodeEnv enum', () => {
    it.each([
      ['development', NodeEnv.Development],
      ['staging', NodeEnv.Staging],
      ['production', NodeEnv.Production],
      ['test', NodeEnv.Test],
    ] as const)(
      'accepts NODE_ENV="%s"',
      (raw, expected) => {
        const result = validate({ ...VALID_ENV, NODE_ENV: raw });
        expect(result.NODE_ENV).toBe(expected);
      },
    );
  });
});
