'use client';

import { useEffect } from 'react';
import type { Mode } from '@tapsync/shared';

/**
 * ViewBeacon - Non-blocking analytics for profile views
 * 
 * Requirements 8.1, 8.8: Record view event without delaying page render
 * 
 * Uses sendBeacon API for fire-and-forget tracking that doesn't block
 * page navigation or rendering. Falls back to fetch with keepalive if
 * sendBeacon is unavailable.
 */

interface ViewBeaconProps {
  publicId: string;
  mode: Mode;
}

export function ViewBeacon({ publicId, mode }: ViewBeaconProps) {
  useEffect(() => {
    // Get referrer (Requirements 8.1)
    try {
      const referrer = document.referrer 
        ? new URL(document.referrer).origin 
        : undefined;

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const url = `${apiUrl}/analytics/events`;
      
      const payload = JSON.stringify({
        type: 'view',
        publicId,
        mode,
        referrer,
      });

      // Use sendBeacon for fire-and-forget (Requirements 8.8)
      // It doesn't block navigation or page rendering
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
      } else {
        // Fallback to fetch with keepalive
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: payload,
          keepalive: true,
        }).catch(() => {
          // Silent fail - don't impact user experience
        });
      }
    } catch (error) {
      // Silent fail - don't impact user experience
    }
  }, [publicId, mode]);

  // This component renders nothing
  return null;
}
