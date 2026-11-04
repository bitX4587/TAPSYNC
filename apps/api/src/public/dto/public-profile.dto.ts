// ---------------------------------------------------------------------------
// Public Profile DTO
//
// Returned to unauthenticated visitors at `/c/{publicId}` and `/p/{name}`.
// Contains only public-facing profile fields, enabled links for the active
// mode, and contact info with hidden fields removed.
//
// Requirements: 5.1–5.3, 6.1–6.5
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

export interface PublicProfileDto {
  publicId: string;
  customName?: string;
  fullName?: string;
  designation?: string;
  company?: string;
  bio?: string;
  avatarUrl?: string;
  contact: PublicContactDto;
  mode: 'work' | 'casual';
  links: PublicLinkDto[];
}

// ---------------------------------------------------------------------------
// Custom Name Response DTO
//
// Used by `/p/:name` to signal redirects for retired names.
// ---------------------------------------------------------------------------

export interface CustomNameResponseDto {
  /** Profile data when the name is current; undefined when retired */
  profile?: PublicProfileDto;
  /** Permanent redirect URL when the name is retired; undefined when current */
  redirectTo?: string;
}
