FROM oven/bun:1.3.14-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . ./
RUN bun run prisma:generate

EXPOSE 3001

# Apply pending migrations, then start the API. Seed manually (see README):
#   docker compose exec backend bun run db:seed
CMD ["sh", "-c", "bun run db:deploy && bun run start"]
