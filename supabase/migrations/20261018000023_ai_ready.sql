-- AI features appear only when the lab has an AI key (never exposes the key itself).
create or replace function public.tenant_has_ai_key(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public, vault as $$
  select exists (select 1 from vault.decrypted_secrets
                 where name = 'tenant/' || p_tenant || '/ai_api_key' and coalesce(trim(decrypted_secret), '') <> '');
$$;
revoke all on function public.tenant_has_ai_key(uuid) from public, anon, authenticated;

create or replace function public.resolve_tenant(p_slug text default null, p_domain text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'name', t.name, 'tagline', t.tagline,
    'logo_url', t.logo_url, 'favicon_url', t.favicon_url, 'cover_url', t.cover_url,
    'brand_color', t.brand_color, 'accent_color', t.accent_color,
    'contact_phone', t.contact_phone, 'contact_email', t.contact_email,
    'whatsapp_number', t.whatsapp_number, 'address', t.address,
    'status', t.status, 'trial_ends_at', t.trial_started_at + make_interval(days => t.trial_days),
    'usable', public.tenant_is_usable(t.id),
    'block_reason', public.tenant_block_reason(t.id),
    'ai_ready', public.tenant_has_ai_key(t.id),
    'pages', t.pages, 'test_catalog', t.test_catalog
  )
  from tenants t
  where (p_slug is not null and t.slug = lower(p_slug))
     or (p_domain is not null and t.custom_domain = lower(p_domain))
  limit 1;
$$;
