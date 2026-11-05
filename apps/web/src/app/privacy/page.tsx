import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — TapSync',
  description: 'TapSync Privacy Policy — how we collect, use, and protect your data.',
};

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <div className="legal-container">
        <header className="legal-header">
          <Link href="/" className="legal-back-link">← TapSync</Link>
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-last-updated">Last updated: 1 June 2025</p>
        </header>

        <section className="legal-section">
          <p>
            TapSync (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the TapSync service — an NFC-based
            digital business card platform. This Privacy Policy explains what information we
            collect, how we use it, and the choices you have.
          </p>
        </section>

        {/* 1. Information We Collect */}
        <section className="legal-section">
          <h2>1. Information We Collect</h2>

          <h3>1.1 Account Data</h3>
          <p>
            When you create a TapSync account we generate an anonymous user identifier for
            your device. If you choose to secure your account you may optionally provide:
          </p>
          <ul>
            <li>An email address and password</li>
            <li>A Google account (via OAuth — see Section 4)</li>
            <li>A one-time recovery code stored securely on our servers</li>
          </ul>

          <h3>1.2 Profile Data</h3>
          <p>
            Your public profile may contain information you voluntarily add, including:
            full name, job title, company, bio, profile photo, phone number, email address,
            website URL, and social media links. You control exactly which fields are visible
            to people who scan your card.
          </p>

          <h3>1.3 Analytics Data</h3>
          <p>
            When someone views your public profile we record a visit event. Each event
            contains: a timestamp, the type of event (profile view, link click, contact
            save), and coarse geographic information derived from the visitor&apos;s IP address
            (country/city — the raw IP is not stored). We do not use third-party analytics
            trackers.
          </p>

          <h3>1.4 Network Contacts</h3>
          <p>
            If you choose to save another TapSync user to your network, we store a reference
            to their public profile. No additional data beyond what is already on their
            public profile is collected.
          </p>
        </section>

        {/* 2. How We Use Your Data */}
        <section className="legal-section">
          <h2>2. How We Use Your Data</h2>
          <p>We use the data we collect solely to:</p>
          <ul>
            <li>Provide and operate the TapSync service</li>
            <li>Let other people view your public profile when they scan your NFC card</li>
            <li>Show you analytics about who has viewed your profile and clicked your links</li>
            <li>Authenticate you and allow account recovery on a new device</li>
            <li>Contact you about your account if you have provided an email address</li>
          </ul>
          <p>
            We do not use your data for advertising, profiling, or any purpose unrelated to
            providing the service.
          </p>
        </section>

        {/* 3. Data Retention and Deletion */}
        <section className="legal-section">
          <h2>3. Data Retention and Deletion</h2>
          <p>
            We retain your data for as long as your account exists. You can delete your
            account at any time from the app settings. When you delete your account:
          </p>
          <ul>
            <li>Your profile and all profile data are permanently deleted</li>
            <li>All analytics events associated with your profile are deleted</li>
            <li>Your authentication credentials (email hash, recovery code) are removed</li>
            <li>Your public profile URL stops resolving immediately</li>
            <li>Network connections referencing your profile are removed from other users&apos; networks</li>
          </ul>
          <p>
            Deletion is permanent and irreversible. We do not retain backups of deleted
            accounts beyond our standard 30-day backup rotation window; after that window
            all traces are removed.
          </p>
        </section>

        {/* 4. Third-Party Services */}
        <section className="legal-section">
          <h2>4. Third-Party Services</h2>
          <p>
            We do not sell your data to any third party. The only external service we
            integrate with is Google OAuth, used server-side to verify your identity when
            you choose to link a Google account. We receive only the account identifier and
            email address from Google; no other Google profile data is requested or stored.
          </p>
          <p>
            Our infrastructure is hosted on cloud providers. These providers act as data
            processors and are contractually bound to process data only on our behalf.
          </p>
        </section>

        {/* 5. Cookies and Local Storage */}
        <section className="legal-section">
          <h2>5. Cookies and Local Storage</h2>
          <p>
            TapSync does not use tracking cookies or advertising cookies. The mobile app
            stores your authentication token securely in the device&apos;s secure storage
            (Keychain on iOS, Keystore on Android). The web app does not set any persistent
            cookies. We do not use browser fingerprinting or any cross-site tracking
            technique.
          </p>
        </section>

        {/* 6. Your Rights */}
        <section className="legal-section">
          <h2>6. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you</li>
            <li>Correct inaccurate data via the profile edit screen</li>
            <li>Delete your account and all associated data (see Section 3)</li>
            <li>Export your data — contact us and we will provide a copy in JSON format</li>
            <li>Object to or restrict processing — contact us to discuss your situation</li>
          </ul>
        </section>

        {/* 7. Security */}
        <section className="legal-section">
          <h2>7. Security</h2>
          <p>
            Authentication tokens are short-lived JWTs. Passwords are hashed with bcrypt
            before storage. All data is transmitted over HTTPS. We apply the principle of
            least privilege to database access and infrastructure roles.
          </p>
        </section>

        {/* 8. Changes to This Policy */}
        <section className="legal-section">
          <h2>8. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will update the
            &quot;Last updated&quot; date at the top of this page and, if the changes are
            significant, notify you via the app or by email if you have provided one.
          </p>
        </section>

        {/* 9. Contact */}
        <section className="legal-section">
          <h2>9. Contact</h2>
          <p>
            For any privacy questions or requests, please email{' '}
            <a href="mailto:privacy@tapsync.app" className="legal-link">
              privacy@tapsync.app
            </a>
            .
          </p>
        </section>

        <footer className="legal-footer">
          <Link href="/" className="legal-back-link">← Back to TapSync</Link>
          <span className="legal-footer-sep">·</span>
          <a href="/terms" className="legal-link">Terms of Service</a>
        </footer>
      </div>

      <style>{`
        .legal-page {
          min-height: 100dvh;
          padding: 2rem 1rem 4rem;
          background-color: var(--color-bg);
          color: var(--color-text);
        }

        .legal-container {
          max-width: 720px;
          margin: 0 auto;
          font-size: 1rem;
          line-height: 1.7;
        }

        .legal-header {
          margin-bottom: 2.5rem;
          border-bottom: 1px solid var(--color-border);
          padding-bottom: 1.5rem;
        }

        .legal-back-link {
          display: inline-block;
          color: var(--color-link);
          text-decoration: none;
          font-size: 0.9375rem;
          margin-bottom: 1rem;
          transition: color 0.2s;
        }

        .legal-back-link:hover,
        .legal-back-link:focus {
          color: var(--color-link-hover);
          text-decoration: underline;
        }

        .legal-title {
          font-size: 2.25rem;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 0.5rem;
          color: var(--color-text);
        }

        .legal-last-updated {
          font-size: 0.875rem;
          color: var(--color-text-secondary);
        }

        .legal-section {
          margin-bottom: 2rem;
        }

        .legal-section h2 {
          font-size: 1.375rem;
          font-weight: 700;
          margin-bottom: 0.75rem;
          margin-top: 0.25rem;
          color: var(--color-text);
        }

        .legal-section h3 {
          font-size: 1.0625rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          margin-top: 1rem;
          color: var(--color-text);
        }

        .legal-section p {
          margin-bottom: 0.75rem;
        }

        .legal-section ul {
          margin: 0.5rem 0 0.75rem 1.5rem;
        }

        .legal-section ul li {
          margin-bottom: 0.4rem;
        }

        .legal-link {
          color: var(--color-link);
          text-decoration: underline;
          transition: color 0.2s;
        }

        .legal-link:hover,
        .legal-link:focus {
          color: var(--color-link-hover);
        }

        .legal-footer {
          margin-top: 3rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--color-border);
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          font-size: 0.9375rem;
        }

        .legal-footer-sep {
          color: var(--color-text-secondary);
        }

        @media (max-width: 600px) {
          .legal-title {
            font-size: 1.75rem;
          }
        }
      `}</style>
    </main>
  );
}
