-- The modulo on a random byte biases the low end of the alphabet slightly
-- (256 is not a multiple of the alphabet length). Reject bytes past the
-- last full multiple instead of wrapping them in, for a uniform draw.
create or replace function public.generate_room_code()
 returns text
 language plpgsql
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I/L
  alen integer := length(alphabet);
  limit_byte integer := (256 / alen) * alen; -- reject bytes at/above this
  code text := '';
  b integer;
begin
  while length(code) < 6 loop
    b := get_byte(gen_random_bytes(1), 0);
    if b < limit_byte then
      code := code || substr(alphabet, (b % alen) + 1, 1);
    end if;
  end loop;
  return code;
end;
$function$
