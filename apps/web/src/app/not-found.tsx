export default function NotFound() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1>Profile not found</h1>
      <p>This profile does not exist or has been removed.</p>
    </main>
  );
}
