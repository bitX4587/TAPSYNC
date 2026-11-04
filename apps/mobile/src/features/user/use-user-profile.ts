/**
 * useUserProfile hook
 *
 * Fetches the authenticated user's profile via React Query.
 * This is the source of truth for the Active Mode displayed in the app.
 *
 * Requirements: 4.4
 */

import { useQuery } from '@tanstack/react-query';
import { fetchUserProfile, type UserProfile } from './user.service';

export const USER_PROFILE_QUERY_KEY = ['user', 'profile'] as const;

/**
 * React Query hook to read the current user's profile.
 *
 * Usage:
 *   const { data: profile, isLoading } = useUserProfile();
 */
export function useUserProfile() {
  return useQuery<UserProfile>({
    queryKey: USER_PROFILE_QUERY_KEY,
    queryFn: fetchUserProfile,
    // Profile data stays fresh for 2 minutes; background refetch keeps it current.
    staleTime: 2 * 60 * 1000,
  });
}
