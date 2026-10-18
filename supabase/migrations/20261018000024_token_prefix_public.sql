-- Token prefix is public (it is printed on every receipt) so the cover page can show a real example.
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
    'token_prefix', t.token_prefix,
    'pages', t.pages, 'test_catalog', t.test_catalog
  )
  from tenants t
  where (p_slug is not null and t.slug = lower(p_slug))
     or (p_domain is not null and t.custom_domain = lower(p_domain))
  limit 1;
$$;
