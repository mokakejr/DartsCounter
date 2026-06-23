// Stats/games are keyed by the canonical player `name` everywhere (it's the
// join key for routing, charts, etc.) — these just resolve the *shown* label
// and avatar from the name-keyed `profiles` map (GET /players), so routing
// and data joins never need to change.
export function displayName(profiles, name) {
  return profiles[name]?.display_name || name;
}

export function avatarStyle(profiles, name) {
  const url = profiles[name]?.avatar_url;
  return url ? { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined;
}
