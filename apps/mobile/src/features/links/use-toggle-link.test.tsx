/**
 * Tests for useToggleLink hook
 *
 * Verifies optimistic update and rollback behaviour for the link
 * enable/disable toggle, following the same pattern as useModeToggle tests.
 *
 * Requirements: 3.5 (enable/disable)
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Mode } from '@tapsync/shared';
import { useToggleLink } from './use-toggle-link';
import { linksKeys } from './use-links';
import type { Link } from './link.service';
import * as linkService from './link.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('./link.service', () => ({
  fetchLinks: jest.fn(),
  createLink: jest.fn(),
  updateLink: jest.fn(),
  deleteLink: jest.fn(),
  reorderLinks: jest.fn(),
  moveCopyLink: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal Link fixture. */
function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    _id: 'link123',
    userId: 'user456',
    mode: Mode.Work,
    title: 'LinkedIn',
    url: 'https://linkedin.com/in/johndoe',
    icon: 'linkedin',
    category: 'linkedin',
    priorityOrder: 0,
    isEnabled: true,
    clickCount: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useToggleLink', () => {
  const queryKey = linksKeys.mode(Mode.Work);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Requirement 3.5 — optimistic update:
   * The link's isEnabled should flip immediately in the cache, before the
   * PATCH /links/:id response arrives.
   */
  it('applies the optimistic update before the request completes', async () => {
    // Arrange: cache has a single enabled link
    const queryClient = createTestQueryClient();
    const link = makeLink({ isEnabled: true });
    queryClient.setQueryData<Link[]>(queryKey, [link]);

    // The updateLink call never resolves during this test (we check state mid-flight)
    let resolveFn!: (value: Link) => void;
    (linkService.updateLink as jest.Mock).mockReturnValue(
      new Promise<Link>((resolve) => {
        resolveFn = resolve;
      }),
    );

    const { result } = renderHook(() => useToggleLink(), {
      wrapper: createWrapper(queryClient),
    });

    // Act: trigger the toggle and let onMutate run
    await act(async () => {
      result.current.toggleLink({ id: link._id, mode: Mode.Work, isEnabled: false });
    });

    // Assert: the cache already reflects the new state (optimistic)
    const cachedLinks = queryClient.getQueryData<Link[]>(queryKey);
    expect(cachedLinks?.[0]?.isEnabled).toBe(false);

    // Finish the pending request cleanly to avoid open handles
    await act(async () => {
      resolveFn(makeLink({ isEnabled: false }));
    });
  });

  /**
   * Requirement 3.5 — rollback on failure:
   * If PATCH /links/:id fails, the cache should revert to the previous state
   * and the onError callback should be called.
   */
  it('rolls back the optimistic update when the request fails', async () => {
    // Arrange: cache has an enabled link
    const queryClient = createTestQueryClient();
    const link = makeLink({ isEnabled: true });
    queryClient.setQueryData<Link[]>(queryKey, [link]);

    const networkError = new Error('Network error');
    (linkService.updateLink as jest.Mock).mockRejectedValue(networkError);

    const onError = jest.fn();

    const { result } = renderHook(() => useToggleLink({ onError }), {
      wrapper: createWrapper(queryClient),
    });

    // Act
    act(() => {
      result.current.toggleLink({ id: link._id, mode: Mode.Work, isEnabled: false });
    });

    // Wait for the mutation to fail and rollback
    await waitFor(() => {
      expect(result.current.isToggling).toBe(false);
    });

    // Assert: cache is back to enabled
    const cachedLinks = queryClient.getQueryData<Link[]>(queryKey);
    expect(cachedLinks?.[0]?.isEnabled).toBe(true);

    // Assert: error callback was called
    expect(onError).toHaveBeenCalledWith(networkError);
  });

  /**
   * Requirement 3.5 — error callback is not required:
   * When no onError handler is provided, a failing toggle should not throw.
   */
  it('does not throw when onError is not provided and request fails', async () => {
    const queryClient = createTestQueryClient();
    const link = makeLink({ isEnabled: true });
    queryClient.setQueryData<Link[]>(queryKey, [link]);

    (linkService.updateLink as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useToggleLink(), {
      wrapper: createWrapper(queryClient),
    });

    // Should not throw
    await expect(
      act(() => {
        result.current.toggleLink({ id: link._id, mode: Mode.Work, isEnabled: false });
      }),
    ).resolves.not.toThrow();

    await waitFor(() => {
      expect(result.current.isToggling).toBe(false);
    });

    // Cache should still be rolled back
    const cachedLinks = queryClient.getQueryData<Link[]>(queryKey);
    expect(cachedLinks?.[0]?.isEnabled).toBe(true);
  });

  /**
   * Requirement 3.5 — calls updateLink with the correct arguments.
   * The mutation calls updateLink(id, { isEnabled }).
   */
  it('calls updateLink with the link id and new isEnabled value', async () => {
    const queryClient = createTestQueryClient();
    const link = makeLink({ isEnabled: true, _id: 'abc789' });
    queryClient.setQueryData<Link[]>(queryKey, [link]);

    (linkService.updateLink as jest.Mock).mockResolvedValue(makeLink({ isEnabled: false }));

    const { result } = renderHook(() => useToggleLink(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.toggleLink({ id: 'abc789', mode: Mode.Work, isEnabled: false });
    });

    await waitFor(() => {
      expect(result.current.isToggling).toBe(false);
    });

    expect(linkService.updateLink).toHaveBeenCalledWith('abc789', { isEnabled: false });
  });

  it('sets isToggling to true while the request is in flight', async () => {
    const queryClient = createTestQueryClient();
    const link = makeLink();
    queryClient.setQueryData<Link[]>(queryKey, [link]);

    let resolveFn!: (value: Link) => void;
    (linkService.updateLink as jest.Mock).mockReturnValue(
      new Promise<Link>((resolve) => {
        resolveFn = resolve;
      }),
    );

    const { result } = renderHook(() => useToggleLink(), {
      wrapper: createWrapper(queryClient),
    });

    // Trigger the toggle without awaiting so we can check the in-flight state
    act(() => {
      result.current.toggleLink({ id: link._id, mode: Mode.Work, isEnabled: false });
    });

    // While in flight, isToggling should be true
    await waitFor(() => {
      expect(result.current.isToggling).toBe(true);
    });

    // Resolve and confirm it goes back to false
    await act(async () => {
      resolveFn(makeLink({ isEnabled: false }));
    });

    await waitFor(() => {
      expect(result.current.isToggling).toBe(false);
    });
  });

  /**
   * Optimistic update should only affect the toggled link when multiple
   * links exist in the cache.
   */
  it('only updates the targeted link when multiple links are cached', async () => {
    const queryClient = createTestQueryClient();
    const linkA = makeLink({ _id: 'aaa', isEnabled: true });
    const linkB = makeLink({ _id: 'bbb', isEnabled: true, title: 'GitHub' });
    queryClient.setQueryData<Link[]>(queryKey, [linkA, linkB]);

    let resolveFn!: (value: Link) => void;
    (linkService.updateLink as jest.Mock).mockReturnValue(
      new Promise<Link>((resolve) => {
        resolveFn = resolve;
      }),
    );

    const { result } = renderHook(() => useToggleLink(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.toggleLink({ id: 'bbb', mode: Mode.Work, isEnabled: false });
    });

    const cachedLinks = queryClient.getQueryData<Link[]>(queryKey);
    expect(cachedLinks?.[0]?.isEnabled).toBe(true); // linkA unchanged
    expect(cachedLinks?.[1]?.isEnabled).toBe(false); // linkB toggled

    await act(async () => {
      resolveFn(makeLink({ _id: 'bbb', isEnabled: false }));
    });
  });
});
