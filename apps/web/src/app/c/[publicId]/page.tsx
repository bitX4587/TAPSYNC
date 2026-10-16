// Canonical public profile page: /c/[publicId]
// Implemented fully in Task 13.
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ publicId: string }>;
}

export default async function PublicProfilePage({ params }: Props) {
  const { publicId } = await params;

  // TODO (Task 13): fetch profile and render
  if (!publicId) notFound();

  return <div>Profile {publicId} – coming in Task 13</div>;
}
