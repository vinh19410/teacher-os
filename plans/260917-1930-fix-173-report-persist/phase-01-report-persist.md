---
phase: 1
title: "Schema+migration → contract → POST route → web action+modal → tests"
status: in-progress
depends: []
files:
  - packages/db/src/schema/report.ts
  - packages/db/src/migrations/ (generated)
  - packages/api/src/contracts.ts
  - apps/server/src/routes/reporting/index.ts
  - apps/server/src/kernel.test.ts
  - apps/web/src/lib/data-actions.ts
  - apps/web/src/lib/repos/kernel.ts
  - apps/web/src/lib/data-store-reducer.ts
  - apps/web/src/components/modals/create-report-modal.tsx
  - apps/web/src/lib/repos/kernel.test.ts (new — kernelCommand mapping)
---

# Phase 1: Report persist end-to-end

## 1. DB: cột content/channel

`packages/db/src/schema/report.ts` thêm:

```ts
content: text("content").notNull().default(""),
channel: text("channel").notNull().default(""),
```

Chạy `pnpm --filter @teacher-os/db db:generate` → migration SQL mới (ADD COLUMN). Verify migration file + meta snapshot sinh ra.

## 2. Contract

`packages/api/src/contracts.ts`:

```ts
export const reportCreateSchema = z
	.object({
		studentId: z.string().min(1),
		period: z.string().trim().min(1),
		content: z.string().max(4000),
		channel: z.enum(["Zalo OA", "Email"]),
		status: z.enum(["draft", "sent"]),
	})
	.refine((v) => v.status !== "sent" || v.content.trim().length > 0, {
		message: "content required when sending",
	});
```

## 3. Server: POST /api/reports

`reportRoutes` (reporting/index.ts) thêm `routes.post("/")` — copy cấu trúc commentBankRoutes POST:

1. `kernelCtx` guard → 401.
2. `reportCreateSchema.safeParse` → 400 "invalid body".
3. Verify student: `select id from student where id = ? and orgId = ?` → miss → 400 "unknown student".
4. Insert `report`: id `crypto.randomUUID()`, orgId, studentId, period, content: body.content.trim() (sent) / as-is (draft), channel, status, sessions: 0, sent: `status==="sent" ? new Date().toISOString() : ""`, read: "".
5. Trả `c.json<CreatedResponse>({ id }, 201)`.

## 4. Web wiring

- `data-actions.ts`: `{ type: "create-report"; payload: { studentId: string; period: string; content: string; channel: string; status: "draft" | "sent" } }`.
- `repos/kernel.ts` `kernelCommand` case `create-report` → `{ path: "/api/reports", body: { ...action.payload } }`.
- `data-store-reducer.ts`: `case "create-report": return state;` (fixture-inert pattern như add-comment-bank, comment giải thích runtime refresh).
- `create-report-modal.tsx`:
  - `const { data, dispatch } = useData();` + `const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);`
  - `save(status)`: guard busy/sid-empty; `dispatch({type:"create-report", payload:{studentId: sid, period, content, channel, status}})`; result `definite-failure` → setError inline, giữ modal; `refreshed`/`committed`/`outcome-unknown` → reset form fields + onClose (unknown → toast do reportDirectOutcome? modal không dùng hook đó — hiển thị notice đóng như grade-modal: chỉ close cho refreshed/committed, unknown vẫn đóng nhưng toast hệ thống sẽ hiện qua outcome reporter? grade-modal dùng setNotice. Đơn giản: refreshed/committed → onClose; outcome-unknown → setError "Không chắc đã lưu — kiểm tra danh sách."; definite-failure → setError).
  - Nút "Lưu nháp" type="button" onClick={() => void save("draft")}; nút "Gửi báo cáo" giữ type="submit", disabled khi busy.
  - Giữ nguyên UI/copy field.

## 5. Tests

- `apps/server/src/kernel.test.ts` (mở rộng describe reports hiện có quanh dòng 2261):
  - POST sent (student org A) → 201; GET /api/reports có row status "sent", sent != "".
  - POST draft → row "draft", sent "".
  - POST student org B → 400; body rác → 400; chưa đăng nhập → 401.
  - Fixture: xem cách test hiện tại tạo org/student (t.call + helpers sẵn).
- `apps/web/src/lib/repos/kernel.test.ts` (mới): `kernelCommand({type:"create-report",...})` → path `/api/reports`, body đúng 5 field.
- `data-store-reducer.test.ts`: create-report inert.
- Contract test `kernel-runtime.contract.test.ts`: assert modal source chứa `type: "create-report"` (pattern dòng 475).

## Verification

```bash
pnpm --filter @teacher-os/db db:generate
cd apps/server && npx vitest run src/kernel.test.ts
cd apps/web && npx vitest run && npx tsc --noEmit
cd ../.. && pnpm exec biome check . (exit 0, KHÔNG qua pipe)
```
Manual /reports: gửi report → list + nhật ký hiện ngay; Lưu nháp → báo cáo hiện ở list với status Nháp.
