# Build context is the repo root (not pwa-dashboard/), because the app imports
# ../../../shared/achievements-core.mjs — see pwa-dashboard/src/lib/trophies.js.

FROM node:22-alpine AS base
WORKDIR /repo
COPY pwa-dashboard/package.json pwa-dashboard/package-lock.json pwa-dashboard/
RUN npm --prefix pwa-dashboard ci

FROM base AS dev
COPY shared/ shared/
COPY pwa-dashboard/ pwa-dashboard/
WORKDIR /repo/pwa-dashboard
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM base AS build
ARG VITE_API_URL
ARG VITE_COUNTER_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_COUNTER_URL=$VITE_COUNTER_URL
COPY shared/ shared/
COPY pwa-dashboard/ pwa-dashboard/
WORKDIR /repo/pwa-dashboard
RUN npm run build

FROM caddy:2-alpine AS runtime
COPY --from=build /repo/pwa-dashboard/dist /srv
COPY pwa-dashboard/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
