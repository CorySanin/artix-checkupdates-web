FROM oven/bun:alpine AS build-env

WORKDIR /build

COPY ./package*json ./
COPY ./bun.lockb ./
RUN bun install --production --no-progress

FROM oven/bun:alpine
EXPOSE ${PORT:-8080}
HEALTHCHECK  --timeout=3s \
  CMD curl --fail http://localhost:${PORT}/healthcheck || exit 1
WORKDIR /usr/src/artix-packy-exporter
RUN apk add --no-cache curl
COPY --from=build-env /build .
COPY . .
USER bun

CMD [ "bun", "run", "index.ts"]