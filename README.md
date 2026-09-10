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

## Phase 6 — QBank and PYQ Foundation

Phase 6 adds a structured NEET question bank and previous-year-question (PYQ) practice foundation. It is deliberately separate from the future formal assessment engine.

### QBank and PYQ capabilities

- Supported question type: `SINGLE_CORRECT_MCQ`.
- Each question has exactly four options and exactly one correct option; these rules are enforced by the backend.
- Difficulty levels: `EASY`, `MEDIUM`, and `HARD`.
- Sources: curated content (`CURATED`) and NEET/AIPMT-style previous-year content (`PYQ`).
- Questions are mapped to the existing hierarchy: Exam → Subject → Academic Class → Chapter → Topic → optional Subtopic.
- Questions support tags, an optional `MediaAsset`, and an optional solution-video association.
- Publish, active/inactive, free/premium, and display-order controls are available.

### Admin question management

The Admin CMS provides question list, filters, pagination, create, and edit flows for curated questions and PYQs. Editors can manage options, the correct answer, explanations, hierarchy mapping, difficulty, tags, publication state, free/premium state, media references, solution videos, and structured PYQ metadata.

Question/PYQ CSV and XLSX imports use the shared content-import workflow:

- Curated deterministic identity: `import_key`.
- PYQ deterministic identity: `source_exam + year + session + paper + question_number`.
- Preview parses and validates rows without changing question content.
- Apply is an explicit transactional mutation step.
- Duplicate strategies are `ERROR`, `SKIP`, and `UPDATE`; `SKIP`/`UPDATE` require a deterministic identity.

### Student QBank practice

Students can browse paginated questions and filter by hierarchy, PYQ-only status, PYQ year, difficulty, tags, and eligibility. Student question details use safe projections. Practice sessions support server-selected question sets of 10, 20, 50, or 100 questions, answer submission, server-derived correctness, feedback after an answer, completion summaries, and practice history.

Phase 6 practice sessions are QBank practice only. They are a foundation for a later formal Test/Assessment phase and do not implement a Phase 7 test, attempt, or result engine.

### QBank security and entitlement rules

- Correct answers and explanations are not included in student list/detail payloads before an answer is submitted.
- Student reads and practice sessions include only eligible active, published content whose academic hierarchy is visible.
- Users without premium entitlement receive free content only; locked content is handled without exposing the question stem or answer key.
- The server selects practice questions, validates submitted options, derives correctness, and enforces session ownership.

### Relevant API endpoints

All routes use the `/api/v1` prefix and require the existing authentication/authorization rules.

| Area | Methods and routes |
| --- | --- |
| Admin questions | `GET /admin/questions`, `GET /admin/questions/:id`, `POST /admin/questions`, `PATCH /admin/questions/:id` |
| Student QBank | `GET /learning/questions`, `GET /learning/questions/:id` |
| QBank practice | `POST /learning/question-practice-sessions`, `GET /learning/question-practice-sessions`, `GET /learning/question-practice-sessions/:id`, `POST /learning/question-practice-sessions/:id/items/:itemId/answer`, `POST /learning/question-practice-sessions/:id/complete` |

### Database migrations

Phase 6 is introduced by these migrations:

- `backend/prisma/migrations/20260908000000_add_qbank_foundation/`
- `backend/prisma/migrations/20260908100000_add_question_content_import_target/`

### Phase 6 verification status

- Backend build passed.
- Backend tests: 133/133 passed.
- Admin production build passed.
- Flutter analyze: no issues found.
- Flutter tests: 5 passed.
- Android `:app:compileDebugKotlin` passed.
- Android `assembleDebug` passed.

The current QBank screens are functional UI only. Final visual/UI/UX design, theming, branding, and animation are intentionally deferred to the dedicated design phase.

## Phase 7 — Formal Tests, Attempts, and Results

Authorized content managers can create and edit formal tests in the Admin CMS under the learning/tests route. A test includes hierarchy scope, scheduling, active/published and free/premium state, ordered sections, existing QBank questions, and per-question positive/negative marks. The backend derives total marks and prevents changing a test once it has formal attempts.

Students can discover available free tests, read safe pre-attempt instructions, start or resume a server-owned attempt, save answers and marked-for-review state, and submit. The server owns the deadline, lazily auto-submits expired attempts, calculates all scoring, and persists finalized summaries. A finalized attempt blocks another attempt for the same student/test until an explicit retake policy is introduced.

Finalized students can read a result summary and an ordered review containing selected answers, correct options, awarded marks, and explanations. Correct answers, explanations, scoring, and answer keys remain unavailable while an attempt is in progress. Formal-test media and solution-video review are intentionally omitted until a safe dedicated contract exists.

The Flutter tests flow provides discovery, instructions, an active test screen, server-deadline display, answer saving, submit confirmation, result, and review screens. These are functional screens only; final product visual design is intentionally deferred.

## Phase 8 — Daily Personalized PCB Module

Phase 8 adds one canonical Daily Personalized PCB Module per student and study date. Modules are grouped in Physics, Chemistry, and Biology order and use persisted learner history to generate safe, deterministic learning tasks: `QUESTION`, `FLASHCARD`, `REVISION`, and `VIDEO`.

- Subject strategies prioritize weak hierarchy areas, prefer eligible PYQs where applicable, and remain sparse-content tolerant without fabricating or duplicating content.
- Student eligibility remains safe and free-content-only where entitlement is unavailable. Unavailable, deleted, unpublished, inactive, or locked content remains represented safely and can be skipped.
- Daily task lifecycle is server-authoritative: `PENDING`, `IN_PROGRESS`, `COMPLETED`, and `SKIPPED`. Module lifecycle is `NOT_STARTED`, `IN_PROGRESS`, and `COMPLETED`.
- API responses include backend-derived overall and per-subject progress summaries; task mutations return the authoritative module and do not regenerate candidate tasks.
- The Flutter app provides the functional `/daily-study` Material screen with PCB grouping, progress, lifecycle controls, safe question content without correctness/explanation leakage, and safe video metadata without playback, provider, or storage credentials.

### Database migration

- `backend/prisma/migrations/20260910000000_add_daily_study_module_foundation/`

### Phase 8 verification status

- Backend tests: 27/27 suites, 186/186 tests passed.
- Backend build passed.
- Prisma migration status: 11 migrations; database schema up to date.
- Flutter analyze: no issues found.
- Flutter tests: 21/21 passed.
- Android `compileDebugKotlin` passed.
- Android `assembleDebug` passed.

The current Flutter Daily Study experience is functional Material UI only. Final visual/UI/UX design is intentionally deferred to the dedicated design phase.
