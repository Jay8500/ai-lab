-- The admin-users edge function (service role) may force-sign-out a user
grant execute on function public.admin_revoke_user_sessions(uuid) to service_role;
