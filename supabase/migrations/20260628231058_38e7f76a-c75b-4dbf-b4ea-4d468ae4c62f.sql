INSERT INTO public.app_settings (key, value) VALUES
  ('menu_link', 'https://marquinhoslanches.lovable.app/cardapio')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now()
WHERE public.app_settings.value = 'https://marquinhoslanches.lovable.app';