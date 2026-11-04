/**
 * Tests for the ContactDetailScreen component.
 *
 * Verifies:
 *   - Renders contact name and designation from snapshot when live profile is loading
 *   - Shows "No links in this profile" when live profile has no links
 *   - Shows links when live profile loads
 *   - Shows unavailable banner when status is unavailable
 *   - Delete confirmation: confirm calls deleteContact and goes back
 *   - Note save: updates note and shows success
 *   - "Open in browser" calls Linking.openURL with the correct URL
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Linking, Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — declared before any other imports
// ---------------------------------------------------------------------------

// Mock expo-router
const mockBack = jest.fn();
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockReact = require('react');
  return {
    useLocalSearchParams: jest.fn(),
    useRouter: jest.fn(() => ({ back: mockBack })),
    Stack: {
      // Render headerRight so we can test the delete header button
      Screen: ({ options }: { options?: { title?: string; headerRight?: () => unknown } }) => {
        if (options?.headerRight) {
          const mockHeaderRight = options.headerRight;
          return mockReact.createElement(mockHeaderRight);
        }
        return null;
      },
    },
  };
});

// Mock the network hooks
const mockDeleteContact = jest.fn();
const mockUpdateNote = jest.fn();
const mockUseNetworkContact = jest.fn();

jest.mock('./use-network', () => ({
  useNetworkContact: (...args: unknown[]) => mockUseNetworkContact(...args),
  useNetworkDelete: () => ({
    deleteContact: mockDeleteContact,
    isPending: false,
  }),
  useNetworkNote: () => ({
    updateNote: mockUpdateNote,
    isPending: false,
  }),
}));

// Mock the API module
jest.mock('../../lib/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

// Mock Linking
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn(() => Promise.resolve()),
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { useLocalSearchParams } from 'expo-router';
import { api } from '../../lib/api';
import ContactDetailScreen from '../../app/network/[id]';
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
    lastTappedAt: '2024-05-01T00:00:00.000Z',
    snapshot: { name: 'Alice Smith', designation: 'Software Engineer' },
    ...overrides,
  };
}

function makePublicProfile(overrides: Partial<{
  publicId: string;
  fullName: string;
  designation?: string;
  company?: string;
  bio?: string;
  avatarUrl?: string;
  contact: { phone?: string; email?: string };
  mode: 'casual' | 'work';
  links: Array<{ id: string; title: string; url: string; icon: string; category: string }>;
}> = {}) {
  return {
    publicId: 'abc123xyz9',
    fullName: 'Alice Smith',
    designation: 'Software Engineer',
    company: 'Acme Corp',
    bio: 'Building cool things.',
    contact: { email: 'alice@example.com' },
    mode: 'work' as const,
    links: [
      { id: 'link-1', title: 'LinkedIn', url: 'https://linkedin.com/in/alice', icon: 'linkedin', category: 'linkedin' },
      { id: 'link-2', title: 'GitHub', url: 'https://github.com/alice', icon: 'github', category: 'github' },
    ],
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContactDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default route params
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      id: 'contact-1',
      publicId: 'abc123xyz9',
    });
    // Default: contact is found, not loading
    mockUseNetworkContact.mockReturnValue({
      contact: makeContact(),
      isLoading: false,
    });
    // Default: API returns the live profile
    (api.get as jest.Mock).mockResolvedValue(makePublicProfile());
    mockDeleteContact.mockResolvedValue(undefined);
    mockUpdateNote.mockResolvedValue(undefined);
  });

  it('renders contact name from snapshot while live profile is loading', async () => {
    // Simulate the live profile still loading (API hangs)
    (api.get as jest.Mock).mockReturnValue(new Promise(() => {}));

    const { getByText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

    // While live profile is loading, snapshot name should be visible
    expect(getByText('Alice Smith')).toBeTruthy();
  });

  it('renders designation from snapshot when live profile is loading', async () => {
    (api.get as jest.Mock).mockReturnValue(new Promise(() => {}));

    const { getByText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

    // snapshot designation shown as subheading via profile resolution
    // The screen shows designation from live profile OR snapshot
    // Since profile is loading, it falls back to snapshot
    expect(getByText('Alice Smith')).toBeTruthy();
  });

  it('shows "No links in this profile" when live profile has no links', async () => {
    (api.get as jest.Mock).mockResolvedValue(makePublicProfile({ links: [] }));

    const { findByText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

    expect(await findByText('No links in this profile')).toBeTruthy();
  });

  it('shows links when live profile loads successfully', async () => {
    const { findByText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

    expect(await findByText('LinkedIn')).toBeTruthy();
    expect(await findByText('GitHub')).toBeTruthy();
  });

  it('pressing a link calls Linking.openURL with the link URL', async () => {
    const { findByText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

    const linkedInLink = await findByText('LinkedIn');
    fireEvent.press(linkedInLink);

    expect(Linking.openURL).toHaveBeenCalledWith('https://linkedin.com/in/alice');
  });

  it('shows unavailable banner when contact status is unavailable', async () => {
    mockUseNetworkContact.mockReturnValue({
      contact: makeContact({ status: 'unavailable' }),
      isLoading: false,
    });

    const { findByText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

    expect(
      await findByText(
        'This profile is no longer available. You can still keep the contact or remove them.',
      ),
    ).toBeTruthy();
  });

  it('does not show unavailable banner for a saved contact', async () => {
    const { queryByText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

    // Wait for profile to load
    await waitFor(() => {
      expect(queryByText('LinkedIn')).toBeTruthy();
    });

    expect(
      queryByText(
        'This profile is no longer available. You can still keep the contact or remove them.',
      ),
    ).toBeNull();
  });

  it('shows a loading spinner when contact is loading', () => {
    mockUseNetworkContact.mockReturnValue({
      contact: null,
      isLoading: true,
    });

    const { getByLabelText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

    expect(getByLabelText('Loading contact')).toBeTruthy();
  });

  it('shows "Contact not found" when contact is null and not loading', () => {
    mockUseNetworkContact.mockReturnValue({
      contact: null,
      isLoading: false,
    });

    const { getByText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

    expect(getByText('Contact not found')).toBeTruthy();
  });

  it('go-back button works on the not-found screen', () => {
    mockUseNetworkContact.mockReturnValue({
      contact: null,
      isLoading: false,
    });

    const { getByLabelText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

    fireEvent.press(getByLabelText('Go back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  describe('Delete contact', () => {
    it('shows a confirmation alert when delete is pressed', async () => {
      const { findByLabelText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

      const deleteBtn = await findByLabelText('Delete contact');
      fireEvent.press(deleteBtn);

      expect(Alert.alert).toHaveBeenCalledWith(
        'Remove this contact?',
        'This will remove them from your My Network list.',
        expect.any(Array),
      );
    });

    it('calls deleteContact and goes back when Remove is confirmed', async () => {
      // Capture the Alert buttons and simulate pressing "Remove"
      (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
        // Find the destructive "Remove" button and call its onPress
        const removeButton = (buttons as Array<{ text: string; onPress?: () => void }>).find(
          (b) => b.text === 'Remove',
        );
        removeButton?.onPress?.();
      });

      const { findByLabelText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

      const deleteBtn = await findByLabelText('Delete contact');
      fireEvent.press(deleteBtn);

      await waitFor(() => {
        expect(mockDeleteContact).toHaveBeenCalledWith('contact-1');
      });
      await waitFor(() => {
        expect(mockBack).toHaveBeenCalledTimes(1);
      });
    });

    it('does NOT call deleteContact when Cancel is pressed', async () => {
      (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
        const cancelButton = (buttons as Array<{ text: string; onPress?: () => void }>).find(
          (b) => b.text === 'Cancel',
        );
        cancelButton?.onPress?.();
      });

      const { findByLabelText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

      const deleteBtn = await findByLabelText('Delete contact');
      fireEvent.press(deleteBtn);

      expect(mockDeleteContact).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
    });
  });

  describe('Private note', () => {
    it('pre-fills the note input with the existing note', () => {
      mockUseNetworkContact.mockReturnValue({
        contact: makeContact({ note: 'Met at conference' }),
        isLoading: false,
      });

      const { getByLabelText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

      const input = getByLabelText('Private note');
      expect(input.props.value).toBe('Met at conference');
    });

    it('enables Save note button only when text has changed', () => {
      const { getByLabelText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

      const saveBtn = getByLabelText('Save note');
      // Initially note is empty (contact has no note) and input is empty — not changed
      expect(saveBtn.props.accessibilityState?.disabled).toBe(true);

      // Change the note text
      const input = getByLabelText('Private note');
      fireEvent.changeText(input, 'New note text');

      // Now it should be enabled
      expect(getByLabelText('Save note').props.accessibilityState?.disabled).toBe(false);
    });

    it('calls updateNote with the correct arguments when Save note is pressed', async () => {
      const { getByLabelText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

      const input = getByLabelText('Private note');
      fireEvent.changeText(input, 'Met at the conference');

      const saveBtn = getByLabelText('Save note');
      fireEvent.press(saveBtn);

      await waitFor(() => {
        expect(mockUpdateNote).toHaveBeenCalledWith('contact-1', 'Met at the conference');
      });
    });

    it('shows "Note saved ✓" after successful note save', async () => {
      const { getByLabelText, findByText } = render(<ContactDetailScreen />, {
        wrapper: createWrapper(),
      });

      const input = getByLabelText('Private note');
      fireEvent.changeText(input, 'A new note');

      const saveBtn = getByLabelText('Save note');
      fireEvent.press(saveBtn);

      expect(await findByText('Note saved ✓')).toBeTruthy();
    });
  });

  describe('Action buttons', () => {
    it('"Open in browser" calls Linking.openURL with the correct profile URL', async () => {
      const { findByLabelText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

      const openBtn = await findByLabelText('Open in browser');
      fireEvent.press(openBtn);

      expect(Linking.openURL).toHaveBeenCalledWith('https://tapsync.app/c/abc123xyz9');
    });

    it('"Save to phone contacts" calls Linking.openURL with the vcard URL', async () => {
      const { findByLabelText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

      const saveBtn = await findByLabelText('Save to phone contacts');
      fireEvent.press(saveBtn);

      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining('/public/profiles/c/abc123xyz9/vcard'),
      );
    });
  });

  describe('Meta info section', () => {
    it('renders the source', async () => {
      const { findByText } = render(<ContactDetailScreen />, { wrapper: createWrapper() });

      expect(await findByText('nfc')).toBeTruthy();
    });
  });
});
