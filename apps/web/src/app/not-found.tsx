export default function NotFound() {
  return (
    <div className="profile-page">
      <main className="profile-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">
            🔍
          </div>
          <h1 className="empty-state-title">Profile Not Found</h1>
          <p className="empty-state-message">
            This profile does not exist or has been removed.
          </p>
          <div style={{ marginTop: '2rem' }}>
            <a href="https://tapsync.app" className="btn btn-primary">
              Learn About TapSync
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
