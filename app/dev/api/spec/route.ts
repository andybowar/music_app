import { NextResponse } from 'next/server';

import { isDevGalleryEnabled } from '@/lib/devGallery';
import { env } from '@/lib/env';

import { patchPostgrestSpec, type SwaggerSpec } from '../patchSpec';

export const dynamic = 'force-dynamic';

/** The Supabase REST API's OpenAPI spec, with its host fixed for Swagger UI. */
export async function GET() {
  if (!isDevGalleryEnabled()) return new NextResponse('Not found', { status: 404 });

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Supabase returned ${res.status}. Is it running? Try \`pnpm db:start\`.` },
        { status: 502 },
      );
    }
    const spec = (await res.json()) as SwaggerSpec;
    return NextResponse.json(patchPostgrestSpec(spec, supabaseUrl));
  } catch {
    return NextResponse.json(
      { error: `Couldn't reach Supabase at ${supabaseUrl}. Start it with \`pnpm db:start\`.` },
      { status: 502 },
    );
  }
}
