import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3004';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ npi: string }> }
) {
  const { npi } = await params;
  const authHeader = request.headers.get('authorization');

  // Determine if this is a preview or full request
  const isPreview = request.nextUrl.searchParams.get('preview') === 'true';
  const endpoint = isPreview
    ? `${API_URL}/oral/briefing/${npi}/preview`
    : `${API_URL}/oral/briefing/${npi}`;

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(endpoint, { headers });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Request failed' }));
      return NextResponse.json(error, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
