'use client';

import { ALLOWED_LINK_SCHEMES } from '@tapsync/shared';
import type { PublicLinkDto, Mode } from '@tapsync/shared';

interface LinkCardProps {
  link: PublicLinkDto;
  publicId: string;
  mode: Mode;
}

/**
 * Defence-in-depth: ensure the href only uses an allowed URL scheme.
 * The API already validates link schemes on input (Requirement 3.2), but the
 * web component should never render a dangerous scheme like `javascript:`
 * even if bad data reaches it (Requirement 10.3).
 *
 * Returns the original URL if safe, or `#` if the scheme is not allowed.
 */
function sanitizeUrl(url: string): string {
  try {
    // Use a dummy base only for relative URLs; absolute URLs parse on their own
    const parsed = new URL(url);
    if (ALLOWED_LINK_SCHEMES.includes(parsed.protocol as typeof ALLOWED_LINK_SCHEMES[number])) {
      return url;
    }
  } catch {
    // Invalid URL — fall through to return safe placeholder
  }
  return '#';
}

export function LinkCard({ link, publicId, mode }: LinkCardProps) {
  // Track link clicks using sendBeacon (Requirements 8.2, 8.8)
  const handleClick = () => {
    try {
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const url = `${apiUrl}/analytics/events`;
      
      const referrer = document.referrer 
        ? new URL(document.referrer).origin 
        : undefined;
      
      const payload = JSON.stringify({
        type: 'link_click',
        publicId,
        mode,
        linkId: link.id,
        referrer,
      });

      // Use sendBeacon for non-blocking tracking (Requirements 8.8)
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
    
    // Don't prevent default - let the link open normally
  };

  return (
    <a
      href={sanitizeUrl(link.url)}
      className="link-card"
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      aria-label={`${link.title} - Opens in new tab`}
    >
      <div className="link-icon" aria-hidden="true">
        {getIconForLink(link.icon)}
      </div>
      <div className="link-content">
        <span className="link-title">{link.title}</span>
        {link.category !== 'custom' && (
          <span className="link-category">{formatCategory(link.category)}</span>
        )}
      </div>
      <div className="link-arrow" aria-hidden="true">
        →
      </div>
    </a>
  );
}

function getIconForLink(icon: string): string {
  // Simple emoji-based icons for now
  const iconMap: Record<string, string> = {
    linkedin: '💼',
    github: '💻',
    globe: '🌐',
    mail: '📧',
    calendar: '📅',
    building: '🏢',
    instagram: '📷',
    facebook: '👥',
    twitter: '🐦',
    gamepad: '🎮',
    'message-circle': '💬',
    music: '🎵',
    link: '🔗',
  };
  return iconMap[icon] || '🔗';
}

function formatCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}
