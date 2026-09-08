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

Admin management: `GET|POST /api/v1/admin/academics/:resource`, `GET|PATCH /api/v1/admin/academics/:resource/:id`, where resource is an academic collection. Academic and learning CMS endpoints are restricted to CONTENT_EDITOR, ADMIN, and SUPER_ADMIN. Lists accept bounded pagination and relevant search, hierarchy, publication, active-state, and premium filters.

Learning: authenticated students use `/api/v1/learning/videos`, `/learning/videos/:id/playback`, `/learning/videos/:id/progress`, `/learning/continue`, `/learning/chapters/:id`, and `/learning/revision`. Only active published content is exposed. Completion is derived server-side at 90%; clients should sync at controlled intervals rather than every second. Admin learning endpoints are under `/api/v1/admin/learning/videos` and `/api/v1/admin/learning/revision`.

## Data model

Users have many normalized roles and refresh sessions. A student profile belongs to one user. The curriculum is `Exam → Subject → AcademicClass → Chapter → Topic → Subtopic`; every academic record has audit fields, `isActive`, ordering, and scoped uniqueness. Content may attach to topic or subtopic IDs later.

## Required backend environment

`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `CORS_ORIGINS`, plus optional `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

## Checks

Run `npm.cmd --workspace backend run build`, `npm.cmd --workspace backend test`, `npm.cmd --workspace backend run prisma:validate`, `npm.cmd --workspace admin run build`, and `flutter analyze` after dependencies are installed.

## Phase 5 CMS foundation

Academic hierarchy records now have independent active/draft-published state. Student-facing academic, video, revision, and flashcard reads require active and published content together with active and published ancestors. CMS lists intentionally include drafts and inactive records for authorized content managers.

`MediaAsset` is provider-neutral CMS metadata only. It stores a provider, external key, optional URL and descriptive metadata; it contains no provider credentials, access tokens, or binary data. Video provider/playback metadata remains unchanged, `mediaAssetId` is optional, and Flashcard `imageUrl` remains supported during the transition.

CMS list endpoints for Videos, Revision Items, Flashcards, Media Assets, and Content Imports use `{ items, meta: { page, limit, total, totalPages } }`. Explicit `false` values for published, active, free/premium status are supported.

### Bulk content import

Authorized content managers can use `/api/v1/admin/content-imports` to preview and explicitly apply CSV/XLSX imports. Supported targets are Exam, Subject, Academic Class, Chapter, Topic, Subtopic, Video, Revision Item, and Flashcard. Preview accepts files up to 5 MB and 500 data rows, validates and persists only the import job/row report, and never mutates learning or academic content.

Hierarchy references use scoped readable slug paths, not database IDs: `exam_slug`, then `subject_slug`, `class_slug`, `chapter_slug`, `topic_slug`, and optional `subtopic_slug`. Academic resources use their scoped slug path as the deterministic natural key; Video uses its globally unique `slug`. Those targets support `ERROR`, `SKIP`, and `UPDATE` duplicate strategies. Revision Item and Flashcard imports are intentionally `ERROR`-only because no deterministic update key is currently exposed.

Apply revalidates previewed rows, reserves the job against double application, and performs content mutations, row status updates, and audit events in one transaction. A failed apply does not leave partial content mutations. Import source bytes are processed only in memory and are never stored.
