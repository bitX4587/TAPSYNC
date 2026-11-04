'use client';

import type { Mode } from '@tapsync/shared';

/**
 * SaveContactButton - Downloads the vCard for the profile
 * 
 * Requirements 5.8, 6.1-6.5, 8.3: vCard download with one tap and tracking
 * 
 * The button hits the vCard route which includes proper Content-Type
 * and Content-Disposition headers for download. Also tracks the event.
 */

interface SaveContactButtonProps {
  publicId: string;
  mode: Mode;
}

export function SaveContactButton({ publicId, mode }: SaveContactButtonProps) {
  const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] || 'https://tapsync.app';
  const vcardUrl = `${siteUrl}/c/${publicId}/vcard`;

  const handleClick = () => {
    // Track contact_save event (Requirements 8.3)
    try {
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const url = `${apiUrl}/analytics/events`;
      
      const referrer = document.referrer 
        ? new URL(document.referrer).origin 
        : undefined;
      
      const payload = JSON.stringify({
        type: 'contact_save',
        publicId,
        mode,
        referrer,
      });

      // Use sendBeacon for non-blocking tracking
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
          // Silent fail
        });
      }
    } catch (error) {
      // Silent fail - don't impact user experience
    }
  };

  return (
    <a
      href={vcardUrl}
      className="btn btn-secondary"
      download
      onClick={handleClick}
      aria-label="Save contact to your phone"
    >
      <span className="btn-icon" aria-hidden="true">
        📇
      </span>
      <span>Save Contact</span>
    </a>
  );
}
