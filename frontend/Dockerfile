FROM oven/bun:1.3.14 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . ./
RUN bun run build

FROM oven/bun:1.3.14-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/build ./build

EXPOSE 3000

CMD ["bun", "run", "start"]
