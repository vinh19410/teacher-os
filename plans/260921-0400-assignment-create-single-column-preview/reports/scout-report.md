# Scout Report — assignment-create-single-column-preview

Ngày scout: 2026-09-21 · Branch: `develop` · Mọi claim dưới đây đã đọc trực tiếp file trong phiên này (file:line là vị trí hiện tại).

## 1. Trang tạo đề `/assignments/new` (đối tượng thay đổi chính)

- File: `apps/web/src/routes/_auth/assignments/new.tsx` (261 dòng). Route `/_auth/assignments/new` (new.tsx:17-19).
- State thuần useState: `ComposerState` 8 field (new.tsx:21-29) + `status: "draft"|"ready"` riêng (new.tsx:59) + dirty flags + `saved` (new.tsx:60-63).
- `const _navigate = useNavigate()` (new.tsx:54) — **không dùng** (import new.tsx:1). `useData()` (new.tsx:55) **chỉ** feeds `BankContextCard` qua `prompts={data.assignmentPrompts}` (new.tsx:205) → sau thay đổi bỏ cả `useData` import (new.tsx:14).
- Layout 2 cột: grid `lg:grid-cols-[1.45fr_0.9fr]` (new.tsx:194) — trái `PromptComposer` (new.tsx:195-200), phải `flex flex-col gap-5` chứa `BankContextCard` (new.tsx:202-206) + `StudentPreviewPaper` (new.tsx:207-216).
- Sticky action bar (new.tsx:220-256): notice/error + hàng `flex flex-wrap items-center justify-between gap-3` (new.tsx:233) — trái actionCopy (new.tsx:234-237, định nghĩa new.tsx:147-160), phải cụm nút: "Hủy" secondary (new.tsx:239-246) + submit (new.tsx:247-253, label "Đang lưu…"/"Lưu bản nháp"/"Lưu vào ngân hàng").
- `resetAll` (new.tsx:94-102) reset về defaults — giữ nguyên behavior. Submit qua `useKernelFormSubmit` command `create-assignment-prompt` (new.tsx:108-120); `result?.kind === "refreshed"` → `CreateSuccessCard` thay form (new.tsx:121-131, 182-191).
- Không có StrictMode ở bootstrap: `apps/web/src/main.tsx:31-40` dùng `createRoot(...).render(...)` trần → `useState` initializer chạy đúng 1 lần mỗi mount (an toàn cho restore-on-mount phase 2).

## 2. Hai component cột phải

- `apps/web/src/components/assignments/bank-context-card.tsx` (93 dòng): note "Đề này chỉ được thêm vào ngân hàng bài tập…" (bank-context-card.tsx:38-48); chips `ChipFilter` `["Bản nháp", "Sẵn sàng giao"]` (bank-context-card.tsx:52-58) — giá trị map `label === "Bản nháp" ? "draft" : "ready"`; list "Đề đã có" 5 đề gần nhất + "còn N đề khác" (bank-context-card.tsx:61-90); empty "Chưa có đề nào trong ngân hàng." (bank-context-card.tsx:63-66). **Chỉ được dùng trong new.tsx** (grep toàn apps/web: import new.tsx:7, usage new.tsx:202) → sau thay đổi XÓA FILE.
- `apps/web/src/components/assignments/student-preview-paper.tsx` (61 dòng): props 8 string (student-preview-paper.tsx:8-26); kicker "Xem trước phía học viên" (:34-36); title fallback `genreOf(task,genre).title` (:29, :37-39); meta `Academic · {t.words} từ · {t.minutes} phút · Band {band}` (:40-42); prompt fallback "Đề sẽ hiện ở đây khi bạn soạn." (:44); tags task/genre/band/source/note/status (:46-53); word count (:54-58). Render text node thuần, không innerHTML. **CHỈ dùng trong new.tsx** hiện tại (grep: import new.tsx:10, usage new.tsx:207) → GIỮ LẠI, tái dùng cho trang preview mới.

## 3. Wiring route

- `routeTitles`: `apps/web/src/components/layout/app-shell.tsx:9-27`; hiện có `"/_auth/assignments/new": "Tạo bài tập"` (:18), `"/_auth/assignments/bank"` (:19) → cần thêm `"/_auth/assignments/preview": "Xem trước bài tập"`.
- `VALID_EXACT_ROUTES`: `apps/web/src/routes-matcher.ts:4-19` (có `/assignments/new` :14, `/assignments/bank` :15). `/assignments/preview` tuy khớp dynamic prefix `/assignments/` (routes-matcher.ts:24-29, sub không chứa `/`) nhưng convention repo là thêm exact key + test case (`apps/web/src/routes-matcher.test.ts:24-26` là nơi list exact routes hợp lệ).

## 4. Tests hiện có (sẽ bị ảnh hưởng)

- `apps/web/src/routes/_auth/assignments/new.test.tsx` (110 dòng): vitest env **node**, `renderToStaticMarkup` (:1, :71); mock `@tanstack/react-router` (:46-52), `@/lib/data-store` (:53-55), `@/lib/use-kernel-form-submit` (:56-58). 4 test: structure defaults (assert "Academic · 250 từ · 40 phút · Band 7.0" :77 — đến từ preview paper; "Sẵn sàng lưu vào ngân hàng" :79; submit enabled :81-85); bank list snapshot ("Writing Task 2 — Opinion", không "Đã dùng" :88-94); empty-bank copy (:96-101); server error (:103-109).
- E2E phụ thuộc chip "Bản nháp" **trên trang tạo** (click để set draft): `apps/e2e/specs/assignment-prompt-create.spec.ts:50`; `apps/e2e/specs/assignment-bank.spec.ts:25`; `apps/e2e/specs/class-assign.spec.ts:64`. → nhãn chip phải giữ nguyên "Bản nháp"/"Sẵn sàng giao", chỉ dời vị trí.
- E2E **sẽ vỡ khi xóa card Ngân hàng** (assert list "Đề đã có" trên trang tạo): `assignment-prompt-create.spec.ts:36-39` (TITLE visible sau "Tạo đề khác"), `:42-43` (reload), `:60-62` (draft + TITLE). → phase 1 phải sửa các assert này (chuyển sang `/assignments/bank`); 2 spec kia chỉ click chip, không assert list trên trang tạo.
- E2E không thuộc gate `pnpm test` (turbo): `apps/e2e/package.json` không có script `test` (chỉ `e2e`, `boot:api`, `check-types`). Playwright: `apps/e2e/playwright.config.ts:33-51` — webServer vite :8001 `--strictPort` + API :8000, `reuseExistingServer: false`.

## 5. Server / data layer (KHÔNG đổi)

- POST `/api/assignments/prompts` nhận đúng 8 field (new.tsx:110-119), snapshot `data.assignmentPrompts` (mock-data type `AssignmentPrompt`). Không đụng DB, contracts, API.

## 6. Primitives & precedents tái dùng

- `Button` variants primary/secondary/ghost/danger, default `type="button"`: `apps/web/src/components/ui/button.tsx:3-19,29`.
- `Textarea` export từ `apps/web/src/components/ui/field.tsx:114` (không có file textarea riêng); `Field` label wrap cùng file.
- `Card variant="white"`, `SectionLabel`, `PageHead {title, lead}` (`apps/web/src/components/ui/page-head.tsx:3-13`), `Tag`, `ChipFilter` (aria-pressed).
- Pattern "nút điều hướng": repo dùng `Button onClick={() => navigate({ to: ... })}` (`apps/web/src/routes/_auth/assignments/bank.tsx:159-181`) chứ không có Link-button primitive.
- `wordCount(text)` — đếm từ whitespace: `apps/web/src/components/assignments/assignment-presets.ts:105-109`.
- Precedent storage-guard: `apps/web/src/lib/sidebar-prefs.ts:1-22` (try/catch, degrade silent) — module mới phase 2 làm theo kiểu này nhưng với `sessionStorage` + guard `typeof window === "undefined"` (vitest web chạy node env).

## 7. Plan pending liên quan (override target)

- `plans/260921-0351-assignment-create-redesign/research/design-spec.md` (138 dòng, skeleton chưa implement): §1 "Bố cục tổng thể" (dòng 7, grid 2 cột), §3 "Card Ngân hàng" (dòng 76), §4 "Preview Xem trước phía học viên" (dòng 84, render inline) — plan MỚI này override 3 section đó bằng addendum cuối file.
- `bank-preview-aside.tsx` (dùng bởi `apps/web/src/routes/_auth/assignments/bank.tsx:12`) là non-goal, không đụng.

## 8. Verification commands (repo)

```bash
pnpm --filter web test                        # unit web (node env, renderToStaticMarkup)
cd apps/server && npx vitest run              # server (không đổi, chạy xác nhận không vỡ)
cd apps/e2e && npx playwright test assignment-prompt-create   # + assignment-bank, class-assign
pnpm check && pnpm check-types && pnpm test   # full gate (biome + turbo types + turbo test)
```

Ghi chú: `pnpm check` là `biome check --write .` (package.json:19) — sẽ tự format file nó chỉnh.
