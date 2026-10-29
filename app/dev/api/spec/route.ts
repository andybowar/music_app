import { NextResponse } from 'next/server';

import { isDevGalleryEnabled } from '@/lib/devGallery';
import { patchPostgrestSpec, type SwaggerSpec } from '../patchSpec';
import { NOT_CONFIGURED, readSupabaseConfig } from '../supabaseConfig';

export const dynamic = 'force-dynamic';

/** The Supabase REST API's OpenAPI spec, with its host fixed for Swagger UI. */
export async function GET() {
  if (!isDevGalleryEnabled()) return new NextResponse('Not found', { status: 404 });

  const supabase = readSupabaseConfig();
  if (!supabase) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  const supabaseUrl = supabase.url;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { apikey: supabase.anonKey },
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
