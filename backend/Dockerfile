FROM oven/bun:1.3.14-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . ./
RUN bun run prisma:generate

EXPOSE 3001

CMD ["bun", "run", "start"]
