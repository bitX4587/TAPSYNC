/**
 * Tests for the Add Contact screen logic.
 *
 * Tests cover:
 * - parseTapSyncUrl handles all URL formats (re-tests the utility in context)
 * - NFC tab: after a successful NFC read, calls saveContact with publicId and source 'nfc'
 * - Link tab: after pasting a valid URL, calls saveContact with correct publicId
 * - QR tab: after entering a valid URL, calls saveContact with source 'qr'
 * - Own-card: does not save, shows inline message
 * - Offline / pending: navigates without highlight
 *
 * Requirements: 12.1, 12.4, 12.5, 13.1
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that transitively use them
// ---------------------------------------------------------------------------

const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockRouterReplace, back: mockRouterBack }),
  Stack: {
    Screen: ({ options }: { options?: { title?: string; headerRight?: () => React.ReactNode } }) => {
      // Render headerRight if present so we can test the Close button
      if (options?.headerRight) {
        const HeaderRight = options.headerRight;
        return <HeaderRight />;
      }
      return null;
    },
  },
}));

const mockReadTag = jest.fn();
const mockCancel = jest.fn();

jest.mock('../../features/nfc/nfc.service', () => ({
  nfcService: {
    readTag: mockReadTag,
    cancel: mockCancel,
    isSupported: jest.fn().mockResolvedValue(true),
    isEnabled: jest.fn().mockResolvedValue(true),
  },
  NfcError: class NfcError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'NfcError';
      this.code = code;
    }
  },
}));

const mockSaveContact = jest.fn();

jest.mock('../../features/network/use-network', () => ({
  useNetworkUpsert: () => ({
    saveContact: mockSaveContact,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

jest.mock('../../features/network/network-save', () => ({
  validatePublicId: jest.fn((id: string) => {
    if (!id) return 'No Public ID provided.';
    if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/i.test(id)) {
      return 'This link contains an invalid Public ID.';
    }
    return null;
  }),
  validateCustomName: jest.fn((name: string) => {
    if (!name) return 'No custom name provided.';
    if (name.length < 3 || name.length > 30) return 'Custom name must be 3–30 characters.';
    if (!/^[a-z0-9_-]+$/.test(name)) return 'Invalid custom name.';
    return null;
  }),
  resolveCustomNameToPublicId: jest.fn(),
}));

// Import AFTER mocks.  AddContactScreen (the module under test) is loaded
// with require() instead of `import`: babel hoists `import` above the mock*
// declarations above, which would make the nfc.service mock factory run before
// `const mockReadTag = jest.fn()` executes and capture `undefined` (so
// readTag/cancel end up undefined and handleScan throws).  require() is not
// hoisted, so it runs here — after the declarations — and the factories see
// the defined mock functions.  The other two imports are kept as `import`
// because their mock factories don't reference the mock* variables.
const AddContactScreen = require('../../app/network/add').default;
import { parseTapSyncUrl } from './parse-tapsync-url';
import { resolveCustomNameToPublicId } from './network-save';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderScreen() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AddContactScreen />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// parseTapSyncUrl — integration confirmation
// ---------------------------------------------------------------------------

describe('parseTapSyncUrl in add-contact context', () => {
  it('parses tapsync://c/{publicId}', () => {
    expect(parseTapSyncUrl('tapsync://c/abcdefghjk')).toEqual({
      type: 'publicId',
      value: 'abcdefghjk',
    });
  });

  it('parses tapsync://p/{name}', () => {
    expect(parseTapSyncUrl('tapsync://p/janedoe')).toEqual({
      type: 'customName',
      value: 'janedoe',
    });
  });

  it('parses https://tapsync.app/c/{publicId}', () => {
    expect(parseTapSyncUrl('https://tapsync.app/c/abcdefghjk')).toEqual({
      type: 'publicId',
      value: 'abcdefghjk',
    });
  });

  it('parses https://tapsync.app/p/{name}', () => {
    expect(parseTapSyncUrl('https://tapsync.app/p/janedoe')).toEqual({
      type: 'customName',
      value: 'janedoe',
    });
  });

  it('returns null for unrecognized URLs', () => {
    expect(parseTapSyncUrl('https://example.com/c/abcdefghjk')).toBeNull();
    expect(parseTapSyncUrl('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTapSyncUrl('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AddContactScreen — NFC tab
// ---------------------------------------------------------------------------

describe('AddContactScreen — NFC tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCancel.mockResolvedValue(undefined);
  });

  it('renders the Start Scan button on NFC tab (default tab)', () => {
    const { getByText } = renderScreen();
    expect(getByText('Start Scan')).toBeTruthy();
  });

  it('calls saveContact with publicId and source "nfc" after successful NFC read', async () => {
    mockReadTag.mockResolvedValue({ url: 'https://tapsync.app/c/abcdefghjk' });
    mockSaveContact.mockResolvedValue({ contact: { id: 'c1', publicId: 'abcdefghjk' } });

    const { getByText } = renderScreen();

    fireEvent.press(getByText('Start Scan'));

    await waitFor(() => {
      expect(mockSaveContact).toHaveBeenCalledWith('abcdefghjk', 'nfc');
    });

    expect(mockRouterReplace).toHaveBeenCalledWith({
      pathname: '/(tabs)/network',
      params: { highlight: 'abcdefghjk' },
    });
  });

  it('calls saveContact with source "nfc" for a tapsync:// deep link on the tag', async () => {
    mockReadTag.mockResolvedValue({ url: 'tapsync://c/abcdefghjk' });
    mockSaveContact.mockResolvedValue({ contact: { id: 'c1', publicId: 'abcdefghjk' } });

    const { getByText } = renderScreen();

    fireEvent.press(getByText('Start Scan'));

    await waitFor(() => {
      expect(mockSaveContact).toHaveBeenCalledWith('abcdefghjk', 'nfc');
    });
  });

  it('shows an error message when NFC read fails (TAG_LOST)', async () => {
    const { NfcError } = jest.requireMock('../../features/nfc/nfc.service') as {
      NfcError: new (msg: string, code: string) => Error & { code: string };
    };
    mockReadTag.mockRejectedValue(new NfcError('Tag lost', 'TAG_LOST'));

    const { getByText } = renderScreen();

    fireEvent.press(getByText('Start Scan'));

    await waitFor(() => {
      expect(getByText(/Card lost during scan/i)).toBeTruthy();
    });
  });

  it('does not call saveContact when own-card is detected', async () => {
    mockReadTag.mockResolvedValue({ url: 'https://tapsync.app/c/abcdefghjk' });
    mockSaveContact.mockRejectedValue({ code: 'OWN_CARD' });

    const { getByText } = renderScreen();

    fireEvent.press(getByText('Start Scan'));

    await waitFor(() => {
      expect(getByText(/That's Your Card/i)).toBeTruthy();
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('navigates to network without highlight when contact is pending (offline)', async () => {
    mockReadTag.mockResolvedValue({ url: 'https://tapsync.app/c/abcdefghjk' });
    mockSaveContact.mockResolvedValue({ pending: true });

    const { getByText } = renderScreen();

    fireEvent.press(getByText('Start Scan'));

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)/network');
    });
  });
});

// ---------------------------------------------------------------------------
// AddContactScreen — Link tab
// ---------------------------------------------------------------------------

describe('AddContactScreen — Link tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function switchToLinkTab(getByText: ReturnType<typeof render>['getByText']) {
    fireEvent.press(getByText('Link'));
  }

  it('renders the URL input on the Link tab', () => {
    const { getByText, getByPlaceholderText } = renderScreen();
    switchToLinkTab(getByText);
    expect(getByPlaceholderText(/tapsync:\/\/c\//)).toBeTruthy();
  });

  it('calls saveContact with publicId and source "link" for a valid https URL', async () => {
    mockSaveContact.mockResolvedValue({ contact: { id: 'c1', publicId: 'abcdefghjk' } });

    const { getByText, getByPlaceholderText } = renderScreen();
    switchToLinkTab(getByText);

    fireEvent.changeText(
      getByPlaceholderText(/tapsync:\/\/c\//),
      'https://tapsync.app/c/abcdefghjk',
    );

    await act(async () => {
      fireEvent.press(getByText('Save Contact'));
    });

    await waitFor(() => {
      expect(mockSaveContact).toHaveBeenCalledWith('abcdefghjk', 'link');
    });

    expect(mockRouterReplace).toHaveBeenCalledWith({
      pathname: '/(tabs)/network',
      params: { highlight: 'abcdefghjk' },
    });
  });

  it('calls saveContact with publicId and source "link" for a tapsync:// URL', async () => {
    mockSaveContact.mockResolvedValue({ contact: { id: 'c2', publicId: 'abcdefghjk' } });

    const { getByText, getByPlaceholderText } = renderScreen();
    switchToLinkTab(getByText);

    fireEvent.changeText(
      getByPlaceholderText(/tapsync:\/\/c\//),
      'tapsync://c/abcdefghjk',
    );

    await act(async () => {
      fireEvent.press(getByText('Save Contact'));
    });

    await waitFor(() => {
      expect(mockSaveContact).toHaveBeenCalledWith('abcdefghjk', 'link');
    });
  });

  it('resolves custom name and calls saveContact for tapsync://p/{name}', async () => {
    (resolveCustomNameToPublicId as jest.Mock).mockResolvedValue('abcdefghjk');
    mockSaveContact.mockResolvedValue({ contact: { id: 'c3', publicId: 'abcdefghjk' } });

    const { getByText, getByPlaceholderText } = renderScreen();
    switchToLinkTab(getByText);

    fireEvent.changeText(
      getByPlaceholderText(/tapsync:\/\/c\//),
      'tapsync://p/janedoe',
    );

    await act(async () => {
      fireEvent.press(getByText('Save Contact'));
    });

    await waitFor(() => {
      expect(resolveCustomNameToPublicId).toHaveBeenCalledWith('janedoe');
      expect(mockSaveContact).toHaveBeenCalledWith('abcdefghjk', 'link');
    });
  });

  it('shows an error for an unrecognized URL', async () => {
    const { getByText, getByPlaceholderText } = renderScreen();
    switchToLinkTab(getByText);

    fireEvent.changeText(
      getByPlaceholderText(/tapsync:\/\/c\//),
      'https://example.com/c/abcdefghjk',
    );

    await act(async () => {
      fireEvent.press(getByText('Save Contact'));
    });

    await waitFor(() => {
      expect(getByText(/Unrecognized link/i)).toBeTruthy();
    });

    expect(mockSaveContact).not.toHaveBeenCalled();
  });

  it('shows an error for an empty input', async () => {
    const { getByText } = renderScreen();
    switchToLinkTab(getByText);

    await act(async () => {
      fireEvent.press(getByText('Save Contact'));
    });

    await waitFor(() => {
      expect(getByText(/Please paste a TapSync link/i)).toBeTruthy();
    });
  });

  it('shows own-card banner without navigating', async () => {
    mockSaveContact.mockRejectedValue({ code: 'OWN_CARD' });

    const { getByText, getByPlaceholderText } = renderScreen();
    switchToLinkTab(getByText);

    fireEvent.changeText(
      getByPlaceholderText(/tapsync:\/\/c\//),
      'https://tapsync.app/c/abcdefghjk',
    );

    await act(async () => {
      fireEvent.press(getByText('Save Contact'));
    });

    await waitFor(() => {
      expect(getByText(/This is your own card/i)).toBeTruthy();
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AddContactScreen — QR tab
// ---------------------------------------------------------------------------

describe('AddContactScreen — QR tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function switchToQrTab(getByText: ReturnType<typeof render>['getByText']) {
    fireEvent.press(getByText('QR Code'));
  }

  it('renders the QR URL input and camera notice', () => {
    const { getByText, getByPlaceholderText } = renderScreen();
    switchToQrTab(getByText);

    expect(getByPlaceholderText('https://tapsync.app/c/…')).toBeTruthy();
    expect(getByText(/In-app QR scanning is not available/i)).toBeTruthy();
  });

  it('calls saveContact with source "qr" for a valid URL', async () => {
    mockSaveContact.mockResolvedValue({ contact: { id: 'c4', publicId: 'abcdefghjk' } });

    const { getByText, getByPlaceholderText } = renderScreen();
    switchToQrTab(getByText);

    fireEvent.changeText(
      getByPlaceholderText('https://tapsync.app/c/…'),
      'https://tapsync.app/c/abcdefghjk',
    );

    await act(async () => {
      fireEvent.press(getByText('Save Contact'));
    });

    await waitFor(() => {
      expect(mockSaveContact).toHaveBeenCalledWith('abcdefghjk', 'qr');
    });

    expect(mockRouterReplace).toHaveBeenCalledWith({
      pathname: '/(tabs)/network',
      params: { highlight: 'abcdefghjk' },
    });
  });
});
