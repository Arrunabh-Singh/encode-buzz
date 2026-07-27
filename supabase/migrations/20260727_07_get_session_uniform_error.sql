-- R19: "Room not found" vs "Session expired" let a caller distinguish a
-- dead code from a dead secret — an enumeration oracle for room codes.
-- One message for both failure modes closes it.
create or replace function public.get_session(p_code text, p_secret text)
 returns jsonb
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_room rooms%rowtype;
  v_player players%rowtype;
begin
  select * into v_room from rooms where code = p_code;
  if not found then
    return jsonb_build_object('error', 'Session expired');
  end if;
  if v_room.host_secret = p_secret then
    return jsonb_build_object('role', 'host');
  end if;
  select * into v_player from players where room_code = p_code and secret = p_secret;
  if found then
    return jsonb_build_object('role', 'player', 'name', v_player.name);
  end if;
  return jsonb_build_object('error', 'Session expired');
end;
$function$
