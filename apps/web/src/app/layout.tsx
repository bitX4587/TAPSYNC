import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'TapSync',
    template: '%s | TapSync',
  },
  description: 'Dynamic NFC digital business card',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
