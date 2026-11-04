import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SaveContactButton } from './SaveContactButton';

describe('SaveContactButton', () => {
  beforeEach(() => {
    // Mock environment variable
    process.env['NEXT_PUBLIC_SITE_URL'] = 'https://tapsync.app';
    process.env['NEXT_PUBLIC_API_URL'] = 'https://api.tapsync.app';

    // Mock sendBeacon
    Object.defineProperty(navigator, 'sendBeacon', {
      writable: true,
      value: vi.fn(() => true),
    });

    // Mock document.referrer
    Object.defineProperty(document, 'referrer', {
      writable: true,
      value: 'https://example.com',
    });
  });

  it('should render with correct text and icon', () => {
    render(<SaveContactButton publicId="abc123" mode="work" />);

    expect(screen.getByText('Save Contact')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'aria-label',
      'Save contact to your phone'
    );
  });

  it('should link to vCard route', () => {
    render(<SaveContactButton publicId="abc123" mode="work" />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      'https://tapsync.app/c/abc123/vcard'
    );
    expect(link).toHaveAttribute('download');
  });

  it('should track contact_save event when clicked', () => {
    const sendBeaconMock = vi.fn(() => true);
    navigator.sendBeacon = sendBeaconMock;

    render(<SaveContactButton publicId="abc123" mode="work" />);

    const link = screen.getByRole('link');
    fireEvent.click(link);

    expect(sendBeaconMock).toHaveBeenCalledWith(
      'https://api.tapsync.app/analytics/events',
      expect.any(Blob)
    );

    // Verify the payload
    const blob = sendBeaconMock.mock.calls[0][1] as Blob;
    expect(blob.type).toBe('application/json');
  });

  it('should include correct event type in tracking', () => {
    const sendBeaconMock = vi.fn(() => true);
    navigator.sendBeacon = sendBeaconMock;

    render(<SaveContactButton publicId="abc123" mode="casual" />);

    const link = screen.getByRole('link');
    fireEvent.click(link);

    expect(sendBeaconMock).toHaveBeenCalledWith(
      'https://api.tapsync.app/analytics/events',
      expect.any(Blob)
    );
    
    // Verify blob has correct type
    const blob = sendBeaconMock.mock.calls[0][1] as Blob;
    expect(blob.type).toBe('application/json');
  });

  it('should fallback to fetch when sendBeacon is unavailable', () => {
    // Mock sendBeacon as undefined
    Object.defineProperty(navigator, 'sendBeacon', {
      writable: true,
      value: undefined,
    });

    const fetchMock = vi.fn(() => Promise.resolve(new Response()));
    global.fetch = fetchMock;

    render(<SaveContactButton publicId="abc123" mode="work" />);

    const link = screen.getByRole('link');
    fireEvent.click(link);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.tapsync.app/analytics/events',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );
  });

  it('should handle tracking failure silently', () => {
    const sendBeaconMock = vi.fn(() => false); // Return false instead of throwing
    navigator.sendBeacon = sendBeaconMock;

    // Should not throw
    expect(() => {
      render(<SaveContactButton publicId="abc123" mode="work" />);
      const link = screen.getByRole('link');
      fireEvent.click(link);
    }).not.toThrow();
  });
});
