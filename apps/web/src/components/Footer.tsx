export function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="page-footer">
      <p className="footer-text">
        Powered by{' '}
        <a 
          href="https://tapsync.app" 
          className="footer-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          TapSync
        </a>
      </p>
      <div className="footer-links">
        <a 
          href="https://tapsync.app/privacy" 
          className="footer-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy
        </a>
        <span className="footer-separator">•</span>
        <a 
          href="https://tapsync.app/terms" 
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
