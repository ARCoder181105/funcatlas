# The web app: a Vite build served as static files.
#
# Build context is the repo root, like the API's -- the bundle needs the
# workspace manifests and `packages/shared`, which live above this directory.
# `docker-compose.yml` sets `context: .` and points `dockerfile:` here.

FROM node:24-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json .npmrc ./
COPY apps/web/package.json apps/web/
# Both config packages are copied, not just shared: `tsconfig.json` extends
# `@funcatlas/typescript-config/base.json`, and without it tsc silently falls
# back to its own defaults -- ES3 target, no JSX namespace -- and reports forty
# downstream errors that all trace to one missing file.
COPY packages/shared/package.json packages/shared/
COPY packages/typescript-config/ packages/typescript-config/
COPY packages/eslint-config/package.json packages/eslint-config/
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
# The lockfile and every workspace manifest, not just the ones the bundle
# imports: `pnpm run` verifies the dependency tree before executing a script,
# and a workspace member it cannot find aborts the build with
# ERR_PNPM_WORKSPACE_PKG_NOT_FOUND -- reported against `pnpm --filter web
# build`, which makes it look like a bundler failure.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json .npmrc ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY packages/typescript-config ./packages/typescript-config
COPY packages/eslint-config/package.json ./packages/eslint-config/

# Vite inlines env at build time, so this is an ARG rather than a runtime
# variable -- setting it on the container would do nothing at all.
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter web build

# Deliberately not a showcase build: this stack has an API behind it, so the
# call to action goes to the canvas rather than to the repository. VITE_SHOWCASE
# is for the web-only Vercel deploy.

FROM nginx:alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
