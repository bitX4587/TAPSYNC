/**
 * Tests for auth service
 * Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7
 */

import {
  createAnonymousAccount,
  hasExistingSession,
  clearSession,
  linkGoogleAccount,
  linkEmailAccount,
  generateRecoveryCode,
} from './auth.service';
import { api, tokenStorage } from '../../lib/api';

// Mock the dependencies
jest.mock('../../lib/api', () => ({
  api: {
    post: jest.fn(),
  },
  tokenStorage: {
    getRefreshToken: jest.fn(),
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
  },
}));

describe('auth.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAnonymousAccount', () => {
    it('should call the API and store tokens', async () => {
      // Arrange
      const mockResult = {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: {
          publicId: 'abc123xyz9',
        },
      };

      (api.post as jest.Mock).mockResolvedValue(mockResult);

      // Act
      const result = await createAnonymousAccount();

      // Assert
      expect(api.post).toHaveBeenCalledWith(
        '/auth/anonymous',
        {},
        { withAuth: false, autoRefresh: false }
      );
      expect(tokenStorage.setTokens).toHaveBeenCalledWith(
        'mock-access-token',
        'mock-refresh-token'
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw error if API call fails', async () => {
      // Arrange
      const mockError = new Error('Network error');
      (api.post as jest.Mock).mockRejectedValue(mockError);

      // Act & Assert
      await expect(createAnonymousAccount()).rejects.toThrow('Network error');
      expect(tokenStorage.setTokens).not.toHaveBeenCalled();
    });
  });

  describe('hasExistingSession', () => {
    it('should return true when refresh token exists', async () => {
      // Arrange
      (tokenStorage.getRefreshToken as jest.Mock).mockResolvedValue('some-refresh-token');

      // Act
      const result = await hasExistingSession();

      // Assert
      expect(result).toBe(true);
      expect(tokenStorage.getRefreshToken).toHaveBeenCalled();
    });

    it('should return false when no refresh token exists', async () => {
      // Arrange
      (tokenStorage.getRefreshToken as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await hasExistingSession();

      // Assert
      expect(result).toBe(false);
      expect(tokenStorage.getRefreshToken).toHaveBeenCalled();
    });
  });

  describe('clearSession', () => {
    it('should clear tokens from storage', async () => {
      // Act
      await clearSession();

      // Assert
      expect(tokenStorage.clearTokens).toHaveBeenCalled();
    });
  });

  describe('linkGoogleAccount', () => {
    it('should call the API with the ID token', async () => {
      // Arrange
      const mockIdToken = 'mock-google-id-token';
      (api.post as jest.Mock).mockResolvedValue(undefined);

      // Act
      await linkGoogleAccount(mockIdToken);

      // Assert
      expect(api.post).toHaveBeenCalledWith('/auth/link/google', {
        idToken: mockIdToken,
      });
    });

    it('should throw error if API call fails', async () => {
      // Arrange
      const mockError = new Error('Conflict: Google account already linked');
      (api.post as jest.Mock).mockRejectedValue(mockError);

      // Act & Assert
      await expect(linkGoogleAccount('token')).rejects.toThrow(
        'Conflict: Google account already linked'
      );
    });
  });

  describe('linkEmailAccount', () => {
    it('should call the API with email and password', async () => {
      // Arrange
      const mockEmail = 'user@example.com';
      const mockPassword = 'securePassword123';
      (api.post as jest.Mock).mockResolvedValue(undefined);

      // Act
      await linkEmailAccount(mockEmail, mockPassword);

      // Assert
      expect(api.post).toHaveBeenCalledWith('/auth/link/email', {
        email: mockEmail,
        password: mockPassword,
      });
    });

    it('should throw error if email is already used', async () => {
      // Arrange
      const mockError = new Error('Conflict: Email already linked to another account');
      (api.post as jest.Mock).mockRejectedValue(mockError);

      // Act & Assert
      await expect(
        linkEmailAccount('duplicate@example.com', 'password')
      ).rejects.toThrow('Conflict: Email already linked to another account');
    });
  });

  describe('generateRecoveryCode', () => {
    it('should call the API and return the recovery code', async () => {
      // Arrange
      const mockCode = 'abc12def34ghi56jkl78';
      (api.post as jest.Mock).mockResolvedValue({ code: mockCode });

      // Act
      const result = await generateRecoveryCode();

      // Assert
      expect(api.post).toHaveBeenCalledWith('/auth/recovery-code');
      expect(result).toEqual({ code: mockCode });
    });

    it('should throw error if API call fails', async () => {
      // Arrange
      const mockError = new Error('Internal server error');
      (api.post as jest.Mock).mockRejectedValue(mockError);

      // Act & Assert
      await expect(generateRecoveryCode()).rejects.toThrow('Internal server error');
    });
  });
});
