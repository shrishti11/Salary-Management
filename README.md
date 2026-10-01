# Salary Management

## Run with Docker

Build and start the frontend, API, and PostgreSQL database:

```bash
docker compose up --build
```

- Frontend: `http://localhost:3000`
- API health check: `http://localhost:3001/health`
- PostgreSQL: `localhost:5432` (`postgres` / `postgres`, database `salary_management`)

Stop the stack with `docker compose down`. Add `-v` to also remove the persisted PostgreSQL data volume.
