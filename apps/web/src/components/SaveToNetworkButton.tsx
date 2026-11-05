'use client';

interface SaveToNetworkButtonProps {
  publicId: string;
}

export function SaveToNetworkButton({ publicId }: SaveToNetworkButtonProps) {
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
  
  // Android intent link with Play Store fallback
  // Note: Update the package name and Play Store URL when deploying
  const androidIntentUrl = `intent://c/${publicId}#Intent;scheme=tapsync;package=com.tapsync.app;S.browser_fallback_url=${encodeURIComponent('https://play.google.com/store/apps/details?id=com.tapsync.app')};end`;
  
  // iOS and other platforms use simple custom scheme
  const defaultUrl = `tapsync://c/${publicId}`;
  
  const linkUrl = isAndroid ? androidIntentUrl : defaultUrl;

  return (
    <div className="save-network-actions">
      <a
        href={linkUrl}
        className="btn btn-primary"
        aria-label="Save to My Network in TapSync app"
      >
        Save to My Network
      </a>
      <a
        href="https://tapsync-eosin.vercel.app/download"
        className="btn btn-secondary"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Get the TapSync app"
      >
        Get the app
      </a>
    </div>
  );
}
