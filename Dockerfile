# Portable production image using Next.js standalone output.
# Works on Vercel-agnostic hosts (Hetzner, any Docker runtime).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# package-lock.json was generated with npm >=11. The npm 10 bundled in
# node:22-alpine resolves next-intl's optional `@swc/helpers >=0.5.17` peer
# against next's exact 0.5.15 pin and rejects the lockfile as out of sync
# ("Missing: @swc/helpers@0.5.23"). Match the npm that wrote the lock.
RUN npm i -g npm@12 && npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The GA4 measurement ID is compiled INTO the client bundle — Next substitutes
# NEXT_PUBLIC_* textually at build time, so passing it only as a runtime
# environment variable leaves the browser with `undefined` and analytics
# silently off. It must be a build arg. (It is also set at runtime in
# docker-compose, where next.config.ts reads it to widen the CSP.)
ARG NEXT_PUBLIC_GA4_ID=""
ENV NEXT_PUBLIC_GA4_ID=$NEXT_PUBLIC_GA4_ID
#
# SÓL IDENTYFIKATORÓW SERVER ACTIONS (07.09.2026).
#
# Next liczy identyfikator każdej akcji serwerowej jako skrót z pliku i nazwy
# eksportu — SOLONY kluczem szyfrowania domknięć (`webpack-config.js`:
# `serverReferenceHashSalt: encryptionKey`). Klucz jest domyślnie LOSOWANY przy
# każdym buildzie, więc ta sama, nietknięta akcja dostaje inne id w każdym
# obrazie. Zmierzone na trzech kolejnych obrazach produkcyjnych: akcja
# `lookupReservations` miała `40c8f142…`, `4060f1fd…` i `4043fa6a…`.
#
# Skutek dla klienta: każdy, kto miał stronę otwartą przed wdrożeniem, przy
# pierwszym kliknięciu dostawał „Failed to find Server Action" — bo trzyma id
# z poprzedniego obrazu. To jest przyczyna alertu wracającego od 29.08.2026.
#
# Ustalony klucz zdejmuje losowość: przy tej samej treści akcji id jest
# identyczne w kolejnych buildach (sprawdzone: 107/107 identycznych id w dwóch
# buildach z tym samym kluczem). Wartość mieszka w `.env`, nigdy w repozytorium,
# a `scripts/build-bezpieczny.sh` podaje ją tutaj i PRZERYWA build, gdy jej nie
# ma — żeby ta naprawa nie mogła po cichu wyparować przy kolejnym wdrożeniu.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=""
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# sharp, copied whole rather than left to the standalone tracer.
#
# The OG-card renderer transcodes car photographs (most of the fleet is stored
# as WebP, which Satori cannot decode). Next traces `require` graphs, and
# sharp's actual engine — libvips-cpp.so — is dlopen'd at runtime, not required,
# so the tracer copies sharp's JavaScript and silently leaves the shared object
# behind. The result is a module that resolves and then throws
# ERR_DLOPEN_FAILED on first use. Copying both packages verbatim is the fix.
#
# From the `deps` stage on purpose: those were installed inside Alpine, so they
# are the musl builds this image needs. Host-built glibc copies would not load.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img

# Mount point for the media volume. Creating it here (owned by nextjs) means a
# freshly created named volume inherits that ownership — otherwise Docker would
# make it root-owned and uploads would fail with EACCES.
RUN mkdir -p /app/media && chown nextjs:nodejs /app/media

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
