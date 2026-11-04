/**
 * Tests for useReorderLinks hook
 *
 * Verifies optimistic reorder and rollback behaviour, following the same
 * pattern as useToggleLink tests.
 *
 * Requirements: 3.4 (reorder persist atomically), 3.3 (persist + invalidate)
 * Validates: Requirements 3.4
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Mode } from '@tapsync/shared';
import { useReorderLinks } from './use-reorder-links';
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
    _id: 'link1',
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

describe('useReorderLinks', () => {
  const queryKey = linksKeys.mode(Mode.Work);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Requirement 3.4 — optimistic update:
   * The cache should reflect the new order immediately, before the
   * PUT /links/reorder response arrives.
   */
  it('applies the optimistic reorder before the request completes', async () => {
    // Arrange: cache has links in order [A, B, C]
    const queryClient = createTestQueryClient();
    const linkA = makeLink({ _id: 'aaa', priorityOrder: 0 });
    const linkB = makeLink({ _id: 'bbb', priorityOrder: 1, title: 'GitHub' });
    const linkC = makeLink({ _id: 'ccc', priorityOrder: 2, title: 'Portfolio' });
    queryClient.setQueryData<Link[]>(queryKey, [linkA, linkB, linkC]);

    // The reorderLinks call never resolves during this test (we check state mid-flight)
    let resolveFn!: (value: void) => void;
    (linkService.reorderLinks as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveFn = resolve;
      }),
    );

    const { result } = renderHook(() => useReorderLinks(), {
      wrapper: createWrapper(queryClient),
    });

    // Act: reorder to [B, A, C] and let onMutate run
    await act(async () => {
      result.current.reorderLinks(Mode.Work, ['bbb', 'aaa', 'ccc']);
    });

    // Assert: the cache already reflects the new order (optimistic)
    const cachedLinks = queryClient.getQueryData<Link[]>(queryKey);
    expect(cachedLinks?.[0]?._id).toBe('bbb');
    expect(cachedLinks?.[1]?._id).toBe('aaa');
    expect(cachedLinks?.[2]?._id).toBe('ccc');

    // priorityOrder should be updated to match the new positions
    expect(cachedLinks?.[0]?.priorityOrder).toBe(0);
    expect(cachedLinks?.[1]?.priorityOrder).toBe(1);
    expect(cachedLinks?.[2]?.priorityOrder).toBe(2);

    // Finish the pending request cleanly to avoid open handles
    await act(async () => {
      resolveFn();
    });
  });

  /**
   * Requirement 3.4 — rollback on failure:
   * If PUT /links/reorder fails, the cache should revert to the previous order
   * and the onError callback should be called.
   */
  it('rolls back the optimistic reorder when the request fails', async () => {
    // Arrange: cache has links in order [A, B]
    const queryClient = createTestQueryClient();
    const linkA = makeLink({ _id: 'aaa', priorityOrder: 0 });
    const linkB = makeLink({ _id: 'bbb', priorityOrder: 1, title: 'GitHub' });
    queryClient.setQueryData<Link[]>(queryKey, [linkA, linkB]);

    const networkError = new Error('Network error');
    (linkService.reorderLinks as jest.Mock).mockRejectedValue(networkError);

    const onError = jest.fn();

    const { result } = renderHook(() => useReorderLinks({ onError }), {
      wrapper: createWrapper(queryClient),
    });

    // Act: reorder to [B, A]
    act(() => {
      result.current.reorderLinks(Mode.Work, ['bbb', 'aaa']);
    });

    // Wait for the mutation to fail and rollback
    await waitFor(() => {
      expect(result.current.isReordering).toBe(false);
    });

    // Assert: cache is back to [A, B]
    const cachedLinks = queryClient.getQueryData<Link[]>(queryKey);
    expect(cachedLinks?.[0]?._id).toBe('aaa');
    expect(cachedLinks?.[1]?._id).toBe('bbb');

    // Assert: error callback was called
    expect(onError).toHaveBeenCalledWith(networkError);
  });

  /**
   * Requirement 3.4 — error callback is not required:
   * When no onError handler is provided, a failing reorder should not throw.
   */
  it('does not throw when onError is not provided and request fails', async () => {
    const queryClient = createTestQueryClient();
    const linkA = makeLink({ _id: 'aaa', priorityOrder: 0 });
    const linkB = makeLink({ _id: 'bbb', priorityOrder: 1, title: 'GitHub' });
    queryClient.setQueryData<Link[]>(queryKey, [linkA, linkB]);

    (linkService.reorderLinks as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useReorderLinks(), {
      wrapper: createWrapper(queryClient),
    });

    // Should not throw
    await expect(
      act(() => {
        result.current.reorderLinks(Mode.Work, ['bbb', 'aaa']);
      }),
    ).resolves.not.toThrow();

    await waitFor(() => {
      expect(result.current.isReordering).toBe(false);
    });

    // Cache should still be rolled back
    const cachedLinks = queryClient.getQueryData<Link[]>(queryKey);
    expect(cachedLinks?.[0]?._id).toBe('aaa');
    expect(cachedLinks?.[1]?._id).toBe('bbb');
  });

  /**
   * Requirement 3.4 — calls reorderLinks service with the correct arguments.
   * The mutation calls reorderLinks({ mode, orderedIds }).
   */
  it('calls reorderLinks service with mode and orderedIds', async () => {
    const queryClient = createTestQueryClient();
    const linkA = makeLink({ _id: 'aaa', priorityOrder: 0 });
    const linkB = makeLink({ _id: 'bbb', priorityOrder: 1, title: 'GitHub' });
    queryClient.setQueryData<Link[]>(queryKey, [linkA, linkB]);

    (linkService.reorderLinks as jest.Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useReorderLinks(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.reorderLinks(Mode.Work, ['bbb', 'aaa']);
    });

    await waitFor(() => {
      expect(result.current.isReordering).toBe(false);
    });

    expect(linkService.reorderLinks).toHaveBeenCalledWith({
      mode: Mode.Work,
      orderedIds: ['bbb', 'aaa'],
    });
  });

  it('sets isReordering to true while the request is in flight', async () => {
    const queryClient = createTestQueryClient();
    const linkA = makeLink({ _id: 'aaa', priorityOrder: 0 });
    const linkB = makeLink({ _id: 'bbb', priorityOrder: 1, title: 'GitHub' });
    queryClient.setQueryData<Link[]>(queryKey, [linkA, linkB]);

    let resolveFn!: (value: void) => void;
    (linkService.reorderLinks as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveFn = resolve;
      }),
    );

    const { result } = renderHook(() => useReorderLinks(), {
      wrapper: createWrapper(queryClient),
    });

    // Trigger the reorder without awaiting so we can check the in-flight state
    act(() => {
      result.current.reorderLinks(Mode.Work, ['bbb', 'aaa']);
    });

    // While in flight, isReordering should be true
    await waitFor(() => {
      expect(result.current.isReordering).toBe(true);
    });

    // Resolve and confirm it goes back to false
    await act(async () => {
      resolveFn();
    });

    await waitFor(() => {
      expect(result.current.isReordering).toBe(false);
    });
  });

  /**
   * Requirement 3.4 — optimistic update only reorders the targeted mode's
   * cache, leaving other modes untouched.
   */
  it('only reorders the targeted mode cache, not other modes', async () => {
    const queryClient = createTestQueryClient();
    const workKey = linksKeys.mode(Mode.Work);
    const casualKey = linksKeys.mode(Mode.Casual);

    const workA = makeLink({ _id: 'aaa', mode: Mode.Work, priorityOrder: 0 });
    const workB = makeLink({ _id: 'bbb', mode: Mode.Work, priorityOrder: 1, title: 'GitHub' });
    const casualA = makeLink({ _id: 'xxx', mode: Mode.Casual, priorityOrder: 0 });
    const casualB = makeLink({ _id: 'yyy', mode: Mode.Casual, priorityOrder: 1, title: 'GitHub' });

    queryClient.setQueryData<Link[]>(workKey, [workA, workB]);
    queryClient.setQueryData<Link[]>(casualKey, [casualA, casualB]);

    let resolveFn!: (value: void) => void;
    (linkService.reorderLinks as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveFn = resolve;
      }),
    );

    const { result } = renderHook(() => useReorderLinks(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.reorderLinks(Mode.Work, ['bbb', 'aaa']);
    });

    // Work cache is reordered
    const cachedWork = queryClient.getQueryData<Link[]>(workKey);
    expect(cachedWork?.[0]?._id).toBe('bbb');
    expect(cachedWork?.[1]?._id).toBe('aaa');

    // Casual cache is untouched
    const cachedCasual = queryClient.getQueryData<Link[]>(casualKey);
    expect(cachedCasual?.[0]?._id).toBe('xxx');
    expect(cachedCasual?.[1]?._id).toBe('yyy');

    await act(async () => {
      resolveFn();
    });
  });
});
