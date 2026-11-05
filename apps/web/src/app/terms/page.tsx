import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — TapSync',
  description: 'TapSync Terms of Service — the rules that govern your use of the platform.',
};

export default function TermsOfServicePage() {
  return (
    <main className="legal-page">
      <div className="legal-container">
        <header className="legal-header">
          <Link href="/" className="legal-back-link">← TapSync</Link>
          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-last-updated">Effective date: 1 June 2025</p>
        </header>

        {/* 1. Acceptance */}
        <section className="legal-section">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By creating an account or using the TapSync service (&quot;Service&quot;) you agree to
            be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree, do not use
            the Service.
          </p>
          <p>
            We may update these Terms from time to time. Continued use of the Service after
            changes are posted constitutes acceptance of the revised Terms.
          </p>
        </section>

        {/* 2. Description of Service */}
        <section className="legal-section">
          <h2>2. Description of Service</h2>
          <p>
            TapSync is an NFC-based digital business card platform. The Service allows you
            to:
          </p>
          <ul>
            <li>Create a public digital profile with your contact information and links</li>
            <li>Program that profile onto an NFC card so others can tap it with their phone</li>
            <li>View analytics on who has visited your profile and clicked your links</li>
            <li>Save contacts from other TapSync users to your network</li>
          </ul>
          <p>
            The Service is provided on an &quot;as is&quot; basis. We reserve the right to modify,
            suspend, or discontinue any part of the Service at any time with reasonable
            notice.
          </p>
        </section>

        {/* 3. Accounts */}
        <section className="legal-section">
          <h2>3. Accounts</h2>
          <p>
            TapSync accounts are created anonymously on first launch. You are responsible
            for securing your account by linking a recovery method (Google, email, or
            recovery code). Keep your credentials confidential — you are responsible for
            all activity that occurs under your account.
          </p>
          <p>
            You must be at least 13 years old to use the Service. If you are under 18, you
            confirm that you have permission from a parent or guardian.
          </p>
        </section>

        {/* 4. User Responsibilities */}
        <section className="legal-section">
          <h2>4. User Responsibilities</h2>
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>Post content that is unlawful, harassing, defamatory, or fraudulent</li>
            <li>Impersonate another person or entity</li>
            <li>Harvest or scrape profile data from other users by automated means</li>
            <li>Interfere with or disrupt the Service or its infrastructure</li>
            <li>Circumvent any access controls or rate limits</li>
            <li>Distribute malware or conduct phishing through your profile links</li>
          </ul>
          <p>
            You retain ownership of the content you add to your profile. By adding content
            you grant us a limited, worldwide licence to host, display, and deliver that
            content solely for the purpose of operating the Service.
          </p>
        </section>

        {/* 5. Intellectual Property */}
        <section className="legal-section">
          <h2>5. Intellectual Property</h2>
          <p>
            The TapSync name, logo, and software are the intellectual property of TapSync.
            Nothing in these Terms transfers any intellectual property rights to you.
          </p>
        </section>

        {/* 6. Privacy */}
        <section className="legal-section">
          <h2>6. Privacy</h2>
          <p>
            Your use of the Service is also governed by our{' '}
            <a href="/privacy" className="legal-link">Privacy Policy</a>, which is
            incorporated into these Terms by reference.
          </p>
        </section>

        {/* 7. Account Termination and Deletion */}
        <section className="legal-section">
          <h2>7. Account Termination and Deletion</h2>
          <p>
            You may delete your account at any time from within the app. Deletion
            permanently removes your profile, links, analytics, and authentication data
            (see the Privacy Policy for details). Deleted accounts cannot be recovered.
          </p>
          <p>
            We may suspend or terminate your account if we reasonably believe you have
            violated these Terms. Where possible we will give you notice and an opportunity
            to resolve the issue before termination.
          </p>
        </section>

        {/* 8. Limitation of Liability */}
        <section className="legal-section">
          <h2>8. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by applicable law, TapSync and its operators
            shall not be liable for any indirect, incidental, special, consequential, or
            punitive damages, including loss of data or profits, arising from your use of
            (or inability to use) the Service.
          </p>
          <p>
            The Service is provided without warranties of any kind, whether express or
            implied, including merchantability, fitness for a particular purpose, or
            non-infringement.
          </p>
        </section>

        {/* 9. Changes to Terms */}
        <section className="legal-section">
          <h2>9. Changes to Terms</h2>
          <p>
            We will post any changes to these Terms on this page and update the
            &quot;Effective date&quot; at the top. For material changes, we will provide additional
            notice (such as an in-app notification or email where we have your address).
          </p>
        </section>

        {/* 10. Governing Law */}
        <section className="legal-section">
          <h2>10. Governing Law</h2>
          <p>
            These Terms are governed by applicable law. Any disputes will be resolved
            through the courts of competent jurisdiction.
          </p>
        </section>

        {/* 11. Contact */}
        <section className="legal-section">
          <h2>11. Contact</h2>
          <p>
            Questions about these Terms? Email us at{' '}
            <a href="mailto:legal@tapsync.app" className="legal-link">
              legal@tapsync.app
            </a>
            .
          </p>
        </section>

        <footer className="legal-footer">
          <Link href="/" className="legal-back-link">← Back to TapSync</Link>
          <span className="legal-footer-sep">·</span>
          <a href="/privacy" className="legal-link">Privacy Policy</a>
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
