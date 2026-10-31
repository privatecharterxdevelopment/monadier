-- Harden is_admin() email resolution (JWT email, user_metadata, auth.users).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  v_email := lower(trim(coalesce(
    auth.jwt() ->> 'email',
    auth.jwt() -> 'user_metadata' ->> 'email',
    ''
  )));

  IF v_email = '' THEN
    SELECT lower(trim(coalesce(u.email, p.email, '')))
    INTO v_email
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = v_uid;
  END IF;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN false;
  END IF;

  RETURN v_email = ANY (ARRAY[
    'ipsunlorem@gmail.com',
    'lorenzo.vanza@hotmail.com'
  ]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

COMMENT ON FUNCTION public.is_admin IS
  'Admin gate for RLS + admin RPCs. Keep emails in sync with VITE_ADMIN_EMAILS.';
