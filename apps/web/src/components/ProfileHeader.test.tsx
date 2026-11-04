import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileHeader } from './ProfileHeader';
import type { PublicProfileDto } from '@tapsync/shared';
import { Mode } from '@tapsync/shared';

describe('ProfileHeader', () => {
  it('renders full profile with all fields', () => {
    const profile: PublicProfileDto = {
      publicId: 'abc123',
      fullName: 'John Doe',
      designation: 'Software Engineer',
      company: 'TapSync Inc',
      bio: 'Building the future of digital networking',
      avatarUrl: 'https://example.com/avatar.jpg',
      contact: {
        email: 'john@example.com',
        phone: '+1234567890',
      },
      mode: Mode.Work,
      links: [],
    };

    render(<ProfileHeader profile={profile} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    expect(screen.getByText('TapSync Inc')).toBeInTheDocument();
    expect(screen.getByText('Building the future of digital networking')).toBeInTheDocument();
    // next/image transforms the src, so just check that an image exists
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt', "John Doe's profile picture");
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('+1234567890')).toBeInTheDocument();
  });

  it('renders placeholder name when fullName is empty', () => {
    const profile: PublicProfileDto = {
      publicId: 'abc123',
      fullName: '',
      contact: {},
      mode: Mode.Work,
      links: [],
    };

    render(<ProfileHeader profile={profile} />);

    expect(screen.getByText('TapSync user')).toBeInTheDocument();
  });

  it('does not render optional fields when missing', () => {
    const profile: PublicProfileDto = {
      publicId: 'abc123',
      fullName: 'Jane Smith',
      contact: {},
      mode: Mode.Casual,
      links: [],
    };

    render(<ProfileHeader profile={profile} />);

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.queryByText('Software Engineer')).not.toBeInTheDocument();
    expect(screen.queryByText('TapSync Inc')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders only email contact when phone is missing', () => {
    const profile: PublicProfileDto = {
      publicId: 'abc123',
      fullName: 'Alice Johnson',
      contact: {
        email: 'alice@example.com',
      },
      mode: Mode.Work,
      links: [],
    };

    render(<ProfileHeader profile={profile} />);

    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it('renders mailto and tel links correctly', () => {
    const profile: PublicProfileDto = {
      publicId: 'abc123',
      fullName: 'Bob Wilson',
      contact: {
        email: 'bob@example.com',
        phone: '+9876543210',
      },
      mode: Mode.Work,
      links: [],
    };

    render(<ProfileHeader profile={profile} />);

    const emailLink = screen.getByRole('link', { name: /Email/i });
    expect(emailLink).toHaveAttribute('href', 'mailto:bob@example.com');

    const phoneLink = screen.getByRole('link', { name: /Call/i });
    expect(phoneLink).toHaveAttribute('href', 'tel:+9876543210');
  });
});
