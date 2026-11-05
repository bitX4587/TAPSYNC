export function Footer() {
  const currentYear = new Date().getFullYear();
  const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] || 'https://tapsync-eosin.vercel.app';

  return (
    <footer className="page-footer">
      <p className="footer-text">
        Powered by{' '}
        <a
          href={siteUrl}
          className="footer-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          TapSync
        </a>
      </p>
      <div className="footer-links">
        <a
          href={`${siteUrl}/privacy`}
          className="footer-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy
        </a>
        <span className="footer-separator">•</span>
        <a
          href={`${siteUrl}/terms`}
          className="footer-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms
        </a>
      </div>
      <p className="footer-copyright">
        © {currentYear} TapSync. All rights reserved.
      </p>
    </footer>
  );
}
