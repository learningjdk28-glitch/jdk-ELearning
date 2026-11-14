-- Final phase: appearance saved on the profile (light / dark / same as the device, and a brand colour).
-- The colour is a preset id (same list as BRAND_PRESETS in src/lib/theme.js) or '#rrggbb'. Safe to run more than once.
alter table public.profiles add column if not exists theme text not null default 'system';
alter table public.profiles add column if not exists brand_color text;
alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check check (theme in ('system', 'light', 'dark'));
alter table public.profiles drop constraint if exists profiles_brand_color_check;
alter table public.profiles add constraint profiles_brand_color_check
  check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$' or brand_color in ('indigo', 'blue', 'teal', 'green', 'rose', 'orange'));
