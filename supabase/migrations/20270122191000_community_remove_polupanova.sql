-- Remove community content authored by polupanova (seed cleanup).

DO $$
DECLARE
  bad_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO bad_ids
  FROM public.profiles
  WHERE coalesce(username, '') ~* 'polupanova'
     OR coalesce(full_name, '') ~* 'polupanova'
     OR coalesce(email, '') ~* 'polupanova';

  IF coalesce(array_length(bad_ids, 1), 0) = 0 THEN
    RAISE NOTICE 'no polupanova profile found';
    RETURN;
  END IF;

  DELETE FROM public.community_comments
  WHERE author_id = ANY (bad_ids);

  DELETE FROM public.community_posts
  WHERE author_id = ANY (bad_ids);

  RAISE NOTICE 'removed community content for % polupanova profile(s)', array_length(bad_ids, 1);
END $$;
