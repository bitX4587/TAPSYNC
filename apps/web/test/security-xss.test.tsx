/**
 * Security verification: XSS escaping on the public profile page.
 *
 * Requirement 10.3: All inputs SHALL be validated and sanitized server-side;
 * public text SHALL be escaped on render to prevent XSS.
 *
 * React auto-escapes text content by default, so user-supplied strings like
 * fullName, bio, designation and company are safe from HTML injection.
 * Link URLs, however, need explicit scheme validation so that a `javascript:`
 * URL can never become an active clickable link.
 *
 * These tests verify the ProfilePage component tree renders all user content
 * as escaped text and sanitises dangerous link URLs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Mode } from '@tapsync/shared';
import type { PublicProfileDto } from '@tapsync/shared';

import { ProfilePage } from '../src/components/ProfilePage';
import { ProfileHeader } from '../src/components/ProfileHeader';
import { LinkCard } from '../src/components/LinkCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal PublicProfileDto with overrides. */
function makeProfile(overrides: Partial<PublicProfileDto> = {}): PublicProfileDto {
  return {
    publicId: 'abc123xyz9',
    fullName: 'Test User',
    contact: {},
    mode: Mode.Work,
    links: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Security – XSS Escaping', () => {
  beforeEach(() => {
    // jsdom may not have sendBeacon — silence the fallback fetch so ViewBeacon
    // and LinkCard click handlers don't throw during render.
    vi.stubGlobal('sendBeacon', vi.fn());
  });

  // ── 1. fullName ───────────────────────────────────────────────────────────

  describe('fullName escaping', () => {
    it('renders <script> tags as literal text, not as HTML elements', () => {
      const profile = makeProfile({
        fullName: '<script>alert(\'xss\')</script>',
      });

      render(<ProfileHeader profile={profile} />);

      // No actual <script> element should be in the DOM
      expect(document.querySelector('script')).toBeNull();

      // The literal text should be visible
      expect(screen.getByText(/alert\('xss'\)/)).toBeInTheDocument();
    });

    it('does not execute script in fullName via img onerror', () => {
      const profile = makeProfile({
        fullName: '<img src=x onerror=alert(1)>',
      });

      render(<ProfileHeader profile={profile} />);

      // No img element should be injected
      expect(document.querySelector('img[onerror]')).toBeNull();
      // The text should be escaped
      expect(screen.getByText(/onerror=alert/)).toBeInTheDocument();
    });
  });

  // ── 2. bio ────────────────────────────────────────────────────────────────

  describe('bio escaping', () => {
    it('renders HTML tags in bio as literal text', () => {
      const profile = makeProfile({
        fullName: 'Safe Name',
        bio: '<b>bold</b><script>alert(1)</script><img src=x onerror=alert(1)>',
      });

      render(<ProfileHeader profile={profile} />);

      // No actual <b>, <script>, or <img> elements from the bio
      expect(document.querySelector('script')).toBeNull();
      expect(document.querySelector('img[onerror]')).toBeNull();

      // The bio text is visible as escaped text
      const bioElement = screen.getByText(/<b>bold<\/b>/);
      expect(bioElement).toBeInTheDocument();
    });
  });

  // ── 3. designation & company ──────────────────────────────────────────────

  describe('designation and company escaping', () => {
    it('escapes HTML in designation', () => {
      const profile = makeProfile({
        fullName: 'Safe',
        designation: '<script>alert("designation")</script>',
      });

      render(<ProfileHeader profile={profile} />);

      expect(document.querySelector('script')).toBeNull();
      expect(screen.getByText(/alert\("designation"\)/)).toBeInTheDocument();
    });

    it('escapes HTML in company', () => {
      const profile = makeProfile({
        fullName: 'Safe',
        company: '<iframe src="javascript:alert(1)"></iframe>',
      });

      render(<ProfileHeader profile={profile} />);

      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.getByText(/iframe/)).toBeInTheDocument();
    });
  });

  // ── 4. Link URL sanitisation ─────────────────────────────────────────────

  describe('link URL sanitisation', () => {
    it('does not render a javascript: URL as a clickable href', () => {
      render(
        <LinkCard
          link={{
            id: '1',
            title: 'Evil Link',
            url: 'javascript:alert(1)',
            icon: 'link',
            category: 'custom',
          }}
          publicId="abc"
          mode={Mode.Work}
        />,
      );

      const link = screen.getByRole('link');
      const href = link.getAttribute('href');

      // The href must NOT be the dangerous javascript: URL
      expect(href).not.toBe('javascript:alert(1)');
      expect(href).not.toMatch(/^javascript:/i);
    });

    it('preserves safe https URLs', () => {
      render(
        <LinkCard
          link={{
            id: '2',
            title: 'Safe Link',
            url: 'https://example.com',
            icon: 'link',
            category: 'custom',
          }}
          publicId="abc"
          mode={Mode.Work}
        />,
      );

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://example.com');
    });

    it('sanitises data: URLs', () => {
      render(
        <LinkCard
          link={{
            id: '3',
            title: 'Data Link',
            url: 'data:text/html,<script>alert(1)</script>',
            icon: 'link',
            category: 'custom',
          }}
          publicId="abc"
          mode={Mode.Work}
        />,
      );

      const link = screen.getByRole('link');
      const href = link.getAttribute('href');
      expect(href).not.toMatch(/^data:/i);
    });
  });

  // ── 5. Full ProfilePage integration ───────────────────────────────────────

  describe('full ProfilePage with malicious data', () => {
    it('renders all user content safely without executing scripts', () => {
      const profile = makeProfile({
        fullName: '<script>alert("name")</script>',
        designation: '<script>alert("title")</script>',
        company: '<script>alert("company")</script>',
        bio: '<script>alert("bio")</script>',
        links: [
          {
            id: '1',
            title: '<script>alert("link")</script>',
            url: 'javascript:alert(1)',
            icon: 'link',
            category: 'custom',
          },
        ],
      });

      render(<ProfilePage profile={profile} />);

      // No script elements should exist in the rendered DOM
      expect(document.querySelectorAll('script').length).toBe(0);

      // The link href should not be javascript:
      const links = screen.getAllByRole('link');
      for (const link of links) {
        const href = link.getAttribute('href') ?? '';
        expect(href).not.toMatch(/^javascript:/i);
      }
    });

    it('escapes customName with special characters (not rendered as HTML)', () => {
      const profile = makeProfile({
        fullName: 'Safe User',
        customName: '<script>alert("custom")</script>',
      });

      render(<ProfilePage profile={profile} />);

      // customName is used in URLs/metadata, not rendered in the body,
      // so it must not inject HTML elements
      expect(document.querySelectorAll('script').length).toBe(0);
    });
  });
});
