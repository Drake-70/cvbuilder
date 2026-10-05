# Node version is kept in lockstep with .nvmrc, render.yaml (NODE_VERSION)
# and the CI workflow so the image is built on the runtime it is tested against.
FROM node:22-alpine AS base
WORKDIR /app

# Backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
# The source is copied here rather than only in the production stage: that stage
# pulls /app/backend from *this* one, so without this line the image ships
# package.json and node_modules but no server.js, and the container dies at
# start with `Cannot find module '/app/backend/server.js'`.
COPY backend/ ./backend/
# Fail at build time with a clear message instead of at container start.
RUN test -f backend/server.js || (echo "ERROR: backend/server.js missing from the build context" && exit 1)

# Frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# ---------------------------------------------------------------------------
# LaTeX engine.
#
# tectonic is the only TeX engine that works on alpine without pulling a
# multi-gigabyte TeX Live tree, and it is a single static binary plus a bundle it
# downloads on first use. That bundle is the catch: left alone, the first PDF
# export in production would fetch hundreds of megabytes from the internet while
# holding a request open. So it is warmed here and copied into the final image,
# and the runtime runs tectonic with --only-cached so it never reaches the network
# again.
#
# This stage is separate from `base` because nothing here is needed to build the
# app, and because a broken download should fail the image build (loudly, here)
# rather than silently ship a container with no engine -- which would look
# exactly like the feature not existing.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS latex

# Pinned so a new release cannot change the output under a deploy, and so the
# checksum below is tied to a specific artifact. Bump both deliberately.
ARG TECTONIC_VERSION=0.17.0
ARG TECTONIC_SHA256=8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7

RUN apk add --no-cache curl ca-certificates tar

# Where tectonic keeps its downloaded TeX bundle.
#
# TECTONIC_CACHE_DIR is tectonic's own override and is used verbatim: only the
# requested subdirectory ("bundles") is appended to it. XDG_CACHE_HOME also points
# here as a backstop, because that path is resolved by the `directories` crate,
# which inserts an extra "Tectonic" component ($XDG_CACHE_HOME/Tectonic) and could
# change under us. Both routes stay inside /opt/tectonic, so the single
# `COPY --from=latex /opt/tectonic /opt/tectonic` below captures the bundle either
# way, and the warm-up step asserts against the path tectonic reports rather than
# a hardcoded guess.
#
# Verified against tectonic 0.17.0 (crates/io_base/src/app_dirs.rs).
ENV TECTONIC_CACHE_DIR=/opt/tectonic
ENV XDG_CACHE_HOME=/opt/tectonic

# The release digest is verified rather than the URL trusted: a build that pulls a
# binary off the internet should not be one compromised mirror away from running
# arbitrary code in the production image. The final `--version` prints the version,
# so a truncated archive or a renamed asset fails here rather than at the first
# export in production.
#
# The comments describing each step live above the instruction rather than inside
# the continuation. A `#` line inside a `RUN` continuation is stripped by BuildKit,
# but that is a parser detail worth not depending on for a stage that cannot be
# exercised until it runs in CI: if it were ever passed to the shell instead, the
# comment would swallow the rest of the line -- including the digest check.
RUN set -eux; \
    curl -fsSL --retry 3 --retry-delay 2 -o /tmp/tectonic.tar.gz \
      "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz"; \
    echo "${TECTONIC_SHA256}  /tmp/tectonic.tar.gz" | sha256sum -c -; \
    mkdir -p /usr/local/bin; \
    tar -xzf /tmp/tectonic.tar.gz -C /usr/local/bin tectonic; \
    chmod +x /usr/local/bin/tectonic; \
    rm -f /tmp/tectonic.tar.gz; \
    /usr/local/bin/tectonic --version

COPY docker/tectonic-warmup.tex /tmp/warmup.tex

# The warm-up document deliberately loads every package the templates use, plus
# the draftwatermark package that only a watermarked export needs. A cache warmed
# on an empty page would compile the first few CVs and then hit the network on one
# that mentions a certification.
#
# The warming compile does NOT pass --only-cached: this is the one place the bundle
# is allowed to be fetched. tectonic does not create `--outdir`, it errors if the
# directory is missing, so it is made first.
#
# The cache location is *asked for*, not assumed: `tectonic -X show user-cache-dir`
# prints the directory tectonic itself resolved, `bundles` already included. A
# hardcoded path is what broke this build once -- the compile succeeded, the
# assertion expected a directory one segment shallower than where the bundle
# actually landed, and a working image failed to build. Reading the path back from
# the binary cannot drift with a version bump.
#
# That path is only logged, deliberately, and the proof that the warm-up worked is
# the second compile. Resolving the cache directory creates it as a side effect, so
# `test -d` on the reported path passes even when nothing was downloaded and would
# happily green-light an empty cache. Recompiling with the exact flag set the
# runtime uses (`--outfmt pdf --only-cached --untrusted`) cannot be faked that way:
# with the network forbidden, it succeeds only if every package the templates need
# is genuinely cached. This is the contract production depends on, so it is checked
# here rather than discovered by the first user who exports a PDF.
RUN set -eux; \
    mkdir -p /tmp/warmup-out /tmp/warmup-cached-out; \
    /usr/local/bin/tectonic -X compile --outdir /tmp/warmup-out --outfmt pdf /tmp/warmup.tex; \
    test -s /tmp/warmup-out/warmup.pdf; \
    cache_dir="$(/usr/local/bin/tectonic -X show user-cache-dir 2>/dev/null)"; \
    test -n "$cache_dir"; \
    echo "warmed tectonic bundle cache at $cache_dir"; \
    du -sh "$cache_dir"; \
    /usr/local/bin/tectonic -X compile --outfmt pdf --only-cached --untrusted \
      --outdir /tmp/warmup-cached-out /tmp/warmup.tex; \
    test -s /tmp/warmup-cached-out/warmup.pdf

# Production image
FROM node:22-alpine AS production
WORKDIR /app

COPY --from=base /app/backend ./backend
COPY --from=base /app/frontend/dist ./frontend/dist

# The engine and its pre-warmed bundle. If this layer is ever dropped, PDF export
# still works: the picker stops offering LaTeX templates and every other template
# renders through pdfkit. That is the whole reason the fallback exists.
COPY --from=latex /usr/local/bin/tectonic /usr/local/bin/tectonic
COPY --from=latex /opt/tectonic /opt/tectonic
# Must match the latex stage exactly: the runtime resolves the bundle through these,
# so a mismatch ships a pre-warmed cache that --only-cached cannot find and every
# export fails on the first PDF request.
ENV TECTONIC_CACHE_DIR=/opt/tectonic
ENV XDG_CACHE_HOME=/opt/tectonic
ENV TECTONIC_BIN=/usr/local/bin/tectonic

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# ${PORT} is expanded by /bin/sh at container start, so the probe keeps working
# if the host overrides PORT (Render injects 10000, for example). Note this is
# a plain $ and not $$: the double-dollar escape is a docker-compose.yml
# convention and would make the shell interpolate the PID here.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-5000}/api/health" || exit 1

CMD ["node", "backend/server.js"]