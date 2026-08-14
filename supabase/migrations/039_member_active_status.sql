-- ============================================================
-- 039_member_active_status.sql — enable/disable member access
--
-- Adds `is_active` to profiles (default true) so an admin+ can
-- suspend a teammate's access to the account WITHOUT removing
-- them (remove_account_member spins them off into a fresh
-- personal account, which is a much bigger, irreversible-feeling
-- action). A disabled member keeps their login and profile row,
-- but every server-side account-context read (getCurrentAccount /
-- requireRole, used by virtually every API route) throws
-- ForbiddenError for them, and the page middleware bounces them to
-- /account-disabled.
--
-- Mirrors the set_member_role RPC pattern from migration 018:
-- caller must be admin+, can't target self, can't target the
-- owner, target must be in caller's account.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.set_member_active(
    p_user_id UUID,
    p_is_active BOOLEAN
  ) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own access'
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role
  INTO v_target_account_id, v_target_role
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot disable the account owner'
      USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
  SET is_active = p_is_active
  WHERE user_id = p_user_id;
END;
$$;

ALTER FUNCTION public.set_member_active(UUID, BOOLEAN) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_member_active(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_member_active(UUID, BOOLEAN) TO authenticated;
