// Secret-protected revalidation webhook called by the API after any
// profile-affecting change. Implemented fully in Task 13.4.
import { revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-revalidation-secret');

  if (secret !== process.env['REVALIDATION_SECRET']) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as { tag?: string };
  if (!body.tag) {
    return NextResponse.json({ error: 'Missing tag' }, { status: 400 });
  }

  revalidateTag(body.tag);
  return NextResponse.json({ revalidated: true });
}
