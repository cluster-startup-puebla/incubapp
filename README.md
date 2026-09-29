# Incubapp

Two apps, one git repo. Each one deploys on its own.

- `api/` NestJS REST API (`/api/v1/[resource]`), Better Auth, Prisma, Scalar
- `web/` Next.js landing, navbar, and auth screens

## Infra

From `api/`:

```bash
docker compose up -d
cp .env.example .env
npm install
npx prisma migrate dev
npm run start:dev
```

Services:

- Postgres `localhost:5433`
- Redis `localhost:6379`
- MinIO API `localhost:9000`, console `localhost:9001`
- Mailpit SMTP `localhost:1026`, UI `localhost:8026`
- API `http://localhost:3001`
- Health `GET /api/v1/health`
- Auth `http://localhost:3001/api/auth`
- Scalar `http://localhost:3001/reference`

## Web

From `web/`:

```bash
cp .env.example .env.local
npm install
npm run dev
```

Web runs at `http://localhost:3000` and calls the API directly.
