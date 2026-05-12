import { NextResponse } from 'next/server';
import { VERSION_INFO } from '@/lib/version';

export const dynamic = 'force-static';
export const revalidate = false;

export async function GET() {
  return NextResponse.json(VERSION_INFO, {
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
  });
}
