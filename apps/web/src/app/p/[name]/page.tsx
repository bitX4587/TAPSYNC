// Custom-name public profile page: /p/[name]
// Handles current name (render) and retired name (308 redirect).
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchProfileByCustomName } from '@/lib/api';
import { ProfilePage } from '@/components/ProfilePage';

interface Props {
  params: Promise<{ name: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const result = await fetchProfileByCustomName(name);

  if (!result.success || result.redirectTo) {
    return {
      title: 'Profile Not Found',
    };
  }

  const { profile } = result;
  const displayName = profile.fullName || 'TapSync user';
  const description = profile.bio || `${displayName}'s TapSync profile`;
  const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] || 'https://tapsync.app';
  // Canonical URL always points to /c/{publicId}
  const canonicalUrl = `${siteUrl}/c/${profile.publicId}`;

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

export default async function CustomNameProfilePage({ params }: Props) {
  const { name } = await params;

  if (!name) {
    notFound();
  }

  const result = await fetchProfileByCustomName(name);

  if (!result.success) {
    // 404 for non-existent, suspended, or deleted profiles
    if (result.status === 404 || result.status === 403) {
      notFound();
    }
    // For other errors (e.g., API down), notFound()
    notFound();
  }

  // If this is a retired name, issue a permanent redirect (308)
  if (result.redirectTo) {
    redirect(`/c/${result.redirectTo}`);
  }

  return <ProfilePage profile={result.profile} />;
}
