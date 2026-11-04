export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">
        ✨
      </div>
      <h2 className="empty-state-title">Getting Started</h2>
      <p className="empty-state-message">
        This profile is just getting set up. Check back soon for links and updates!
      </p>
    </div>
  );
}
