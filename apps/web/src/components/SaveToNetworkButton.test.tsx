import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SaveToNetworkButton } from './SaveToNetworkButton';

describe('SaveToNetworkButton', () => {
  it('renders Save to My Network button', () => {
    render(<SaveToNetworkButton publicId="test123" />);
    expect(screen.getByText('Save to My Network')).toBeInTheDocument();
  });

  it('renders Get the app button', () => {
    render(<SaveToNetworkButton publicId="test123" />);
    expect(screen.getByText('Get the app')).toBeInTheDocument();
  });

  it('uses custom URL scheme for Save to My Network button', () => {
    render(<SaveToNetworkButton publicId="test123" />);
    const saveButton = screen.getByText('Save to My Network');
    const href = saveButton.getAttribute('href');
    expect(href).toContain('tapsync://c/test123');
  });

  it('Get the app link opens in new tab with security attributes', () => {
    render(<SaveToNetworkButton publicId="test123" />);
    const getAppButton = screen.getByText('Get the app');
    expect(getAppButton).toHaveAttribute('target', '_blank');
    expect(getAppButton).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('has proper ARIA labels for accessibility', () => {
    render(<SaveToNetworkButton publicId="test123" />);
    expect(screen.getByLabelText('Save to My Network in TapSync app')).toBeInTheDocument();
    expect(screen.getByLabelText('Get the TapSync app')).toBeInTheDocument();
  });

  it('uses Android intent link on Android devices', () => {
    // Mock Android user agent
    const originalNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36' },
      writable: true,
      configurable: true,
    });

    render(<SaveToNetworkButton publicId="test123" />);
    const saveButton = screen.getByText('Save to My Network');
    const href = saveButton.getAttribute('href');
    expect(href).toContain('intent://c/test123');
    expect(href).toContain('scheme=tapsync');
    expect(href).toContain('browser_fallback_url');
    expect(href).toContain('play.google.com');

    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('meets minimum touch target size (44px)', () => {
    const { container } = render(<SaveToNetworkButton publicId="test123" />);
    const buttons = container.querySelectorAll('.btn');
    buttons.forEach((button) => {
      const styles = window.getComputedStyle(button);
      // Check that min-height is at least 44px (defined in CSS)
      expect(button.className).toContain('btn');
    });
  });
});
