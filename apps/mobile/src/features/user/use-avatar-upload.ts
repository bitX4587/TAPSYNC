/**
 * useAvatarUpload hook
 *
 * Opens the device image library, lets the user pick a photo, then uploads
 * it to POST /user/me/avatar as multipart/form-data.
 *
 * Requirements:
 *   2.5 — The system SHALL accept JPEG, PNG or WebP up to 5 MB, resize it,
 *          and store a CDN-served URL.
 *   2.6 — On success the profile cache is invalidated so the rest of the app
 *          reflects the new avatarUrl immediately.
 *
 * NOTE: This hook requires expo-image-picker. Add it to package.json with
 *   `pnpm add expo-image-picker --filter @tapsync/mobile`
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { uploadAvatar, type UserProfile } from './user.service';
import { USER_PROFILE_QUERY_KEY } from './use-user-profile';

export interface UseAvatarUploadResult {
  /**
   * Open the image library and upload the selected image.
   * Resolves when the upload is complete (or the user cancels).
   */
  pickAndUpload: () => Promise<void>;
  /** True while the upload is in flight. */
  isUploading: boolean;
  /**
   * Local URI of the currently selected image, shown as a preview
   * before (and during) upload.
   */
  previewUri: string | null;
  /** Any error that occurred during picking or uploading. */
  error: Error | null;
}

/**
 * Hook to pick a photo from the device library and upload it as the avatar.
 *
 * Example:
 *   const { pickAndUpload, isUploading, previewUri } = useAvatarUpload();
 *   // Show previewUri in an <Image> while isUploading is true.
 */
export function useAvatarUpload(): UseAvatarUploadResult {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const pickAndUpload = useCallback(async () => {
    setError(null);

    try {
      // Dynamically import expo-image-picker to avoid a hard crash when the
      // package is not yet installed. If it is missing, a clear error is
      // surfaced to the caller instead of a module-not-found exception at
      // startup.
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
      const ImagePicker = require('expo-image-picker') as any;

      // Request media library permissions first.
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        setError(new Error('Permission to access photo library was denied.'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        // Accept JPEG, PNG and WebP (Req 2.5)
        allowsMultipleSelection: false,
      });

      if (result.canceled || !result.assets?.length) {
        // User dismissed the picker — nothing to do.
        return;
      }

      const asset = result.assets[0];
      const uri = asset.uri;

      // Show the local image as a preview while uploading.
      setPreviewUri(uri);
      setIsUploading(true);

      // Derive filename and MIME type from the asset.
      const fileName = asset.fileName ?? uri.split('/').pop() ?? 'avatar.jpg';
      const mimeType = asset.mimeType ?? 'image/jpeg';

      const updatedProfile = await uploadAvatar(uri, fileName, mimeType);

      // Persist the server-confirmed profile (with the new avatarUrl) in cache.
      queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, updatedProfile);
    } catch (err) {
      const uploadError =
        err instanceof Error ? err : new Error('Avatar upload failed. Please try again.');
      setError(uploadError);
      // Clear the preview so the UI doesn't show a stale local image on error.
      setPreviewUri(null);
    } finally {
      setIsUploading(false);
    }
  }, [queryClient]);

  return { pickAndUpload, isUploading, previewUri, error };
}
