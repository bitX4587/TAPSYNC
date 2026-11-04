import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LinkCard } from './LinkCard';
import type { PublicLinkDto } from '@tapsync/shared';

describe('LinkCard', () => {
  it('renders link with all properties', () => {
    const link: PublicLinkDto = {
      id: '1',
      title: 'LinkedIn Profile',
      url: 'https://linkedin.com/in/johndoe',
      icon: 'linkedin',
      category: 'linkedin',
    };

    render(<LinkCard link={link} />);

    expect(screen.getByText('LinkedIn Profile')).toBeInTheDocument();
    expect(screen.getByText('Linkedin')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://linkedin.com/in/johndoe');
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render category text for custom links', () => {
    const link: PublicLinkDto = {
      id: '2',
      title: 'My Custom Link',
      url: 'https://example.com',
      icon: 'link',
      category: 'custom',
    };

    render(<LinkCard link={link} />);

    expect(screen.getByText('My Custom Link')).toBeInTheDocument();
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
  });

  it('renders different icons for different categories', () => {
    const githubLink: PublicLinkDto = {
      id: '3',
      title: 'GitHub',
      url: 'https://github.com/user',
      icon: 'github',
      category: 'github',
    };

    const { rerender } = render(<LinkCard link={githubLink} />);
    expect(screen.getByText('💻')).toBeInTheDocument();

    const instagramLink: PublicLinkDto = {
      id: '4',
      title: 'Instagram',
      url: 'https://instagram.com/user',
      icon: 'instagram',
      category: 'instagram',
    };

    rerender(<LinkCard link={instagramLink} />);
    expect(screen.getByText('📷')).toBeInTheDocument();
  });

  it('has accessible label with link title', () => {
    const link: PublicLinkDto = {
      id: '5',
      title: 'Portfolio Website',
      url: 'https://example.com/portfolio',
      icon: 'globe',
      category: 'portfolio',
    };

    render(<LinkCard link={link} />);

    const linkElement = screen.getByRole('link', { name: /Portfolio Website/i });
    expect(linkElement).toBeInTheDocument();
  });
});
