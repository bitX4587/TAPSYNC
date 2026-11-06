import type { Mode } from './enums';

// ---------------------------------------------------------------------------
// Profile / User DTOs
// ---------------------------------------------------------------------------

export interface PublicContactDto {
  phone?: string;
  email?: string;
}

export interface PublicLinkDto {
  id: string;
  title: string;
  url: string;
  icon: string;
  category: string;
}

/**
 * Shape returned by GET /public/profiles/c/:publicId
 * and GET /public/profiles/p/:name when the name is current.
 * All hidden fields have already been removed server-side.
 */
export interface PublicProfileDto {
  publicId: string;
  customName?: string;
  fullName: string;
  designation?: string;
  company?: string;
  bio?: string;
  avatarUrl?: string;
  contact: PublicContactDto;
  mode: Mode;
  links: PublicLinkDto[];
}

/**
 * Returned by GET /public/profiles/p/:name when the name is retired.
 * The client should issue a 308 redirect to `/c/{redirectTo}`.
 */
export interface RetiredNameRedirectDto {
  redirectTo: string; // the publicId to redirect to
}

// ---------------------------------------------------------------------------
// Auth DTOs
// ---------------------------------------------------------------------------

export interface TokenPairDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until access token expires
}

// ---------------------------------------------------------------------------
// Link category / icon registry
// ---------------------------------------------------------------------------

export type LinkCategory =
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'email'
  | 'calendar'
  | 'company'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'whatsapp'
  | 'discord'
  | 'fiverr'
  | 'upwork'
  | 'gaming'
  | 'messaging'
  | 'spotify'
  | 'custom';

export interface LinkCategoryMeta {
  category: LinkCategory;
  label: string;
  defaultIcon: string;
}

export const LINK_CATEGORIES: LinkCategoryMeta[] = [
  { category: 'linkedin', label: 'LinkedIn', defaultIcon: 'linkedin' },
  { category: 'github', label: 'GitHub', defaultIcon: 'github' },
  { category: 'portfolio', label: 'Portfolio', defaultIcon: 'globe' },
  { category: 'email', label: 'Email', defaultIcon: 'mail' },
  { category: 'whatsapp', label: 'WhatsApp', defaultIcon: 'whatsapp' },
  { category: 'discord', label: 'Discord', defaultIcon: 'discord' },
  { category: 'fiverr', label: 'Fiverr', defaultIcon: 'fiverr' },
  { category: 'upwork', label: 'Upwork', defaultIcon: 'upwork' },
  { category: 'calendar', label: 'Calendar', defaultIcon: 'calendar' },
  { category: 'company', label: 'Company Site', defaultIcon: 'building' },
  { category: 'instagram', label: 'Instagram', defaultIcon: 'instagram' },
  { category: 'facebook', label: 'Facebook', defaultIcon: 'facebook' },
  { category: 'twitter', label: 'X / Twitter', defaultIcon: 'twitter' },
  { category: 'gaming', label: 'Gaming', defaultIcon: 'gamepad' },
  { category: 'messaging', label: 'Messaging', defaultIcon: 'message-circle' },
  { category: 'spotify', label: 'Spotify', defaultIcon: 'music' },
  { category: 'custom', label: 'Custom', defaultIcon: 'link' },
];

/** Allowed URL schemes for profile links (Requirement 3.2). */
export const ALLOWED_LINK_SCHEMES = ['https:', 'http:', 'mailto:', 'tel:'] as const;

export type AllowedLinkScheme = (typeof ALLOWED_LINK_SCHEMES)[number];

// ---------------------------------------------------------------------------
// Analytics DTOs
// ---------------------------------------------------------------------------

export type AnalyticsEventType = 'view' | 'link_click' | 'contact_save';

export interface RecordEventDto {
  type: AnalyticsEventType;
  publicId: string;
  linkId?: string;
  sessionToken?: string; // opaque client-side value for de-duplication
}

// ---------------------------------------------------------------------------
// My Network DTOs
// ---------------------------------------------------------------------------

export type NetworkContactSource = 'nfc' | 'qr' | 'link' | 'scan';
export type NetworkContactStatus = 'saved' | 'unavailable';

export interface NetworkContactSnapshotDto {
  name?: string;
  designation?: string;
  avatarUrl?: string;
}

export interface NetworkContactDto {
  id: string;
  publicId: string;
  status: NetworkContactStatus;
  snapshot?: NetworkContactSnapshotDto;
  source: NetworkContactSource;
  modeAtSave?: Mode;
  note?: string;
  tapCount: number;
  firstSavedAt: string; // ISO 8601
  lastTappedAt: string; // ISO 8601
}

export interface SaveNetworkContactDto {
  publicId: string;
  source: NetworkContactSource;
  tappedAt: string; // ISO 8601
  modeAtSave?: Mode;
}

export interface SyncNetworkContactsDto {
  entries: SaveNetworkContactDto[];
}
