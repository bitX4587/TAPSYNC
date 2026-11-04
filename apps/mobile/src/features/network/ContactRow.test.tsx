/**
 * Tests for the ContactRow component.
 *
 * Verifies:
 *   - Renders contact name and designation
 *   - Shows "Unknown contact" when snapshot.name is absent
 *   - Shows "Profile removed" badge when status is 'unavailable'
 *   - Shows "New" badge when isNew is true
 *   - Shows initials avatar when no avatarUrl is present
 *   - Calls onPress when tapped
 *   - Shows "Pending sync" badge when isPending is true
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ContactRow } from './ContactRow';
import type { NetworkContactDto } from '@tapsync/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContact(overrides: Partial<NetworkContactDto> = {}): NetworkContactDto {
  return {
    id: 'contact-1',
    publicId: 'abc123xyz9',
    status: 'saved',
    source: 'nfc',
    tapCount: 1,
    firstSavedAt: '2024-01-01T00:00:00.000Z',
    // Use a timestamp far enough in the past so formatRelativeTime returns a date string
    // rather than "Just now" — avoids flakiness.
    lastTappedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    snapshot: { name: 'Alice Smith', designation: 'Software Engineer' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContactRow', () => {
  it('renders the contact name', () => {
    const contact = makeContact();
    const { getByText } = render(
      <ContactRow contact={contact} onPress={jest.fn()} />,
    );
    expect(getByText('Alice Smith')).toBeTruthy();
  });

  it('renders the contact designation', () => {
    const contact = makeContact();
    const { getByText } = render(
      <ContactRow contact={contact} onPress={jest.fn()} />,
    );
    expect(getByText('Software Engineer')).toBeTruthy();
  });

  it('shows "Unknown contact" when snapshot.name is absent', () => {
    const contact = makeContact({ snapshot: undefined });
    const { getByText } = render(
      <ContactRow contact={contact} onPress={jest.fn()} />,
    );
    expect(getByText('Unknown contact')).toBeTruthy();
  });

  it('shows "Unknown contact" when snapshot is present but name is undefined', () => {
    const contact = makeContact({ snapshot: { designation: 'Tester' } });
    const { getByText } = render(
      <ContactRow contact={contact} onPress={jest.fn()} />,
    );
    expect(getByText('Unknown contact')).toBeTruthy();
  });

  it('shows "Profile removed" badge when status is unavailable', () => {
    const contact = makeContact({ status: 'unavailable' });
    const { getByText } = render(
      <ContactRow contact={contact} onPress={jest.fn()} />,
    );
    expect(getByText('Profile removed')).toBeTruthy();
  });

  it('does not show "Profile removed" badge for a saved contact', () => {
    const contact = makeContact({ status: 'saved' });
    const { queryByText } = render(
      <ContactRow contact={contact} onPress={jest.fn()} />,
    );
    expect(queryByText('Profile removed')).toBeNull();
  });

  it('shows "New" badge when isNew is true', () => {
    const contact = makeContact();
    const { getByText } = render(
      <ContactRow contact={contact} isNew={true} onPress={jest.fn()} />,
    );
    expect(getByText('New')).toBeTruthy();
  });

  it('does not show "New" badge when isNew is false', () => {
    const contact = makeContact();
    const { queryByText } = render(
      <ContactRow contact={contact} isNew={false} onPress={jest.fn()} />,
    );
    expect(queryByText('New')).toBeNull();
  });

  it('does not show "New" badge when isNew is not provided', () => {
    const contact = makeContact();
    const { queryByText } = render(
      <ContactRow contact={contact} onPress={jest.fn()} />,
    );
    expect(queryByText('New')).toBeNull();
  });

  it('shows "Pending sync" badge when isPending is true', () => {
    const contact = makeContact();
    const { getByText } = render(
      <ContactRow contact={contact} isPending={true} onPress={jest.fn()} />,
    );
    expect(getByText('Pending sync')).toBeTruthy();
  });

  it('does not show "Pending sync" badge when isPending is false', () => {
    const contact = makeContact();
    const { queryByText } = render(
      <ContactRow contact={contact} isPending={false} onPress={jest.fn()} />,
    );
    expect(queryByText('Pending sync')).toBeNull();
  });

  it('shows initials when no avatarUrl is present', () => {
    const contact = makeContact({ snapshot: { name: 'Alice Smith' } });
    const { UNSAFE_getByProps } = render(
      <ContactRow contact={contact} onPress={jest.fn()} />,
    );
    // The initials text is aria-hidden (decorative) — use UNSAFE_getByProps
    const initialsEl = UNSAFE_getByProps({ testID: 'contact-initials' });
    expect(initialsEl.props.children).toBe('AS');
  });

  it('shows first two word initials from name', () => {
    const contact = makeContact({
      snapshot: { name: 'Bob Charles Davis' },
    });
    const { UNSAFE_getByProps } = render(
      <ContactRow contact={contact} onPress={jest.fn()} />,
    );
    const initialsEl = UNSAFE_getByProps({ testID: 'contact-initials' });
    expect(initialsEl.props.children).toBe('BC');
  });

  it('calls onPress when the row is tapped', () => {
    const onPress = jest.fn();
    const contact = makeContact();
    const { getByRole } = render(
      <ContactRow contact={contact} onPress={onPress} />,
    );
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows the "Tapped …" relative time label', () => {
    const contact = makeContact({
      // Very recent — will show "Just now"
      lastTappedAt: new Date(Date.now() - 5000).toISOString(),
    });
    const { getByText } = render(
      <ContactRow contact={contact} onPress={jest.fn()} />,
    );
    expect(getByText('Tapped Just now')).toBeTruthy();
  });

  it('renders an Image when avatarUrl is provided', () => {
    const contact = makeContact({
      snapshot: { name: 'Alice Smith', avatarUrl: 'https://example.com/avatar.jpg' },
    });
    const { getByLabelText } = render(
      <ContactRow contact={contact} onPress={jest.fn()} />,
    );
    expect(getByLabelText("Alice Smith's avatar")).toBeTruthy();
  });
});
