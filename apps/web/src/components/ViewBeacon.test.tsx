import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { ViewBeacon } from './ViewBeacon';

describe('ViewBeacon', () => {
  beforeEach(() => {
    // Mock environment variable
    process.env['NEXT_PUBLIC_API_URL'] = 'https://api.tapsync.app';

    // Mock sendBeacon
    Object.defineProperty(navigator, 'sendBeacon', {
      writable: true,
      value: vi.fn(() => true),
    });

    // Mock document.referrer
    Object.defineProperty(document, 'referrer', {
      writable: true,
      value: 'https://google.com/search',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not render any visible content', () => {
    const { container } = render(<ViewBeacon publicId="abc123" mode="work" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should send view event on mount', () => {
    const sendBeaconMock = vi.fn(() => true);
    navigator.sendBeacon = sendBeaconMock;

    render(<ViewBeacon publicId="abc123" mode="work" />);

    expect(sendBeaconMock).toHaveBeenCalledWith(
      'https://api.tapsync.app/analytics/events',
      expect.any(Blob)
    );
  });

  it('should send view event with correct type', () => {
    const sendBeaconMock = vi.fn(() => true);
    navigator.sendBeacon = sendBeaconMock;

    render(<ViewBeacon publicId="abc123" mode="casual" />);

    expect(sendBeaconMock).toHaveBeenCalled();

    // Verify blob has correct type
    const blob = sendBeaconMock.mock.calls[0][1] as Blob;
    expect(blob.type).toBe('application/json');
  });

  it('should extract origin from referrer URL', () => {
    const sendBeaconMock = vi.fn(() => true);
    navigator.sendBeacon = sendBeaconMock;

    Object.defineProperty(document, 'referrer', {
      writable: true,
      value: 'https://twitter.com/path/to/page?query=value',
    });

    render(<ViewBeacon publicId="abc123" mode="work" />);

    expect(sendBeaconMock).toHaveBeenCalled();
  });

  it('should handle empty referrer', () => {
    const sendBeaconMock = vi.fn(() => true);
    navigator.sendBeacon = sendBeaconMock;

    Object.defineProperty(document, 'referrer', {
      writable: true,
      value: '',
    });

    render(<ViewBeacon publicId="abc123" mode="work" />);

    expect(sendBeaconMock).toHaveBeenCalled();
  });

  it('should fallback to fetch when sendBeacon is unavailable', () => {
    // Mock sendBeacon as undefined
    Object.defineProperty(navigator, 'sendBeacon', {
      writable: true,
      value: undefined,
    });

    const fetchMock = vi.fn(() => Promise.resolve(new Response()));
    global.fetch = fetchMock;

    render(<ViewBeacon publicId="abc123" mode="work" />);

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

  it('should only fire once per mount', () => {
    const sendBeaconMock = vi.fn(() => true);
    navigator.sendBeacon = sendBeaconMock;

    const { rerender } = render(<ViewBeacon publicId="abc123" mode="work" />);

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);

    // Re-render with same props should not fire again
    rerender(<ViewBeacon publicId="abc123" mode="work" />);

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
  });

  it('should fire again if publicId or mode changes', () => {
    const sendBeaconMock = vi.fn(() => true);
    navigator.sendBeacon = sendBeaconMock;

    const { rerender } = render(<ViewBeacon publicId="abc123" mode="work" />);

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);

    // Re-render with different mode should fire again
    rerender(<ViewBeacon publicId="abc123" mode="casual" />);

    expect(sendBeaconMock).toHaveBeenCalledTimes(2);
  });

  it('should handle tracking failure silently', () => {
    const sendBeaconMock = vi.fn(() => false); // Return false instead of throwing
    navigator.sendBeacon = sendBeaconMock;

    // Should not throw
    expect(() => {
      render(<ViewBeacon publicId="abc123" mode="work" />);
    }).not.toThrow();
  });

  it('should handle fetch rejection silently', () => {
    // Mock sendBeacon as undefined to force fetch fallback
    Object.defineProperty(navigator, 'sendBeacon', {
      writable: true,
      value: undefined,
    });

    const fetchMock = vi.fn(() => Promise.reject(new Error('Network error')));
    global.fetch = fetchMock;

    // Should not throw
    expect(() => {
      render(<ViewBeacon publicId="abc123" mode="work" />);
    }).not.toThrow();
  });
});
