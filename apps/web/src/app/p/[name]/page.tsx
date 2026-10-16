// Custom-name public profile page: /p/[name]
// Handles current name (render) and retired name (308 redirect).
// Implemented fully in Task 13.
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ name: string }>;
}

export default async function CustomNameProfilePage({ params }: Props) {
  const { name } = await params;

  // TODO (Task 13): resolve name – render or redirect
  if (!name) notFound();

  return <div>Profile /{name} – coming in Task 13</div>;
}
