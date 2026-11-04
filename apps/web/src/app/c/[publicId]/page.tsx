// Canonical public profile page: /c/[publicId]
// Uses ISR with cache tag `profile:{publicId}` and 60s fallback revalidation.
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchProfileByPublicId } from '@/lib/api';
import { ProfilePage } from '@/components/ProfilePage';

interface Props {
  params: Promise<{ publicId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicId } = await params;
  const result = await fetchProfileByPublicId(publicId);

  if (!result.success) {
    return {
      title: 'Profile Not Found',
    };
  }

  const { profile } = result;
  const displayName = profile.fullName || 'TapSync user';
  const description = profile.bio || `${displayName}'s TapSync profile`;
  const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] || 'https://tapsync.app';
  const canonicalUrl = `${siteUrl}/c/${publicId}`;

  return {
    title: displayName,
    description,
    openGraph: {
      title: displayName,
      description,
      type: 'profile',
      url: canonicalUrl,
      images: profile.avatarUrl ? [{ url: profile.avatarUrl }] : [],
    },
    twitter: {
      card: 'summary',
      title: displayName,
      description,
      images: profile.avatarUrl ? [profile.avatarUrl] : [],
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { publicId } = await params;

  if (!publicId) {
    notFound();
  }

  const result = await fetchProfileByPublicId(publicId);

  if (!result.success) {
    // 404 for non-existent, suspended, or deleted profiles
    if (result.status === 404 || result.status === 403) {
      notFound();
    }
    // For other errors (e.g., API down), we could show an error page
    // For now, we'll notFound() to show a user-friendly message
    notFound();
  }

  return <ProfilePage profile={result.profile} />;
}
