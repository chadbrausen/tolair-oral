import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3004';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get('q');
  const specialty = searchParams.get('specialty');
  const state = searchParams.get('state');
  const limit = searchParams.get('limit');

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], count: 0, query: q });
  }

  try {
    const params = new URLSearchParams({ q });
    if (specialty) params.set('specialty', specialty);
    if (state) params.set('state', state);
    if (limit) params.set('limit', limit);

    const res = await fetch(`${API_URL}/oral/search?${params}`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json({ results: [], count: 0, query: q, error: 'Search failed' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ results: [], count: 0, query: q, error: 'Service unavailable' }, { status: 503 });
  }
}
