-- Allow lorenzo.vanza@hotmail.com as admin (with existing ipsunlorem@gmail.com).

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT lower(email) = ANY (ARRAY[
      'ipsunlorem@gmail.com',
      'lorenzo.vanza@hotmail.com'
    ])
    FROM auth.users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.is_admin IS
  'Admin gate for RLS + get_admin_hl_dashboard(). Emails must match VITE_ADMIN_EMAILS on Vercel.';
