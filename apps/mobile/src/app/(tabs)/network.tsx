/**
 * My Network screen — saved contacts from taps, scans, and link captures.
 *
 * Features:
 *   - Search bar (debounced 300 ms) that filters contacts by name/designation
 *   - Pending sync banner: shows contact count + triggers manual sync on tap
 *   - FlatList of ContactRow items with pull-to-refresh
 *   - Empty states: loading skeleton, no contacts, no search results, error
 *   - Highlight: reads `highlight` param (publicId) and marks that row as isNew
 *   - useSyncPending mounted here to auto-drain on foreground
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.9, 12.10, 13.1
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { NetworkContactDto } from '@tapsync/shared';
import { useNetworkList, useSyncPending } from '../../features/network/use-network';
import { ContactRow } from '../../features/network/ContactRow';

// ---------------------------------------------------------------------------
// Skeleton row shown while loading
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <View style={styles.skeletonRow} accessibilityElementsHidden>
      <View style={styles.skeletonAvatar} />
      <View style={styles.skeletonContent}>
        <View style={[styles.skeletonLine, { width: '55%' }]} />
        <View style={[styles.skeletonLine, { width: '35%', height: 12 }]} />
        <View style={[styles.skeletonLine, { width: '25%', height: 10 }]} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  isLoading: boolean;
  isError: boolean;
  searchQuery: string;
}

function EmptyState({ isLoading, isError, searchQuery }: EmptyStateProps) {
  if (isLoading) {
    return (
      <View accessibilityLabel="Loading contacts">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Couldn't load contacts</Text>
      </View>
    );
  }

  if (searchQuery.trim()) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No contacts match '{searchQuery}'</Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No contacts yet</Text>
      <Text style={styles.emptyText}>
        Tap a TapSync card or scan a QR code to add someone.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function NetworkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ highlight?: string }>();
  const highlightPublicId = params.highlight ?? null;

  // Search state — update is debounced 300 ms before being sent to the hook
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((text: string) => {
    setSearchInput(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(text);
    }, 300);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Network data
  const { contacts, isLoading, isError, refetch, pendingCount } =
    useNetworkList(debouncedQuery || undefined);

  // Sync pending — mounted here so foreground events trigger auto-sync
  const { syncNow, isSyncing } = useSyncPending();

  // Pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  // Navigate to contact detail
  const handleContactPress = useCallback(
    (contact: NetworkContactDto) => {
      router.push({
        pathname: '/network/[id]',
        params: { id: contact.id, publicId: contact.publicId },
      } as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: NetworkContactDto }) => (
      <ContactRow
        contact={item}
        isNew={item.publicId === highlightPublicId}
        onPress={() => handleContactPress(item)}
      />
    ),
    [highlightPublicId, handleContactPress],
  );

  const keyExtractor = useCallback((item: NetworkContactDto) => item.id, []);

  const ItemSeparator = useCallback(
    () => <View style={styles.separator} />,
    [],
  );

  return (
    <View style={styles.container}>
      {/* ─── Inline header ───────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Network</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/network/add' as Parameters<typeof router.push>[0])}
          accessibilityRole="button"
          accessibilityLabel="Add contact"
          accessibilityHint="Manually add a new contact"
        >
          <Text style={styles.addButtonText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Search bar ──────────────────────────────────────────── */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={searchInput}
          onChangeText={handleSearchChange}
          placeholder="Search contacts…"
          placeholderTextColor="#9CA3AF"
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityRole="search"
          accessibilityLabel="Search contacts"
        />
      </View>

      {/* ─── Pending sync banner ─────────────────────────────────── */}
      {pendingCount > 0 && (
        <TouchableOpacity
          style={styles.pendingBanner}
          onPress={() => void syncNow()}
          accessibilityRole="button"
          accessibilityLabel={`${pendingCount} contact${pendingCount === 1 ? '' : 's'} pending sync. Tap to sync now.`}
        >
          <View style={styles.pendingDot} />
          <Text style={styles.pendingText}>
            {isSyncing
              ? 'Syncing…'
              : `${pendingCount} contact${pendingCount === 1 ? '' : 's'} pending sync`}
          </Text>
          {isSyncing && (
            <ActivityIndicator size="small" color="#C2410C" style={styles.syncSpinner} />
          )}
        </TouchableOpacity>
      )}

      {/* ─── Contact list ────────────────────────────────────────── */}
      {isLoading && contacts.length === 0 ? (
        <EmptyState isLoading={true} isError={false} searchQuery="" />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={ItemSeparator}
          onRefresh={handleRefresh}
          refreshing={isRefreshing}
          contentContainerStyle={
            contacts.length === 0 ? styles.emptyListContent : styles.listContent
          }
          ListEmptyComponent={
            <EmptyState
              isLoading={false}
              isError={isError}
              searchQuery={debouncedQuery}
            />
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 22,
    color: '#0066CC',
    lineHeight: 26,
  },

  // Search bar
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    padding: 0,
  },

  // Pending sync banner
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDBA74',
    gap: 8,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C2410C',
  },
  pendingText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#C2410C',
  },
  syncSpinner: {
    marginLeft: 4,
  },

  // List
  listContent: {
    paddingBottom: 24,
  },
  emptyListContent: {
    flex: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginLeft: 76, // indent past avatar
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Skeleton loading rows
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  skeletonAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E5E7EB',
    flexShrink: 0,
  },
  skeletonContent: {
    flex: 1,
    gap: 6,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E5E7EB',
  },
});
