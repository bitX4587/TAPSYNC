import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TapSync – Digital Business Cards',
  description:
    'Share your profile with a tap. TapSync turns your NFC card into a smart digital business card.',
};

export default function HomePage() {
  const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] || 'https://tapsync-eosin.vercel.app';

  return (
    <div className="landing-page">
      <main className="landing-container">
        {/* Hero */}
        <section className="landing-hero">
          <div className="landing-logo" aria-hidden="true">📇</div>
          <h1 className="landing-title">TapSync</h1>
          <p className="landing-tagline">Digital Business Cards, Powered by NFC</p>
          <p className="landing-description">
            Tap your card, share your world. TapSync turns a single NFC tap into
            a smart digital profile — your links, contact info, and more, always up to date.
          </p>
        </section>

        {/* Features */}
        <section className="landing-features" aria-label="Features">
          <div className="feature-card">
            <span className="feature-icon" aria-hidden="true">📡</span>
            <h2 className="feature-title">One Tap Sharing</h2>
            <p className="feature-desc">
              Program your NFC card once. Anyone who taps it instantly sees your profile.
            </p>
          </div>
          <div className="feature-card">
            <span className="feature-icon" aria-hidden="true">✏️</span>
            <h2 className="feature-title">Always Up to Date</h2>
            <p className="feature-desc">
              Update your links and info anytime — no need to reprint or reprogram your card.
            </p>
          </div>
          <div className="feature-card">
            <span className="feature-icon" aria-hidden="true">🔗</span>
            <h2 className="feature-title">Custom Name</h2>
            <p className="feature-desc">
              Claim a vanity URL like{' '}
              <code className="feature-code">{siteUrl}/p/yourname</code> for easy sharing.
            </p>
          </div>
          <div className="feature-card">
            <span className="feature-icon" aria-hidden="true">📊</span>
            <h2 className="feature-title">Analytics</h2>
            <p className="feature-desc">
              See how many people viewed your profile and which links they clicked.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="landing-cta">
          <p className="landing-cta-text">Ready to go paperless?</p>
          <a
            href="https://play.google.com/store/apps/details?id=app.tapsync.mobile"
            className="landing-btn"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download the App
          </a>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-links">
          <a href={`${siteUrl}/privacy`} className="footer-link">Privacy</a>
          <span className="footer-separator">•</span>
          <a href={`${siteUrl}/terms`} className="footer-link">Terms</a>
        </div>
        <p className="footer-copyright">
          © {new Date().getFullYear()} TapSync. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
