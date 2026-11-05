import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from './Footer';

const SITE_URL = process.env['NEXT_PUBLIC_SITE_URL'] || 'https://tapsync-eosin.vercel.app';

describe('Footer', () => {
  it('renders TapSync branding', () => {
    render(<Footer />);
    expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
    expect(screen.getByText('TapSync')).toBeInTheDocument();
  });

  it('renders privacy link', () => {
    render(<Footer />);
    const privacyLink = screen.getByText('Privacy');
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink).toHaveAttribute('href', `${SITE_URL}/privacy`);
    expect(privacyLink).toHaveAttribute('target', '_blank');
    expect(privacyLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders terms link', () => {
    render(<Footer />);
    const termsLink = screen.getByText('Terms');
    expect(termsLink).toBeInTheDocument();
    expect(termsLink).toHaveAttribute('href', `${SITE_URL}/terms`);
    expect(termsLink).toHaveAttribute('target', '_blank');
    expect(termsLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders current year in copyright', () => {
    render(<Footer />);
    const currentYear = new Date().getFullYear();
    expect(screen.getByText(new RegExp(currentYear.toString()))).toBeInTheDocument();
  });

  it('uses semantic footer element', () => {
    const { container } = render(<Footer />);
    expect(container.querySelector('footer')).toBeInTheDocument();
  });
});
