/**
 * Tests for LinkFormModal
 *
 * Covers:
 * - URL validation logic (valid / invalid schemes) — Requirement 3.2
 * - Create flow calls createLink with the correct DTO — Requirement 3.1
 * - Edit flow calls updateLink with the correct DTO — Requirement 3.3
 * - Delete shows a confirmation alert — Requirement 3.6
 *
 * Requirements: 3.1–3.8
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Mode } from '@tapsync/shared';
import { LinkFormModal, validateLinkUrl } from './link-form-modal';
import * as linkService from './link.service';
import type { Link } from './link.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the link service so the React Query mutations call spies we control.
jest.mock('./link.service', () => ({
  fetchLinks: jest.fn(),
  createLink: jest.fn(),
  updateLink: jest.fn(),
  deleteLink: jest.fn(),
  reorderLinks: jest.fn(),
  moveCopyLink: jest.fn(),
}));

// Spy on Alert.alert so we can assert confirmation dialogs.
const alertSpy = jest.spyOn(Alert, 'alert');

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

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    _id: 'link-1',
    userId: 'user-1',
    mode: Mode.Work,
    title: 'My Website',
    url: 'https://example.com',
    icon: 'globe',
    category: 'portfolio',
    priorityOrder: 0,
    isEnabled: true,
    clickCount: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderModal(props: React.ComponentProps<typeof LinkFormModal>) {
  const queryClient = createTestQueryClient();
  const utils = render(
    <LinkFormModal {...props} />,
    { wrapper: createWrapper(queryClient) },
  );
  return { ...utils, queryClient };
}

// ---------------------------------------------------------------------------
// URL validation (pure function)
// ---------------------------------------------------------------------------

describe('validateLinkUrl', () => {
  it('accepts https URLs', () => {
    expect(validateLinkUrl('https://example.com')).toBeNull();
  });

  it('accepts http URLs', () => {
    expect(validateLinkUrl('http://example.com')).toBeNull();
  });

  it('accepts mailto URLs', () => {
    expect(validateLinkUrl('mailto:hello@example.com')).toBeNull();
  });

  it('accepts tel URLs', () => {
    expect(validateLinkUrl('tel:+15551234567')).toBeNull();
  });

  it('rejects empty input as required', () => {
    expect(validateLinkUrl('')).toBe('URL is required');
    expect(validateLinkUrl('   ')).toBe('URL is required');
  });

  it('rejects disallowed schemes (ftp)', () => {
    expect(validateLinkUrl('ftp://example.com')).toMatch(/must use one of/);
  });

  it('rejects disallowed schemes (javascript)', () => {
    expect(validateLinkUrl('javascript:alert(1)')).toMatch(/must use one of/);
  });

  it('rejects a bare domain without a scheme', () => {
    expect(validateLinkUrl('example.com')).toBe('Invalid URL format');
  });
});

// ---------------------------------------------------------------------------
// Create flow
// ---------------------------------------------------------------------------

describe('LinkFormModal — create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (linkService.createLink as jest.Mock).mockResolvedValue(makeLink());
  });

  it('calls createLink with the correct DTO on submit', async () => {
    const onClose = jest.fn();
    const { getByLabelText, getByText } = renderModal({
      visible: true,
      onClose,
      mode: Mode.Work,
      editingLink: null,
    });

    // Fill in the title
    fireEvent.changeText(getByLabelText('Link title'), 'Portfolio Site');

    // Fill in the URL
    fireEvent.changeText(getByLabelText('Link URL'), 'https://portfolio.dev');

    // Submit
    fireEvent.press(getByText('Add link'));

    await waitFor(() => {
      expect(linkService.createLink).toHaveBeenCalledTimes(1);
    });

    // The DTO should include title, url, mode, category and an auto icon.
    const dto = (linkService.createLink as jest.Mock).mock.calls[0][0];
    expect(dto.title).toBe('Portfolio Site');
    expect(dto.url).toBe('https://portfolio.dev');
    expect(dto.mode).toBe(Mode.Work);
    expect(dto.category).toBe('linkedin'); // default category
    expect(dto.icon).toBeDefined();

    // On success the modal closes.
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a URL error and does not call createLink for an invalid scheme', () => {
    const onClose = jest.fn();
    const { getByLabelText, getByText } = renderModal({
      visible: true,
      onClose,
      mode: Mode.Casual,
      editingLink: null,
    });

    fireEvent.changeText(getByLabelText('Link title'), 'Bad link');
    fireEvent.changeText(getByLabelText('Link URL'), 'ftp://example.com');

    fireEvent.press(getByText('Add link'));

    expect(linkService.createLink).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call createLink when the title is empty', () => {
    const { getByLabelText, getByText } = renderModal({
      visible: true,
      onClose: jest.fn(),
      mode: Mode.Work,
      editingLink: null,
    });

    fireEvent.changeText(getByLabelText('Link URL'), 'https://example.com');
    fireEvent.press(getByText('Add link'));

    expect(linkService.createLink).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Edit flow
// ---------------------------------------------------------------------------

describe('LinkFormModal — edit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (linkService.updateLink as jest.Mock).mockResolvedValue(makeLink());
    (linkService.deleteLink as jest.Mock).mockResolvedValue(undefined);
  });

  it('pre-fills fields from the editing link', () => {
    const link = makeLink({ title: 'My Site', url: 'https://site.dev', category: 'portfolio' });

    const { getByLabelText, getByText } = renderModal({
      visible: true,
      onClose: jest.fn(),
      mode: Mode.Work,
      editingLink: link,
    });

    expect((getByLabelText('Link title') as unknown as { props: { value: string } }).props.value).toBe('My Site');
    expect((getByLabelText('Link URL') as unknown as { props: { value: string } }).props.value).toBe('https://site.dev');

    // Edit mode shows a Save button (not Add link).
    expect(getByText('Save')).toBeTruthy();
  });

  it('calls updateLink with the correct DTO on save', async () => {
    const link = makeLink({ _id: 'link-42', category: 'portfolio' });
    const onClose = jest.fn();

    const { getByLabelText, getByText } = renderModal({
      visible: true,
      onClose,
      mode: Mode.Work,
      editingLink: link,
    });

    fireEvent.changeText(getByLabelText('Link title'), 'Updated Title');
    fireEvent.changeText(getByLabelText('Link URL'), 'https://updated.dev');

    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(linkService.updateLink).toHaveBeenCalledTimes(1);
    });

    const args = (linkService.updateLink as jest.Mock).mock.calls[0][0];
    expect(args.id).toBe('link-42');
    expect(args.dto.title).toBe('Updated Title');
    expect(args.dto.url).toBe('https://updated.dev');

    expect(onClose).toHaveBeenCalled();
  });

  it('shows a delete confirmation alert and deletes on confirm', async () => {
    const link = makeLink({ _id: 'link-99' });
    const onClose = jest.fn();

    const { getByLabelText } = renderModal({
      visible: true,
      onClose,
      mode: Mode.Work,
      editingLink: link,
    });

    // Press the delete button.
    fireEvent.press(getByLabelText('Delete link'));

    // An alert should have been shown.
    expect(alertSpy).toHaveBeenCalled();
    const lastCall = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    expect(lastCall).toBeDefined();
    const alertCall = lastCall!;
    const buttons = alertCall[2] as Array<{
      text: string;
      style?: string;
      onPress?: () => void;
    }>;

    // Find the destructive Delete button and press it.
    const deleteButton = buttons.find((b) => b.text === 'Delete');
    expect(deleteButton).toBeDefined();

    await act(async () => {
      deleteButton!.onPress?.();
    });

    await waitFor(() => {
      expect(linkService.deleteLink).toHaveBeenCalledWith('link-99');
    });

    expect(onClose).toHaveBeenCalled();
  });
});
