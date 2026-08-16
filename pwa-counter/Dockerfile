# Build context is the repo root (not pwa-counter/), mirroring
# pwa-dashboard/Dockerfile: both apps now read their design tokens from
# shared/design/, which lives outside either app directory.

FROM node:22-alpine AS base
WORKDIR /repo
COPY pwa-counter/package.json pwa-counter/package-lock.json pwa-counter/
RUN npm --prefix pwa-counter ci

FROM base AS dev
COPY shared/ shared/
COPY pwa-counter/ pwa-counter/
WORKDIR /repo/pwa-counter
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM base AS build
ARG VITE_API_URL
ARG VITE_DASHBOARD_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_DASHBOARD_URL=$VITE_DASHBOARD_URL
COPY shared/ shared/
COPY pwa-counter/ pwa-counter/
WORKDIR /repo/pwa-counter
RUN npm run build

FROM caddy:2-alpine AS runtime
COPY --from=build /repo/pwa-counter/dist /srv
COPY pwa-counter/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
