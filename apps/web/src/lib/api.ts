/**
 * Server-side API client for fetching public profiles from the backend.
 * Uses Next.js fetch with cache tags for on-demand revalidation.
 */

import type {
  PublicProfileDto,
  RetiredNameRedirectDto,
} from '@tapsync/shared';

// API response type for custom name endpoint
interface CustomNameResponseDto {
  profile?: PublicProfileDto;
  redirectTo?: string;
}

const API_URL = process.env['TAPSYNC_API_URL'] || 'http://localhost:3001';

export interface FetchProfileByPublicIdResult {
  success: true;
  profile: PublicProfileDto;
}

export interface FetchProfileByPublicIdError {
  success: false;
  status: number;
  message?: string;
}

/**
 * Fetches a public profile by its permanent publicId.
 * Uses cache tag `profile:{publicId}` for on-demand revalidation.
 * Falls back to 60s revalidation if the on-demand revalidation fails.
 */
export async function fetchProfileByPublicId(
  publicId: string,
): Promise<FetchProfileByPublicIdResult | FetchProfileByPublicIdError> {
  try {
    const res = await fetch(`${API_URL}/public/profiles/c/${publicId}`, {
      next: {
        tags: [`profile:${publicId}`],
        revalidate: 60, // 60-second fallback
      },
    });

    if (!res.ok) {
      return {
        success: false,
        status: res.status,
        message: res.statusText,
      };
    }

    const profile = (await res.json()) as PublicProfileDto;
    return { success: true, profile };
  } catch (err) {
    return {
      success: false,
      status: 500,
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export interface FetchProfileByCustomNameResult {
  success: true;
  profile: PublicProfileDto;
  /** If present, indicates a retired name redirect (308 status) */
  redirectTo?: string;
}

export interface FetchProfileByCustomNameError {
  success: false;
  status: number;
  message?: string;
}

/**
 * Fetches a public profile by its custom name.
 * - Current name: returns the profile
 * - Retired name: returns redirectTo (caller should issue 308 redirect)
 * - Not found: returns 404
 * Uses the same cache tag `profile:{publicId}` for consistency.
 */
export async function fetchProfileByCustomName(
  name: string,
): Promise<FetchProfileByCustomNameResult | FetchProfileByCustomNameError> {
  const url = `${API_URL}/public/profiles/p/${name}`;
  
  try {
    const res = await fetch(url, {
      next: {
        tags: [`custom-name:${name.toLowerCase()}`],
        revalidate: 60, // 60-second fallback
      },
    });

    if (!res.ok) {
      return {
        success: false,
        status: res.status,
        message: res.statusText,
      };
    }

    const data = (await res.json()) as CustomNameResponseDto;

    // Check if this is a retired name redirect
    if (data.redirectTo) {
      return {
        success: true,
        profile: null as any, // Not used for redirect
        redirectTo: data.redirectTo,
      };
    }

    // The API returns { profile: PublicProfileDto }
    // Extract the actual profile
    if (!data.profile) {
      return {
        success: false,
        status: 500,
        message: 'Invalid API response: missing profile',
      };
    }

    return { success: true, profile: data.profile };
  } catch (err) {
    return {
      success: false,
      status: 500,
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
