# Scout Report: Luồng "Tạo bài tập" hiện tại (`/assignments/new`)

> Generated: 2026-09-21 · Mode: hard · Repository: teacher-os @ develop (sau merge #208)

### 1. Frontend routing & framework

- **TanStack Router file-based** (`@tanstack/react-router@^1.170.18`) + Vite plugin `tanstackRouter({ target: "react", autoCodeSplitting: true })` — `apps/web/vite.config.ts:71-75`.
- **Key deps** (`apps/web/package.json`): React 19, `@tanstack/react-query@^5`, `@tanstack/react-form` (trong deps nhưng `new.tsx` **không dùng** — dùng `useState` thuần), Tailwind v4 (`@tailwindcss/vite`), `lucide-react`, `sonner`, `better-auth`, zod. Không có shadcn/radix trong app web (shadcn primitives nằm ở `packages/ui` nhưng các trang dùng UI kit riêng tại `apps/web/src/components/ui/`).
- **`_auth` layout** — `apps/web/src/routes/_auth/route.tsx:5-26`: `beforeLoad` gọi `authClient.getSession()`, chưa login redirect `/login`. Component render `<AppShell />`. Topbar title đăng ký trong `routeTitles` tại `apps/web/src/components/layout/app-shell.tsx:16-19` (`"/_auth/assignments/new": "Tạo bài tập"`).
- **Dev server**: port **8001** strictPort (`apps/web/vite.config.ts:86-89`); API 8000. Chạy `pnpm dev:web`. Route mới phải thêm vào `apps/web/src/routes-matcher.ts` (`VALID_EXACT_ROUTES`).

### 2. Trang create hiện tại — `apps/web/src/routes/_auth/assignments/new.tsx` (262 dòng)

- Route `createFileRoute("/_auth/assignments/new")` (dòng 17). Export riêng `NewAssignmentRoute` cho test SSR.
- **State (useState thuần)**: `ComposerState` (dòng 21-29: `task, genre, title, band, source, prompt, note`), `status: "draft" | "ready"`, `dirtyTitle/dirtyPrompt/showErrors`, `saved: SavedPrompt | null`. Default `freshComposer()` (dòng 40-51): task2 + genre discuss, band 7.0.
- **Validation page-owned** (dòng 65-71): chỉ `title.trim()` + `prompt.trim()`; lỗi hiện sau submit (`showErrors`).
- **Genre-switch rule** (dòng 73-92): đổi task/genre → `compositionDefaults(...)` re-apply preset trừ field đã dirty.
- **Submit** (dòng 104-131): `submit.run({ type: "create-assignment-prompt", payload: {...8 field} })` qua `useKernelFormSubmit`; chỉ `result?.kind === "refreshed"` → set `saved` → **hiện `CreateSuccessCard` thay form in-place**. `handleReconcile` (dòng 133-145) cho notice committed/unknown.
- **Layout**: breadcrumb + `PageHead` "Thêm đề vào ngân hàng" → grid `lg:grid-cols-[1.45fr_0.9fr]`: trái `PromptComposer`, phải `BankContextCard` + `StudentPreviewPaper`; sticky action bar (`sticky bottom-0 ... bg-bg/90 backdrop-blur`, dòng 220-256): Hủy + submit (label theo status).
- **Data đọc**: `useData()` từ `@/lib/data-store` → `data.assignmentPrompts`.

### 3. Components `apps/web/src/components/assignments/`

| File | Mục đích / props |
|---|---|
| `prompt-composer.tsx` | Card "Đề bài". Props: `value: ComposerValue {task, genre, title, band, source, prompt, note}`, `errors`, `showErrors`, `onFieldChange(patch)`. ChipFilter "Dạng bài" (Task 1/2), ChipFilter "Dạng đề", Field Tiêu đề, ChipFilter Band, Input Nguồn đề, Textarea Nội dung đề + wordCount, Textarea Hướng dẫn thêm. |
| `assignment-presets.ts` | Pure module: `TASK_PRESETS` (task1: chart/table/map/process; task2: discuss/opinion/advantage/problem); helpers `taskOf()`, `genreOf()`, `wordCount()`, `compositionDefaults()`. |
| `create-success-card.tsx` | Post-save. Props: `title, status, task, genre, band, source, onCreateAnother()`. Nút "Tạo đề khác" + Link `/assignments/bank` + Link `/classes`. |
| `bank-context-card.tsx` | Card "Ngân hàng". Props: `status, onStatusChange, prompts`. ChipFilter draft/ready + 5 đề gần nhất + đếm "còn N đề khác". Không render tag "Đã dùng N lớp" (per #202). |
| `bank-preview-aside.tsx` | Aside preview sticky — dùng ở trang bank. |
| `student-preview-paper.tsx` | Paper "Xem trước phía học viên" — 8 string props, text nodes thuần (không innerHTML). |
| `status-tag.tsx` / `assignment-status.ts` | `StatusTag` + tone map; `promptStatus()`, `rollupStatus()`, `fmtDue/fmtDate`. |

### 4. Data layer (`apps/web/src/lib/`)

Mọi write qua **kernel command bus**, mọi read qua **kernel snapshot**:

- `repos/assignment-prompts.ts:5-20` — `mapAssignmentPrompts(snapshot)` field-for-field.
- Shape `AssignmentPrompt` (`lib/mock-data.ts:49-104`): `{ id, task, genre, title, band, source, prompt, note, status, createdAt }`.
- Command mapping `repos/kernel.ts:163-169`: `create-assignment-prompt` → `POST /api/assignments/prompts`, body đủ 8 field (`.strict()`).
- Action type `lib/data-actions.ts:43-56`: payload `{ task: "task1"|"task2", genre, title, band, source, prompt, note, status }`.
- Hook `lib/use-kernel-form-submit.ts:18-92`: `{ saving, error, setError, notice, submitBlocked, run, reconcile, reset }`. Chỉ `kind === "refreshed"` được reset/navigate; `committed`/`unknown` hiện `KernelSubmitNotice`. Bus serialized + double-submit guard (`repos/kernel.ts:505-592`).
- Snapshot fetch `GET /api/kernel` (`repos/kernel.ts:419-451`) qua TanStack Query, key `["kernel"]`.

### 5. Server API — `apps/server/src/routes/assignments/index.ts`

Mount trong kernel router: `kernel.route("/assignments", assignmentRoutes(deps))` — `apps/server/src/routes/kernel.ts:1991` (CSRF Origin + JSON content-type guard).

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/assignments` | — | `snapshot.assignments` |
| POST | `/api/assignments/prompts` | `assignmentPromptCreateSchema` | 201 `{ id }` |
| POST | `/api/assignments/:id/grade` | `assignmentGradeSchema` | 200 / 404 |

**Zod schemas** — `packages/api/src/contracts.ts`:
- `assignmentPromptCreateSchema` (dòng 271-282, `.strict()`): `task: z.enum(["task1","task2"])`, `genre: z.string().trim().min(1).max(40)`, `title: z.string().trim().min(1).max(200)`, `band: z.enum(["6.0","6.5","7.0","7.5"])`, `source: z.string().trim().max(200)`, `prompt: z.string().trim().min(1).max(5000)`, `note: z.string().max(2000)`, `status: z.enum(["draft","ready"])`.
- `classAssignmentCreateSchema` (dòng 292-300): `promptId, due (yyyy-mm-dd), note (default ""), studentIds (1..100)`.
- Wire rows: `KernelAssignmentPromptRow` (dòng 585-597), `KernelSnapshot` (dòng 635-649).

### 6. Database (`packages/db/src/schema/`, SQLite/D1 + Drizzle)

- `assignment-prompt.ts:12-32` — bảng `assignment_prompt`: `id` (uuid route sinh), `orgId` FK, `task`, `genre` (free string), `title`, `band` (default "7.0"), `source`, `prompt`, `note`, `status` (default "draft"), `createdAt` (timestamp_ms). Index orgId. Bank-first, không FK class/student.
- `assignment.ts:19-44` — bảng `assignment` (grading per-student) — **không có create endpoint, không đụng**.
- `class-assignment.ts:21-74` — `class_assignment` (classId, promptId FK cascade, title snapshot, due, note) + `class_assignment_target`.
- Snapshot projection `apps/server/src/routes/snapshot.ts:168-188, 312, 339` (assignmentPrompts sort `asc(createdAt), asc(id)`).
- Migrations: `packages/db/src/migrations/` — mới nhất **0018_glorious_agent_brand.sql**. Sinh migration mới qua `pnpm db:generate`. Không sửa migration đã apply.

### 7. Tests

- **Web unit** — `new.test.tsx`: vitest **environment "node"** (không DOM) → `renderToStaticMarkup`, `vi.mock` router/store/hook. Cover cấu trúc + defaults + list + error. Interaction đẩy xuống server test + E2E.
- **Server** — `kernel.test.ts:4071+` cover `POST /api/assignments/prompts` (201, persist, invalid body, org-scoping).
- **E2E** — `apps/e2e/specs/assignment-prompt-create.spec.ts` (Playwright chromium, workers 1, TZ Asia/Ho_Chi_Minh, boot API :8000 + vite :8001, `reuseExistingServer: false`). 2 test ready + draft, assert survive-reload. Helper `signUpViaUi` (`specs/helpers.ts:9`).
- **Chạy**: `pnpm --filter web test` / server `cd apps/server && npx vitest run` / e2e `cd apps/e2e && npx playwright test assignment-prompt-create` / tổng `pnpm check && pnpm check-types && pnpm test`.

### 8. Conventions

- `docs/code-standards.md`: ownership table (contracts.ts = wire; kernel.ts = mutations org-scoped; repos/kernel.ts = transport+mapping); "derived-until-user-mutable"; POST JSON-only + org-scoped; đổi contract phải đổi server + web cùng lúc.
- Git: branch `vinh19410/issue-N-slug`, Conventional Commits kèm issue.
- Plan #208 (`plans/260918-0921-assignment-bank-and-class-assign/`) — pattern: frontmatter chuẩn, Design Source chỉ vào Open Design project, Key Decisions đánh số, Phases theo vertical slice, Success Criteria checklist, Verification Commands, Red Team Review, Validation Log, research/ + reports/.
- Plan #202 (`plans/260918-0725-assignment-bank-create-page/`) — dựng nguyên bản new.tsx hiện tại.

### 9. Design system

- Tailwind **v4** CSS-first — tokens trong `packages/ui/src/styles/globals.css` (`--bg/--surface/--surface-warm/--fg/--fg-2/--muted/--meta/--border/--border-soft/--accent (#0071e3)/--success/--warn/--danger`, SF Pro, radius 8/12/18/pill, `--focus-ring`).
- Primitives `apps/web/src/components/ui/`: `Button` (primary/secondary/ghost/danger), `Card`, `Field`/`Input`/`Textarea`/`Select` (Field tự inject id/aria-invalid/describedby), `ChipFilter` (`aria-pressed`), `Tag`, `StatusTag`, `SectionLabel`, `PageHead`, `Badge`, `DataTable`, `Tabs`, `Modal`, `ChipMulti`. `cn()` tại `apps/web/src/lib/cn.ts`.
- Style pattern trang: breadcrumb font-mono, PageHead clamp, grid 2 cột, sticky action bar.

### 10. Surfaces tiêu thụ `task`/`genre` (phải cập nhật cùng contract)

- `apps/web/src/routes/_auth/assignments/bank.tsx:32-67` — filter `taskFilter: "all"|"task1"|"task2"` + `genreFilter` build từ `TASK_PRESETS`.
- `apps/web/src/components/classes/class-assignments-tab.tsx:75-82` — filter ready prompts theo `p.task`.
- `repos/assignment-prompts.ts:10-11`, `mock-data.ts:51-52`, `data-actions.ts:47-48`, `prompt-composer.tsx`, `create-success-card.tsx`, `student-preview-paper.tsx`.

## Key conventions a new page must follow

1. **Wire contract `.strict()` trước tiên** — sửa `packages/api/src/contracts.ts` + server route + web `data-actions.ts` + `repos/kernel.ts#kernelCommand` trong cùng thay đổi.
2. **Mọi write qua kernel command bus** — chỉ `kind === "refreshed"` là thành công; `committed`/`unknown` hiện `KernelSubmitNotice` + reconcile; `definite-failure` giữ form.
3. **Mọi read qua snapshot** `useData()`; mapping thuần trong `repos/*`.
4. **Route** file-based + đăng ký `routeTitles` + `routes-matcher.ts`.
5. **Honest UI** — không hiển thị dữ liệu không có nguồn thật; empty state trung thực; copy tiếng Việt.
6. **Validation page-owned** — chặn sau submit; server vẫn validate zod + org-scoped.
7. **Preset catalog client-side pure module** (`assignment-presets.ts` pattern) + unit test.
8. **Tests 3 lớp**: SSR `renderToStaticMarkup` (node env), server `kernel.test.ts`, E2E Playwright survive-reload.
9. **Không đụng bảng `assignment`** (grading-only); không sửa migration đã apply.
10. Plan format `plans/<YYMMDD>-<HHMM>-slug/`.

## Risks

- `new.tsx` không dùng `@tanstack/react-form` — planner quyết định giữ useState (pattern hiện tại của mọi form trong app).
- `band` + `task` là zod enum đóng trên wire — thêm lựa chọn phải sửa contract (band enum giữ nguyên theo thiết kế mới).
- Vitest web **node env** — không test DOM; interaction bám E2E.
- Port strictPort 8000/8001; E2E fail nếu port bận.
- **Không có hạ tầng upload file** (không R2/multipart endpoint; kernel bus JSON-only) — file nghe cần quyết định kiến trúc.
