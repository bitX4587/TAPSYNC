import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';

import { RevalidationService } from './revalidation.service.js';
import { AppConfigService } from '../config/app-config.service.js';

describe('RevalidationService', () => {
  let service: RevalidationService;
  let mockConfig: jest.Mocked<AppConfigService>;
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    // Save original fetch
    originalFetch = global.fetch;

    // Mock AppConfigService
    mockConfig = {
      nextPublicUrl: 'https://tapsync.app',
      revalidationSecret: 'test-secret-key',
    } as jest.Mocked<AppConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevalidationService,
        {
          provide: AppConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<RevalidationService>(RevalidationService);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('revalidateProfile', () => {
    it('should successfully revalidate on first attempt', async () => {
      const mockFetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch as any;

      await service.revalidateProfile('abc123xyz');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://tapsync.app/api/revalidate',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-revalidation-secret': 'test-secret-key',
          },
          body: JSON.stringify({ tag: 'profile:abc123xyz' }),
        },
      );
    });

    it('should include the correct tag format', async () => {
      const mockFetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch as any;

      await service.revalidateProfile('testuser123');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.tag).toBe('profile:testuser123');
    });

    it('should retry on network error with exponential backoff', async () => {
      const mockFetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });
      global.fetch = mockFetch as any;

      // Mock setTimeout to avoid actual delays in tests
      jest.useFakeTimers();
      const sleepSpy = jest.spyOn(service as any, 'sleep');

      const promise = service.revalidateProfile('abc123xyz');

      // Fast-forward through all timers
      await jest.runAllTimersAsync();
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(sleepSpy).toHaveBeenCalledTimes(2);
      // First retry: 1000ms * 2^0 = 1000ms
      expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000);
      // Second retry: 1000ms * 2^1 = 2000ms
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000);

      jest.useRealTimers();
    });

    it('should retry on HTTP error response', async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: jest.fn().mockResolvedValue('Internal Server Error'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });
      global.fetch = mockFetch as any;

      jest.useFakeTimers();
      const promise = service.revalidateProfile('abc123xyz');
      await jest.runAllTimersAsync();
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should stop retrying after max attempts and log error', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch as any;

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      jest.useFakeTimers();
      const promise = service.revalidateProfile('abc123xyz');
      await jest.runAllTimersAsync();
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to revalidate profile:abc123xyz after 3 attempts',
        ),
      );

      jest.useRealTimers();
    });

    it('should not throw error even after all retries fail', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch as any;

      jest.useFakeTimers();

      // Should not throw
      await expect(
        (async () => {
          const promise = service.revalidateProfile('abc123xyz');
          await jest.runAllTimersAsync();
          await promise;
        })(),
      ).resolves.not.toThrow();

      jest.useRealTimers();
    });

    it('should log warning on non-final retry attempts', async () => {
      const mockFetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });
      global.fetch = mockFetch as any;

      const warnSpy = jest.spyOn(Logger.prototype, 'warn');

      jest.useFakeTimers();
      const promise = service.revalidateProfile('abc123xyz');
      await jest.runAllTimersAsync();
      await promise;

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Revalidation attempt 1 failed'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Retrying in 1000ms'),
      );

      jest.useRealTimers();
    });

    it('should log success message on successful revalidation', async () => {
      const mockFetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch as any;

      const logSpy = jest.spyOn(Logger.prototype, 'log');

      await service.revalidateProfile('abc123xyz');

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Successfully revalidated profile:abc123xyz'),
      );
    });

    it('should handle non-Error exceptions', async () => {
      const mockFetch = jest.fn().mockRejectedValue('String error');
      global.fetch = mockFetch as any;

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      jest.useFakeTimers();
      const promise = service.revalidateProfile('abc123xyz');
      await jest.runAllTimersAsync();
      await promise;

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('String error'),
      );

      jest.useRealTimers();
    });

    it('should use exponential backoff with correct delays', async () => {
      const mockFetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'));
      global.fetch = mockFetch as any;

      jest.useFakeTimers();
      const sleepSpy = jest.spyOn(service as any, 'sleep');

      const promise = service.revalidateProfile('abc123xyz');
      await jest.runAllTimersAsync();
      await promise;

      expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000); // 1000 * 2^0
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000); // 1000 * 2^1

      jest.useRealTimers();
    });
  });

  describe('revalidateProfileAndPaths', () => {
    it('should call revalidateProfile with the same publicId', async () => {
      const mockFetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch as any;

      const revalidateSpy = jest.spyOn(service, 'revalidateProfile');

      await service.revalidateProfileAndPaths('abc123xyz');

      expect(revalidateSpy).toHaveBeenCalledWith('abc123xyz');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should use the correct tag that covers both canonical and custom name paths', async () => {
      const mockFetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch as any;

      await service.revalidateProfileAndPaths('testuser123');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      // The tag profile:publicId covers both /c/{publicId} and /p/{customName}
      expect(callBody.tag).toBe('profile:testuser123');
    });
  });

  describe('Configuration', () => {
    it('should use the configured Next.js public URL', async () => {
      const customMockConfig = {
        nextPublicUrl: 'https://custom-domain.com',
        revalidationSecret: 'test-secret-key',
      } as jest.Mocked<AppConfigService>;

      const customModule = await Test.createTestingModule({
        providers: [
          RevalidationService,
          {
            provide: AppConfigService,
            useValue: customMockConfig,
          },
        ],
      }).compile();

      const customService = customModule.get<RevalidationService>(RevalidationService);
      jest.spyOn(Logger.prototype, 'log').mockImplementation();

      const mockFetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch as any;

      await customService.revalidateProfile('abc123xyz');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom-domain.com/api/revalidate',
        expect.any(Object),
      );
    });

    it('should use the configured revalidation secret', async () => {
      const customMockConfig = {
        nextPublicUrl: 'https://tapsync.app',
        revalidationSecret: 'custom-secret-123',
      } as jest.Mocked<AppConfigService>;

      const customModule = await Test.createTestingModule({
        providers: [
          RevalidationService,
          {
            provide: AppConfigService,
            useValue: customMockConfig,
          },
        ],
      }).compile();

      const customService = customModule.get<RevalidationService>(RevalidationService);
      jest.spyOn(Logger.prototype, 'log').mockImplementation();

      const mockFetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch as any;

      await customService.revalidateProfile('abc123xyz');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-revalidation-secret': 'custom-secret-123',
          }),
        }),
      );
    });
  });
});
