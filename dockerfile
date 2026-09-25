# syntax=docker/dockerfile:1.7

# Which runtime variant `prod` is built on. `runtime-dbt` (the default) carries
# the dbt virtualenvs and the python runtime they need. `runtime-nodbt` omits
# both, for deployments whose projects use the Lightdash YAML semantic layer
# (`semanticLayer: 'lightdash'`) and so never invoke the dbt CLI.
# Declared before the first FROM because a FROM consumes it.
ARG RUNTIME_VARIANT=runtime-dbt

# Extensions are ABI-versioned. Keep this pinned image and the destination path
# below aligned with @duckdb/node-api; the production stage fails if they drift.
FROM duckdb/duckdb:1.5.2@sha256:5658472bf45cce867048a17201b9d38d4632507e7df4a69994f8236599f69d45 AS duckdb-extensions
RUN ["/duckdb", "-c", "INSTALL httpfs; INSTALL aws;"]

FROM ghcr.io/pnpm/pnpm:12.3.4@sha256:b81d53184f670fe19d1a33f9d5041907d314b31d596838e8133cbd83d45be043 AS pnpm-cli

# -----------------------------
# Stage 0: pnpm setup base
# -----------------------------
FROM node:24-bookworm-slim AS pnpm-base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:/opt/pnpm:$PATH"
COPY --from=pnpm-cli /opt/pnpm /opt/pnpm
COPY --from=pnpm-cli /pnpm /pnpm
RUN apt-get update \
    && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*
RUN pnpm config set store-dir /pnpm/store

WORKDIR /usr/app

# -----------------------------
# Stage 1: system dependencies base
# -----------------------------
FROM pnpm-base AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    libsasl2-modules-gssapi-mit \
    python3 \
    python3-psycopg2 \
    python3-venv \
    python3-dev \
    software-properties-common \
    unzip \
    git \
    # Required by node-canvas prebuilt binaries for font rendering in chart images
    fontconfig \
    # Required so headless chart screenshots can render CJK glyphs
    fonts-noto-cjk \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Fix package vulnerabilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgnutls28-dev  \
    tar \
    libsystemd0

# -----------------------------
# Stage 0b: dbt virtualenvs
# -----------------------------

# Split out of `base` so the application build no longer descends from it.
# These venvs are ~7 GiB and minutes of pip, and `prod-builder` needs the apt
# toolchain above but never a dbt binary, so building them on the way to the
# application was pure cost. Only `dev` and `runtime-dbt` consume this stage
# now, which is what lets RUNTIME_VARIANT=runtime-nodbt drop it from the graph
# so BuildKit never runs it at all.
FROM base AS dbt-venvs

# Installing multiple versions of dbt
# dbt 1.4 is the default
# NOTE: keep the per-version adapter list in sync with
# DBT_VERSION_SUPPORTED_WAREHOUSES in packages/common/src/types/projects.ts —
# `latest` only advances to a version with full adapter coverage.
# Use pip cache to speed up subsequent builds
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m venv /usr/local/dbt1.4 \
    && /usr/local/dbt1.4/bin/pip install \
    "dbt-postgres~=1.4.0" \
    "dbt-redshift~=1.4.0" \
    "dbt-snowflake~=1.4.0" \
    "dbt-bigquery~=1.4.0" \
    "dbt-databricks~=1.4.0" \
    "dbt-trino~=1.4.0" \
    "dbt-clickhouse~=1.4.0" \
    "psycopg2-binary==2.9.6"

RUN --mount=type=cache,target=/root/.cache/pip \
    ln -s /usr/local/dbt1.4/bin/dbt /usr/local/bin/dbt\
    && python3 -m venv /usr/local/dbt1.5 \
    && /usr/local/dbt1.5/bin/pip install \
    "dbt-postgres~=1.5.0" \
    "dbt-redshift~=1.5.0" \
    "dbt-snowflake~=1.5.0" \
    "dbt-bigquery~=1.5.0" \
    "dbt-databricks~=1.5.0" \
    "dbt-trino==1.5.0" \
    "dbt-clickhouse~=1.5.0" \
    "psycopg2-binary==2.9.6" \
    && ln -s /usr/local/dbt1.5/bin/dbt /usr/local/bin/dbt1.5\
    && python3 -m venv /usr/local/dbt1.6 \
    && /usr/local/dbt1.6/bin/pip install \
    "dbt-postgres~=1.6.0" \
    "dbt-redshift~=1.6.0" \
    "dbt-snowflake~=1.6.0" \
    "dbt-bigquery~=1.6.0" \
    "dbt-databricks~=1.6.0" \
    "dbt-trino==1.6.0" \
    "dbt-clickhouse~=1.6.0" \
    "psycopg2-binary==2.9.6"\
    && ln -s /usr/local/dbt1.6/bin/dbt /usr/local/bin/dbt1.6 \
    && python3 -m venv /usr/local/dbt1.7 \
    && /usr/local/dbt1.7/bin/pip install \
    "dbt-postgres~=1.7.0" \
    "dbt-redshift~=1.7.0" \
    "dbt-snowflake~=1.7.0" \
    "dbt-bigquery~=1.7.0" \
    "dbt-databricks~=1.7.0" \
    "dbt-trino==1.7.0" \
    "dbt-clickhouse~=1.7.0" \
    "psycopg2-binary==2.9.6" \
    && ln -s /usr/local/dbt1.7/bin/dbt /usr/local/bin/dbt1.7 \
    && python3 -m venv /usr/local/dbt1.8 \
    && /usr/local/dbt1.8/bin/pip install \
    # from 1.8, dbt-core needs to be explicitly installed
    "dbt-core~=1.8.0" \
    "dbt-postgres~=1.8.0" \
    "dbt-redshift~=1.8.0" \
    "dbt-snowflake~=1.8.0" \
    "dbt-bigquery~=1.8.0" \
    "dbt-databricks~=1.8.0" \
    "dbt-trino~=1.8.0" \
    "dbt-clickhouse~=1.8.0" \
    "dbt-duckdb~=1.8.0" \
    && ln -s /usr/local/dbt1.8/bin/dbt /usr/local/bin/dbt1.8 \
    && python3 -m venv /usr/local/dbt1.9 \
    && /usr/local/dbt1.9/bin/pip install \
    "dbt-core~=1.9.0" \
    "dbt-postgres~=1.9.0" \
    "dbt-redshift~=1.9.0" \
    "dbt-snowflake~=1.9.0" \
    "dbt-bigquery~=1.9.0" \
    "dbt-databricks~=1.9.0" \
    "dbt-trino~=1.9.0" \
    "dbt-clickhouse~=1.9.0" \
    "dbt-athena~=1.9.0" \
    "dbt-duckdb~=1.9.0" \
    && ln -s /usr/local/dbt1.9/bin/dbt /usr/local/bin/dbt1.9 \
    && python3 -m venv /usr/local/dbt1.10 \
    && /usr/local/dbt1.10/bin/pip install \
    "dbt-core~=1.10.0" \
    "dbt-postgres~=1.10.0" \
    "dbt-redshift~=1.10.0" \
    "dbt-snowflake~=1.10.0" \
    "dbt-bigquery~=1.10.0" \
    "dbt-databricks~=1.10.0" \
    "dbt-trino~=1.10.0" \
    "dbt-clickhouse~=1.9.0" \
    "dbt-athena~=1.10.0" \
    "dbt-duckdb~=1.10.0" \
    && ln -s /usr/local/dbt1.10/bin/dbt /usr/local/bin/dbt1.10 \
    && python3 -m venv /usr/local/dbt1.11 \
    && /usr/local/dbt1.11/bin/pip install \
    "dbt-core~=1.11.0" \
    "dbt-postgres~=1.10.0" \
    "dbt-redshift~=1.10.0" \
    "dbt-snowflake~=1.11.0" \
    "dbt-bigquery~=1.11.0" \
    "dbt-databricks~=1.11.0" \
    "dbt-trino~=1.10.0" \
    "dbt-clickhouse~=1.9.0" \
    "dbt-athena~=1.10.0" \
    "dbt-duckdb~=1.10.0" \
    && ln -s /usr/local/dbt1.11/bin/dbt /usr/local/bin/dbt1.11 \
    && python3 -m venv /usr/local/dbt1.12 \
# dbt-databricks 1.12 requires dbt-core below 1.12.1.
    && /usr/local/dbt1.12/bin/pip install \
    "dbt-core==1.12.0" \
    "dbt-postgres~=1.10.0" \
    "dbt-redshift~=1.10.0" \
    "dbt-snowflake~=1.12.0" \
    "dbt-bigquery~=1.12.0" \
    "dbt-databricks~=1.12.3" \
    "dbt-trino~=1.10.0" \
    "dbt-clickhouse~=1.9.0" \
    "dbt-athena~=1.10.0" \
    "dbt-duckdb~=1.10.0" \
    && ln -s /usr/local/dbt1.12/bin/dbt /usr/local/bin/dbt1.12

# -----------------------------
# Stage 1: stop here for dev environment
# -----------------------------
# From dbt-venvs, not base: a dev container is expected to have dbt on PATH.
FROM dbt-venvs AS dev

RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    && apt-get clean

EXPOSE 3000
EXPOSE 8080

# -----------------------------
# Stage 2: continue build for production environment
# -----------------------------

FROM base AS prod-builder

# Turbo cache configuration
# TURBO_TOKEN is passed as a secret mount for security (not exposed in image layers)
# TURBO_TEAM and TURBO_API are set as ENV variables
ARG TURBO_TEAM=""
ENV TURBO_TEAM=${TURBO_TEAM}
ENV TURBO_API=https://cache.depot.dev

# Install development dependencies for all packages
COPY package.json .
COPY pnpm-workspace.yaml .
COPY pnpm-lock.yaml .
COPY turbo.json .
COPY tsconfig.json .
COPY .oxlintrc.base.json .
COPY .pnpmfile.cjs .
COPY packages/common/package.json ./packages/common/
COPY packages/formula/package.json ./packages/formula/
COPY packages/warehouses/package.json ./packages/warehouses/
COPY packages/backend/package.json ./packages/backend/
COPY packages/backend/src/ee/services/McpService/mcp-chart-app/package.json ./packages/backend/src/ee/services/McpService/mcp-chart-app/
COPY packages/frontend/package.json ./packages/frontend/

# --frozen-lockfile materialises the whole lockfile, including importers whose
# package.json this stage never copies, so cypress is installed here and its
# postinstall downloads a browser binary no build stage can use. Inherited by
# build-final, so it covers the production install too. Set it to 1 if a stage
# ever needs to actually run cypress.
ENV CYPRESS_INSTALL_BINARY=0

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# Add node_modules/.bin to PATH so turbo and other binaries are available
ENV PATH="/usr/app/node_modules/.bin:$PATH"

# Increase Node.js heap size for TypeScript compilation
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN if [ -n "${SENTRY_AUTH_TOKEN}" ] && [ -n "${SENTRY_ORG}" ] && [ -n "${SENTRY_RELEASE_VERSION}" ]; then \
    npm install -g @sentry/cli; \
    fi

# -----------------------------
# Stage 3: Build packages
# -----------------------------

# Build common package
FROM prod-builder AS build-common
COPY packages/common/tsconfig*.json ./packages/common/
COPY packages/common/src/ ./packages/common/src/
RUN --mount=type=secret,id=TURBO_TOKEN \
    export TURBO_TOKEN=$(cat /run/secrets/TURBO_TOKEN 2>/dev/null || echo "") && \
    turbo build --filter=@lightdash/common

# Build formula package
FROM prod-builder AS build-formula
COPY packages/formula/tsconfig.json ./packages/formula/
COPY packages/formula/src/ ./packages/formula/src/
RUN --mount=type=secret,id=TURBO_TOKEN \
    export TURBO_TOKEN=$(cat /run/secrets/TURBO_TOKEN 2>/dev/null || echo "") && \
    turbo build --filter=@lightdash/formula

# Build warehouses package
FROM prod-builder AS build-warehouses
COPY --from=build-common /usr/app/packages/common/ ./packages/common/
COPY packages/warehouses/tsconfig.json ./packages/warehouses/
COPY packages/warehouses/tsconfig.build.json ./packages/warehouses/
COPY packages/warehouses/src/ ./packages/warehouses/src/
RUN --mount=type=secret,id=TURBO_TOKEN \
    export TURBO_TOKEN=$(cat /run/secrets/TURBO_TOKEN 2>/dev/null || echo "") && \
    turbo build --filter=@lightdash/warehouses

# Build backend package
FROM prod-builder AS build-backend
COPY --from=build-common /usr/app/packages/common/ ./packages/common/
COPY --from=build-formula /usr/app/packages/formula/ ./packages/formula/
COPY --from=build-warehouses /usr/app/packages/warehouses/ ./packages/warehouses/
COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/backend/tsconfig.build.json ./packages/backend/
COPY packages/backend/tsconfig.sentry.json ./packages/backend/
COPY packages/backend/tsoa.yml ./packages/backend/
COPY packages/backend/src/ ./packages/backend/src/

# Build MCP chart app (pnpm workspace member — deps already installed in prod-builder)
RUN pnpm -F @lightdash/mcp-chart-app build

ARG SENTRY_AUTH_TOKEN=""
ARG SENTRY_ORG=""
ARG SENTRY_RELEASE_VERSION=""
ARG SENTRY_FRONTEND_PROJECT=""
ARG SENTRY_BACKEND_PROJECT=""
ARG SENTRY_ENVIRONMENT=""

# Conditionally build backend with sourcemaps if Sentry environment variables are set
RUN --mount=type=secret,id=TURBO_TOKEN \
    export TURBO_TOKEN=$(cat /run/secrets/TURBO_TOKEN 2>/dev/null || echo "") && \
    if [ -n "${SENTRY_AUTH_TOKEN}" ] && [ -n "${SENTRY_ORG}" ] && [ -n "${SENTRY_RELEASE_VERSION}" ] && [ -n "${SENTRY_FRONTEND_PROJECT}" ] && [ -n "${SENTRY_BACKEND_PROJECT}" ] && [ -n "${SENTRY_ENVIRONMENT}" ]; then \
    echo "Building backend with sourcemaps for Sentry"; \
    pnpm -F backend build-sourcemaps && pnpm -F backend postbuild; \
    else \
    echo "Building backend without sourcemaps"; \
    turbo build --filter=backend; \
    fi

# Build frontend package
FROM prod-builder AS build-frontend
COPY --from=build-common /usr/app/packages/common/ ./packages/common/
COPY --from=build-formula /usr/app/packages/formula/ ./packages/formula/
COPY packages/frontend ./packages/frontend

# KONTALA: the path this build will be served under, compiled in as vite's
# base. Empty builds upstream's bundle, served at the origin root.
#
# ⚠ IT MUST MATCH SITE_URL's PATH AT RUNTIME. The backend derives its express
# mount point from SITE_URL (lightdashConfig.basePath); this decides where the
# bundle looks for its own assets and where its router thinks it lives. Set one
# without the other and the page loads from nowhere.
ARG LIGHTDASH_BASE_PATH=""
ENV LIGHTDASH_BASE_PATH=${LIGHTDASH_BASE_PATH}

ARG SENTRY_AUTH_TOKEN=""
ARG SENTRY_ORG=""
ARG SENTRY_RELEASE_VERSION=""

# Build frontend with sourcemaps (Vite generates them by default)
RUN --mount=type=secret,id=TURBO_TOKEN \
    export TURBO_TOKEN=$(cat /run/secrets/TURBO_TOKEN 2>/dev/null || echo "") && \
    if [ -n "${SENTRY_AUTH_TOKEN}" ] && [ -n "${SENTRY_ORG}" ] && [ -n "${SENTRY_RELEASE_VERSION}" ]; then \
    echo "Building frontend with Sentry integration"; \
    SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN} SENTRY_RELEASE_VERSION=${SENTRY_RELEASE_VERSION} turbo build --filter=@lightdash/frontend; \
    else \
    echo "Building frontend without Sentry integration"; \
    turbo build --filter=@lightdash/frontend; \
    fi

# -----------------------------
# Stage 4: final build assembly
# -----------------------------

FROM prod-builder AS build-final

# ⚠ THE PRODUCTION INSTALL COMES FIRST, ABOVE THE ARTIFACT COPYs. Its only
# inputs are the package.json set and the lockfile, both already present in
# prod-builder, so this layer is identical on every build where dependencies
# did not change and a registry cache restores it across a source-only bump.
# Below the COPYs it was invalidated by any source change and re-ran in full
# every time. Nothing here needs the built output: pnpm symlinks the workspace
# packages, and their dist directories are filled in by the COPYs afterwards.
#
# The frontend is excluded: it ships as the prebuilt static bundle copied
# below, and Node never requires any of its 119 runtime dependencies.
# Installing them added ~950 MiB to the image (@tabler/icons, monaco, mermaid).
ENV NODE_ENV production
RUN rm -rf node_modules \
    && rm -rf packages/*/node_modules

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --prefer-offline \
    --filter '!@lightdash/frontend'

COPY release-safety.json ./release-safety.json
COPY --from=build-common /usr/app/packages/common/dist/ ./packages/common/dist/
COPY --from=build-formula /usr/app/packages/formula/dist/ ./packages/formula/dist/
COPY --from=build-warehouses /usr/app/packages/warehouses/dist/ ./packages/warehouses/dist/
COPY --from=build-backend /usr/app/packages/backend/dist/ ./packages/backend/dist/
COPY --from=build-frontend /usr/app/packages/frontend/build/ ./packages/frontend/build/

# Install Sentry CLI and process sourcemaps if environment variables are set
ARG SENTRY_AUTH_TOKEN=""
ARG SENTRY_ORG=""
ARG SENTRY_RELEASE_VERSION=""
ARG SENTRY_FRONTEND_PROJECT=""
ARG SENTRY_BACKEND_PROJECT=""
ARG SENTRY_ENVIRONMENT=""

RUN if [ -n "${SENTRY_AUTH_TOKEN}" ] && [ -n "${SENTRY_ORG}" ] && [ -n "${SENTRY_RELEASE_VERSION}" ] && [ -n "${SENTRY_FRONTEND_PROJECT}" ] && [ -n "${SENTRY_BACKEND_PROJECT}" ] && [ -n "${SENTRY_ENVIRONMENT}" ]; then \
    npm install -g @sentry/cli; \
    export PATH="$(npm prefix -g)/bin:${PATH}"; \
    echo "Creating Sentry releases and processing sourcemaps"; \
    # Create releases for both projects \
    sentry-cli releases new "${SENTRY_RELEASE_VERSION}" --project "${SENTRY_FRONTEND_PROJECT}"; \
    sentry-cli releases new "${SENTRY_RELEASE_VERSION}" --project "${SENTRY_BACKEND_PROJECT}"; \
    # Set commits for the releases \
    sentry-cli releases set-commits "${SENTRY_RELEASE_VERSION}" --auto || echo "Could not determine commits automatically"; \
    # Inject debug IDs into frontend artifacts \
    echo "Injecting debug IDs into frontend artifacts"; \
    sentry-cli sourcemaps inject ./packages/frontend/build/assets/; \
    # Upload frontend sourcemaps \
    echo "Uploading frontend sourcemaps"; \
    sentry-cli sourcemaps upload --release "${SENTRY_RELEASE_VERSION}" \
    --url-prefix "~/assets" ./packages/frontend/build/assets/ --project "${SENTRY_FRONTEND_PROJECT}"; \
    # Inject debug IDs into backend artifacts \
    echo "Injecting debug IDs into backend artifacts"; \
    sentry-cli sourcemaps inject ./packages/backend/dist/; \
    # Upload backend sourcemaps \
    echo "Uploading backend sourcemaps"; \
    sentry-cli sourcemaps upload --release "${SENTRY_RELEASE_VERSION}" \
    --url-prefix "~/" ./packages/backend/dist/ --project "${SENTRY_BACKEND_PROJECT}"; \
    # Finalize releases \
    sentry-cli releases finalize "${SENTRY_RELEASE_VERSION}"; \
    # Create deploys for both projects \
    sentry-cli releases deploys "${SENTRY_RELEASE_VERSION}" new -e "${SENTRY_ENVIRONMENT}" --project "${SENTRY_FRONTEND_PROJECT}"; \
    sentry-cli releases deploys "${SENTRY_RELEASE_VERSION}" new -e "${SENTRY_ENVIRONMENT}" --project "${SENTRY_BACKEND_PROJECT}"; \
    fi

# Frontend sourcemaps are ~97 MiB and are served publicly by the static handler
# in App.ts, which has no .map exclusion. This runs after the Sentry upload
# above, so symbolication is unaffected by dropping them from the image.
ARG KEEP_FRONTEND_SOURCEMAPS=true
RUN if [ "${KEEP_FRONTEND_SOURCEMAPS}" != "true" ]; then \
    find ./packages/frontend/build/assets -name '*.map' -delete; \
    fi

# @lightdash/common routes require, import and default to dist/cjs; only the
# build-time `types` and `module` fields point at dist/esm. Neither dist/esm nor
# the orphaned dist/types is reachable from `node dist/index.js` (~40 MiB).
RUN rm -rf ./packages/common/dist/esm ./packages/common/dist/types

# Keep the versioned playground bundle in a late layer so bundle-only updates
# do not invalidate production dependency installation or sourcemap processing.
COPY packages/backend/assets/ ./packages/backend/assets/

# The extension bundle is assembled and verified here rather than in the runtime
# stage: the check needs the production node_modules, and the runtime stage must
# stay free of RUN instructions so its application layer can be rebased onto
# cached parents instead of hydrating them.
COPY --from=duckdb-extensions \
    /root/.duckdb/extensions/v1.5.2/*/*.duckdb_extension \
    /usr/app/packages/warehouses/dist/duckdbExtensions/v1.5.2/

# Never silently restore production runtime downloads after a DuckDB upgrade.
RUN duckdb_version="$(cd /usr/app/packages/warehouses && node -e "process.stdout.write(require('@duckdb/node-api').version())")" \
    && extension_directory="/usr/app/packages/warehouses/dist/duckdbExtensions/${duckdb_version}" \
    && if [ ! -r "${extension_directory}/httpfs.duckdb_extension" ] \
        || [ ! -r "${extension_directory}/aws.duckdb_extension" ]; then \
        echo >&2 "Bundled extensions do not match @duckdb/node-api ${duckdb_version}"; \
        exit 1; \
    fi

# KONTALA: record what the server reads before it listens, for
# prod-entrypoint.sh to read ahead of it on a cold start (see there). The server
# is stopped at its first listen(), so the values below only have to carry it
# through config parsing; the DB connections it starts in the background are
# abandoned with the process. The feature variables mirror production, because
# they decide which modules load.
#
# Deliberately not fatal: without the list an instance boots exactly as it
# did before, only slower, and that is no reason to fail an hour-long build.
COPY docker/record-boot-files.cjs /tmp/record-boot-files.cjs
RUN cd /usr/app/packages/backend \
    && LIGHTDASH_BOOT_FILES_OUT=/usr/app/boot-files.txt \
       LIGHTDASH_SECRET=record-boot-files \
       SITE_URL=http://localhost:8080 \
       PGHOST=127.0.0.1 PGPORT=1 PGUSER=boot PGPASSWORD=boot PGDATABASE=boot \
       S3_ENDPOINT=http://127.0.0.1:1 S3_BUCKET=boot S3_REGION=boot \
       AUTH_OIDC_CLIENT_ID=boot AUTH_OIDC_CLIENT_SECRET=boot \
       AUTH_OIDC_METADATA_DOCUMENT_URL=http://127.0.0.1:1/.well-known/openid-configuration \
       SCHEDULER_ENABLED=true \
       timeout 120 node --require /tmp/record-boot-files.cjs dist/index.js \
    || { rm -f /usr/app/boot-files.txt; echo >&2 "WARNING: boot file list not recorded; cold starts will not read ahead"; }

# -----------------------------
# Stage 5: runtime base
# -----------------------------

# Everything here is invalidated only by this file: system packages, the dbt
# virtualenvs and their symlinks. It is deliberately independent of the build
# context so a release version bump never rebuilds it.
FROM pnpm-base AS runtime-base

ENV NODE_ENV production
ENV PLAYGROUND_DATA_DIR=/usr/app/packages/backend/assets/playground
# Boot works fully offline because the standalone pnpm binary is baked in.

WORKDIR /usr/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    # Required by simple-git, which clones project repositories at runtime
    git \
    # Required by node-canvas prebuilt binaries for font rendering in chart images
    fontconfig \
    # Required so headless chart screenshots can render CJK glyphs
    fonts-noto-cjk \
    # Required so DuckDB httpfs can verify HTTPS object storage (Node carries its own trust store)
    ca-certificates \
    dumb-init \
    # Optional: jemalloc allocator reduces native memory fragmentation vs glibc malloc.
    # Dormant unless activated via LD_PRELOAD env var per customer.
    libjemalloc2 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------
# Stage 5a: runtime variants
# -----------------------------

# The dbt CLI is reached only by DbtProjectType.DBT and by the git project types
# configured with `semanticLayer: 'dbt'`. Projects on the Lightdash YAML
# semantic layer are served by NativeGitProjectAdapter, which compiles models
# in-process via loadLightdashModels() and never shells out to dbt, so for those
# deployments this entire layer is inert.
FROM runtime-base AS runtime-dbt

# python3 and psycopg2 exist solely to run the virtualenvs below.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-psycopg2 \
    python3-venv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Taken from `dbt-venvs` rather than `prod-builder`: sourcing them from a stage
# the application build does not touch keeps this stage off that graph, and
# keeps that graph off the venvs.
COPY --link --from=dbt-venvs /usr/local/dbt1.4 /usr/local/dbt1.4
COPY --link --from=dbt-venvs /usr/local/dbt1.5 /usr/local/dbt1.5
COPY --link --from=dbt-venvs /usr/local/dbt1.6 /usr/local/dbt1.6
COPY --link --from=dbt-venvs /usr/local/dbt1.7 /usr/local/dbt1.7
COPY --link --from=dbt-venvs /usr/local/dbt1.8 /usr/local/dbt1.8
COPY --link --from=dbt-venvs /usr/local/dbt1.9 /usr/local/dbt1.9
COPY --link --from=dbt-venvs /usr/local/dbt1.10 /usr/local/dbt1.10
COPY --link --from=dbt-venvs /usr/local/dbt1.11 /usr/local/dbt1.11
COPY --link --from=dbt-venvs /usr/local/dbt1.12 /usr/local/dbt1.12

RUN ln -s /usr/local/dbt1.4/bin/dbt /usr/local/bin/dbt \
    && ln -s /usr/local/dbt1.5/bin/dbt /usr/local/bin/dbt1.5 \
    && ln -s /usr/local/dbt1.6/bin/dbt /usr/local/bin/dbt1.6 \
    && ln -s /usr/local/dbt1.7/bin/dbt /usr/local/bin/dbt1.7 \
    && ln -s /usr/local/dbt1.8/bin/dbt /usr/local/bin/dbt1.8 \
    && ln -s /usr/local/dbt1.9/bin/dbt /usr/local/bin/dbt1.9 \
    && ln -s /usr/local/dbt1.10/bin/dbt /usr/local/bin/dbt1.10 \
    && ln -s /usr/local/dbt1.11/bin/dbt /usr/local/bin/dbt1.11 \
    && ln -s /usr/local/dbt1.12/bin/dbt /usr/local/bin/dbt1.12

# dbt-free variant. Selecting it drops the nine virtualenvs and the python
# runtime (~1.7 GiB). An instance built this way can serve only projects that
# never invoke the dbt CLI.
FROM runtime-base AS runtime-nodbt

# Resolves to runtime-dbt or runtime-nodbt via the global RUNTIME_VARIANT arg.
FROM ${RUNTIME_VARIANT} AS runtime-selected

# The runtime working directory is set here, not after the application layers.
# WORKDIR compiles to a mkdir even when the path already exists, and any
# filesystem mutation after a COPY --link forces BuildKit to materialise the
# layers it was meant to leave untouched.
WORKDIR /usr/app/packages/backend

# -----------------------------
# Stage 6: execution environment for backend
# -----------------------------

FROM runtime-selected AS prod

# INVARIANT: this stage may contain only COPY --link and image metadata.
# A RUN, a WORKDIR or a classic COPY placed after the application content has
# to write onto the parent filesystem, which forces BuildKit to hydrate the
# ~2.1 GiB of cached runtime and dbt layers below — 252s per release build,
# even with every one of those layers a cache hit. Keep additions above, in
# runtime-base.
# COPY --link also does not follow symlinks in its destination path, so every
# destination here must stay a real directory.
COPY --link --from=build-final /usr/app /usr/app
COPY --link ./docker/prod-entrypoint.sh /usr/bin/prod-entrypoint.sh
COPY --link ./docker/read-ahead.cjs /usr/bin/read-ahead.cjs

EXPOSE 8080

ENTRYPOINT ["dumb-init", "--", "/usr/bin/prod-entrypoint.sh"]
CMD ["node", "dist/index.js"]
