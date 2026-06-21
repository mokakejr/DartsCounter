// Re-export the shared trophy/stats engine (single source of truth, also used
// by scripts/trophy-announce.js). Lives above web/ — Vite fs.allow covers it.
export * from '../../../shared/achievements-core.mjs';
