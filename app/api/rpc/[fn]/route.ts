import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseServer';

// Every mutation is a Postgres function that authorizes itself (host_secret /
// player_secret params) — this route is a dumb, uniform pipe to them using
// the service-role key. No per-route logic needed since the DB is the
// authority boundary, not this handler.
const ALLOWED = new Set([
  'create_room',
  'join_room',
  'get_session',
  'leave_room',
  'change_name',
  'set_ready',
  'update_settings',
  'start_round',
  'record_press',
  'judge_round',
  'abort_round',
  'next_round',
  'get_host_state',
  'define_teams',
  'team_login',
]);

export async function POST(req: NextRequest, context: { params: Promise<{ fn: string }> }) {
  const { fn } = await context.params;
  if (!ALLOWED.has(fn)) {
    return NextResponse.json({ error: 'Unknown operation' }, { status: 404 });
  }

  // Serverless has no per-connection memory, so the counter lives in Postgres.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { data: allowed } = await getSupabase().rpc('check_rate', {
    p_bucket: `rpc:${ip}`,
    p_limit: 120,
    p_window_seconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));

  // team_login guesses a 4-digit pin — a script could exhaust the 10,000
  // combinations fast without a tighter cap than the generic rpc bucket.
  // Scoped by both IP (one guesser) and room (one target), so a burst of
  // real teams logging in at once from different devices is unaffected.
  if (fn === 'team_login') {
    const [{ data: ipOk }, { data: roomOk }] = await Promise.all([
      getSupabase().rpc('check_rate', { p_bucket: `pin:${ip}`, p_limit: 5, p_window_seconds: 60 }),
      getSupabase().rpc('check_rate', { p_bucket: `pin:room:${body?.p_code ?? ''}`, p_limit: 30, p_window_seconds: 60 }),
    ]);
    if (!ipOk || !roomOk) {
      return NextResponse.json({ error: 'Too many attempts — wait a minute and try again' }, { status: 429 });
    }
  }

  const { data, error } = await getSupabase().rpc(fn, body);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
