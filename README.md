# Synapse-NEETUG — Phase 1

Phase 2 adds the learning foundation: normalized video metadata, provider-neutral playback access, server-derived video progress, continue learning, and revision items. Video binaries are never sent through NestJS; the local provider returns stored development playback metadata and can be replaced by a Mux/Cloudflare adapter later.

## Layout

`backend/` NestJS + Prisma API · `admin/` Next.js App Router CMS · `student_app/` Flutter app · `docker-compose.yml` local PostgreSQL.

## Local setup

1. `docker compose up -d`
2. Copy `backend/.env.example` to `backend/.env`, replacing all secrets.
3. `npm.cmd install`
4. `npm.cmd --workspace backend run prisma:migrate`
5. `npm.cmd --workspace backend run prisma:seed`
6. `npm.cmd --workspace backend run start:dev`

API documentation: `http://localhost:3000/api/docs`; health: `http://localhost:3000/health`.

For the admin, copy `admin/.env.example` to `admin/.env.local`, then run `npm.cmd --workspace admin run dev`.

For Flutter, copy `student_app/.env.example` to `student_app/.env`, then run `flutter pub get` and `flutter run` (Flutter SDK must be installed and on PATH).

## API

Auth: `POST /api/v1/auth/register|login|refresh|logout`, `GET /api/v1/auth/me`.

Public academic lists: `GET /api/v1/academics/exams|subjects|classes|chapters|topics|subtopics`.

Admin management: `GET|POST /api/v1/admin/academics/:resource`, `GET|PATCH /api/v1/admin/academics/:resource/:id`, where resource is an academic collection. Create and update are restricted to ADMIN/SUPER_ADMIN; list is authenticated admin. Lists accept `page`, `limit`, `search`, `sort`, `order`.

Learning: authenticated students use `/api/v1/learning/videos`, `/learning/videos/:id/playback`, `/learning/videos/:id/progress`, `/learning/continue`, `/learning/chapters/:id`, and `/learning/revision`. Only active published content is exposed. Completion is derived server-side at 90%; clients should sync at controlled intervals rather than every second. Admin learning endpoints are under `/api/v1/admin/learning/videos` and `/api/v1/admin/learning/revision`.

## Data model

Users have many normalized roles and refresh sessions. A student profile belongs to one user. The curriculum is `Exam → Subject → AcademicClass → Chapter → Topic → Subtopic`; every academic record has audit fields, `isActive`, ordering, and scoped uniqueness. Content may attach to topic or subtopic IDs later.

## Required backend environment

`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `CORS_ORIGINS`, plus optional `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

## Checks

Run `npm.cmd --workspace backend run build`, `npm.cmd --workspace backend test`, `npm.cmd --workspace backend run prisma:validate`, `npm.cmd --workspace admin run build`, and `flutter analyze` after dependencies are installed.
