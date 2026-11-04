/**
 * Tests for auth hooks
 * Requirements: 1.1, 1.2
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useHasSession, useCreateAnonymousAccount } from './use-auth';
import * as authService from './auth.service';

// Mock the auth service
jest.mock('./auth.service', () => ({
  hasExistingSession: jest.fn(),
  createAnonymousAccount: jest.fn(),
}));

// Mock expo-router to avoid loading the full expo runtime which references
// the ErrorUtils global (unavailable in the Node test environment).
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

// Helper to create a fresh query client for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Helper to wrap hooks with QueryClientProvider
function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('use-auth hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useHasSession', () => {
    it('should return true when session exists', async () => {
      // Arrange
      (authService.hasExistingSession as jest.Mock).mockResolvedValue(true);
      const queryClient = createTestQueryClient();

      // Act
      const { result } = renderHook(() => useHasSession(), {
        wrapper: createWrapper(queryClient),
      });

      // Assert
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      expect(result.current.data).toBe(true);
    });

    it('should return false when no session exists', async () => {
      // Arrange
      (authService.hasExistingSession as jest.Mock).mockResolvedValue(false);
      const queryClient = createTestQueryClient();

      // Act
      const { result } = renderHook(() => useHasSession(), {
        wrapper: createWrapper(queryClient),
      });

      // Assert
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      expect(result.current.data).toBe(false);
    });
  });

  describe('useCreateAnonymousAccount', () => {
    it('should create anonymous account and invalidate session query', async () => {
      // Arrange
      const mockResult = {
        accessToken: 'mock-access',
        refreshToken: 'mock-refresh',
        user: { publicId: 'abc123xyz9' },
      };
      (authService.createAnonymousAccount as jest.Mock).mockResolvedValue(mockResult);
      
      const queryClient = createTestQueryClient();

      // Act
      const { result } = renderHook(() => useCreateAnonymousAccount(), {
        wrapper: createWrapper(queryClient),
      });

      // Trigger the mutation
      result.current.mutate(undefined);

      // Assert
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      expect(result.current.data).toEqual(mockResult);
      expect(authService.createAnonymousAccount).toHaveBeenCalled();

      // Check that publicId was cached
      const cachedPublicId = queryClient.getQueryData(['auth', 'publicId']);
      expect(cachedPublicId).toBe('abc123xyz9');
    });

    it('should handle errors during account creation', async () => {
      // Arrange
      const mockError = new Error('Network error');
      (authService.createAnonymousAccount as jest.Mock).mockRejectedValue(mockError);
      
      const queryClient = createTestQueryClient();

      // Act
      const { result } = renderHook(() => useCreateAnonymousAccount(), {
        wrapper: createWrapper(queryClient),
      });

      // Trigger the mutation
      result.current.mutate(undefined);

      // Assert
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
      expect(result.current.error).toEqual(mockError);
    });
  });
});
