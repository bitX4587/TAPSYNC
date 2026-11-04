/**
 * vCard download route: GET /c/[publicId]/vcard
 * 
 * Requirements 6.1-6.5: vCard download with proper headers
 * 
 * This route proxies the vCard from the backend API and ensures
 * proper Content-Type and Content-Disposition headers are set.
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env['TAPSYNC_API_URL'] || 'http://localhost:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await params;

  try {
    // Fetch vCard from backend API
    const response = await fetch(
      `${API_URL}/public/profiles/c/${publicId}/vcard`,
      {
        headers: {
          // Forward any relevant headers if needed
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to generate vCard' },
        { status: response.status }
      );
    }

    // Get vCard content
    const vcardContent = await response.text();

    // Get the Content-Disposition header from API response
    const contentDisposition = response.headers.get('Content-Disposition');

    // Return vCard with proper headers
    return new NextResponse(vcardContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/vcard; charset=utf-8',
        'Content-Disposition':
          contentDisposition || `attachment; filename="${publicId}.vcf"`,
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });
  } catch (error) {
    console.error('Error fetching vCard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
