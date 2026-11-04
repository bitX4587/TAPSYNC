/**
 * Response DTO for GET /user/me
 *
 * Returns all profile fields the Owner can see.
 * Sensitive fields (passwordHash, recoveryCodeHash, refreshTokenHashes) are excluded.
 *
 * Requirements: 2.4, 1.9
 */
export class ProfileResponseDto {
  publicId!: string;
  customName?: string | undefined;
  fullName?: string | undefined;
  bio?: string | undefined;
  designation?: string | undefined;
  company?: string | undefined;
  phone?: string | undefined;
  publicEmail?: string | undefined;
  hiddenFields!: ('phone' | 'publicEmail')[];
  avatarUrl?: string | undefined;
  activeMode!: 'work' | 'casual';
  theme?: 'light' | 'dark' | 'system' | undefined;
  status!: 'active' | 'suspended' | 'deleted';
  createdAt!: Date;
  updatedAt!: Date;
  
  // Recovery method indicators (Requirement 1.9)
  // Used to determine if account is secured with at least one recovery method
  hasEmailLinked!: boolean;
  hasGoogleLinked!: boolean;
  hasRecoveryCode!: boolean;
}
