---
phase: 2
title: "Trang xem trước /assignments/preview + snapshot draft sessionStorage"
status: todo
priority: P1
effort: "2h"
dependencies: ["phase 1"]
---

# Phase 2: Trang xem trước làm bài của học viên

## Context Links

- Plan: [plan.md](./plan.md) — Key Decisions 3, 4, 5, 6.
- Evidence: [reports/scout-report.md](./reports/scout-report.md).
- Precedents: storage-guard `apps/web/src/lib/sidebar-prefs.ts:1-22`; nút điều hướng `Button onClick={() => navigate(...)}` `apps/web/src/routes/_auth/assignments/bank.tsx:159-181`; `Textarea` export `apps/web/src/components/ui/field.tsx:114`; `wordCount` `apps/web/src/components/assignments/assignment-presets.ts:105-109`; test route node-env `apps/web/src/routes/_auth/assignments/bank.test.tsx:46-58`.

## Overview

Thêm đường ray dữ liệu cho luồng "Xem trước": module thuần `assignment-preview-draft.ts` (sessionStorage, guard SSR/parse), nút "Xem trước" trong action bar của `/assignments/new` (ghi snapshot → navigate), khôi phục form một lần khi quay lại, và trang mới `/assignments/preview` render paper đề tái dùng `StudentPreviewPaper` + vùng làm bài mô phỏng (không lưu) + empty state trung thực. Đăng ký route ở `routeTitles` + `VALID_EXACT_ROUTES`. Không đụng server/data layer.

## Key Decisions

1. **Snapshot contract module thuần** — `apps/web/src/lib/assignment-preview-draft.ts`, key `teacher-os:assignment-preview-draft`, giá trị JSON của `{ task, genre, title, band, source, prompt, note, status }` (mọi field là string; `status: "draft" | "ready"`). API: `savePreviewDraft(draft)` ghi đè; `readPreviewDraft()` đọc **không xóa** (reload trang preview vẫn chạy); `takePreviewDraft()` đọc **+ xóa** (create page dùng khi mount). Mọi access phải guard `typeof window === "undefined"` (vitest web là node env — new.test.tsx:1,71; chống SSR) rồi mới chạm `window.sessionStorage` trong try/catch (privacy mode/quota — pattern sidebar-prefs.ts:4-22). Parse JSON trong try/catch + type-check từng field là string + `status` ∈ {"draft","ready"} — sai shape → `null` (và `take` vẫn dọn key rác).
2. **Nút "Xem trước"** — `Button variant="secondary"` đặt cạnh trái "Hủy" trong cụm nút action bar; luôn enabled (preview có fallback text); click → `savePreviewDraft({ ...value, status })` → `navigate({ to: "/assignments/preview" })`. Dùng biến `_navigate` đã có (new.tsx:54) — bỏ dấu gạch dưới.
3. **Restore một lần khi mount create page** — `useState(() => takePreviewDraft())` chạy đúng 1 lần/lần mount vì app không bọc StrictMode (main.tsx:31-40). Có snapshot hợp lệ → khởi tạo `value` từ 8 field snapshot và `status` từ snapshot; **phải set `dirtyTitle`/`dirtyPrompt` = true khi restore** — nếu không, teacher đổi Dạng bài/Dạng đề sẽ bị `compositionDefaults` (new.tsx:80-89) ghi đè title/prompt vừa khôi phục vì flag còn false. "Hủy"/"Tạo đề khác" giữ nguyên reset về defaults (không restore lại).
4. **Route preview flat** — `apps/web/src/routes/_auth/assignments/preview.tsx` (`createFileRoute("/_auth/assignments/preview")`), KHÔNG nested dưới `new` (tránh thêm Outlet vào new.tsx). Trang thuần client-state, không gọi `useData` — đúng honest UI: chỉ hiển thị gì có trong snapshot.
5. **Thân trang preview** — đọc `readPreviewDraft()` trong `useState` initializer; có snapshot → container `max-w-3xl flex flex-col gap-5`: (a) `<StudentPreviewPaper>` với 8 props từ snapshot (giữ fallback sẵn có: title rỗng → `genreOf(task,genre).title`, prompt rỗng → "Đề sẽ hiện ở đây khi bạn soạn."); (b) `Card variant="white"` "Bài làm của học viên (mô phỏng)": heading + `Textarea` placeholder `"Học viên sẽ viết bài ở đây…"` (state cục bộ) + dòng đếm `"{N} từ"` (dùng `wordCount`) + dòng mono `"Bản xem trước — bài làm không được lưu."`.
6. **Header + empty state** — breadcrumb `Bài tập / Tạo mới / Xem trước` ("Bài tập" → `/assignments`, "Tạo mới" → `/assignments/new`); hàng đầu `flex … justify-between` chứa `PageHead` title `"Xem trước bài tập"`, lead `"Trang này mô phỏng đề bài đúng như học viên sẽ đọc khi làm. Bài làm ở đây không được lưu."` + `Button` secondary `"Quay lại soạn đề"` → `/assignments/new` (dùng Button + `navigate` theo precedent bank.tsx:159-181 — repo không có primitive Link-button). Không có snapshot (null/rác) → `Card` canh giữa: h2 `"Chưa có bản nháp nào để xem trước."`, p `"Soạn đề ở trang tạo bài tập rồi bấm Xem trước."`, `Button` `"Mở trang tạo bài tập"` → `/assignments/new`.
7. **Wiring** — `routeTitles["/_auth/assignments/preview"] = "Xem trước bài tập"` (app-shell.tsx:9-27); `"/assignments/preview": true` vào `VALID_EXACT_ROUTES` (routes-matcher.ts:4-19) + thêm case vào list exact routes trong `routes-matcher.test.ts:24-26`.

## Related Code Files

| Action | File |
|--------|------|
| Create | `apps/web/src/lib/assignment-preview-draft.ts` |
| Create | `apps/web/src/lib/assignment-preview-draft.test.ts` |
| Create | `apps/web/src/routes/_auth/assignments/preview.tsx` |
| Create | `apps/web/src/routes/_auth/assignments/preview.test.tsx` |
| Modify | `apps/web/src/routes/_auth/assignments/new.tsx` (nút Xem trước + restore) |
| Modify | `apps/web/src/components/layout/app-shell.tsx` (routeTitles) |
| Modify | `apps/web/src/routes-matcher.ts` + `apps/web/src/routes-matcher.test.ts` |
| Delete | không |

## Implementation Steps

1. **Module snapshot** `apps/web/src/lib/assignment-preview-draft.ts`: export `PREVIEW_DRAFT_KEY = "teacher-os:assignment-preview-draft"`, type `PreviewDraft { task, genre, title, band, source, prompt, note: string; status: "draft" | "ready" }` và 3 hàm `savePreviewDraft` / `readPreviewDraft` / `takePreviewDraft` đúng contract Key Decision 1 (guard window → try/catch → validate từng field). Tuyệt đối không throw — mọi failure trả `null`/no-op.
2. **Unit test** `assignment-preview-draft.test.ts` (node env): dựng `fakeStorage` Map-based `{ getItem, setItem, removeItem }` rồi `vi.stubGlobal("window", { sessionStorage: fakeStorage })` — stub `window` (chứa `sessionStorage`) chứ không chỉ `sessionStorage`, vì module guard theo `typeof window`; `afterEach(() => vi.unstubAllGlobals())`. Cases: (a) save → read trả đủ 8 field; (b) read gọi 2 lần vẫn ra (không xóa); (c) take trả về rồi take/read lần sau → `null` (đã xóa); (d) JSON rác (`"{oops"`) → `null`; (e) shape sai (thiếu field / field không phải string / `status: "ready!!"`) → `null`; (f) không stub window → mọi hàm an toàn, read → `null`.
3. **`new.tsx`**: đổi `_navigate` → `navigate` (new.tsx:54). Thêm `const [restored] = useState(() => takePreviewDraft());`; đổi `useState<ComposerState>(freshComposer)` (new.tsx:58) thành initializer: có `restored` → pick 8 field từ snapshot, không → `freshComposer()`; khởi tạo `status` = `restored?.status ?? "ready"` (new.tsx:59) và `dirtyTitle`/`dirtyPrompt` = `!!restored` (new.tsx:60-61 — lý do xem Key Decision 3). Thêm nút "Xem trước" (secondary) vào cụm nút trước "Hủy": `onClick={() => { savePreviewDraft({ ...value, status }); navigate({ to: "/assignments/preview" }); }}`.
4. **Route** `preview.tsx` theo Key Decisions 4-6: breadcrumb, hàng PageHead + nút "Quay lại soạn đề", nhánh snapshot (paper + card làm bài) và nhánh empty state. Copy đúng từng chữ trong Key Decisions 5-6.
5. **Wiring** Key Decision 7: routeTitles + VALID_EXACT_ROUTES + test case routes-matcher.
6. **Component test** `preview.test.tsx` (node env, `renderToStaticMarkup`): mock `@tanstack/react-router` như bank.test.tsx:46-52 (`createFileRoute` passthrough, `useNavigate: () => vi.fn()`, `Link` stub `<a>`); KHÔNG mock data-store (trang không dùng). 3 test: (a) stub window + sessionStorage chứa snapshot hợp lệ (task2/discuss, title `"QC Preview Essay"`, prompt có nội dung) → html chứa `"Xem trước bài tập"`, `"QC Preview Essay"`, `"Academic · 250 từ · 40 phút · Band 7.0"`, `"Bài làm của học viên (mô phỏng)"`, `"Học viên sẽ viết bài ở đây…"`, `"Bản xem trước — bài làm không được lưu."`, `"Quay lại soạn đề"`; (b) không stub → `"Chưa có bản nháp nào để xem trước."` + `"Mở trang tạo bài tập"`, không chứa `"Bài làm của học viên"`; (c) stub trả JSON rác → empty state như (b).
7. Cập nhật `new.test.tsx`: trong test structure, thêm assert html chứa nút `"Xem trước"` (render SSR tĩnh — không click được trong node env; click path do E2E phase 3 phủ).
8. Tự kiểm tay (`pnpm dev`): soạn dở → "Xem trước" → trang preview đúng đề → reload preview vẫn hiện → "Quay lại soạn đề" → form còn nguyên → "Hủy" → về defaults → vào trực tiếp URL `/assignments/preview` khi chưa có snapshot → empty state.

## Todo

- [ ] Module `assignment-preview-draft.ts` + 6 unit test cases
- [ ] new.tsx: nút "Xem trước" + restore-on-mount (kèm dirty flags)
- [ ] Route `preview.tsx`: paper + card làm bài mô phỏng + empty state
- [ ] Wiring routeTitles + VALID_EXACT_ROUTES + routes-matcher test
- [ ] `preview.test.tsx` 3 cases + assert "Xem trước" trong new.test.tsx
- [ ] Tự kiểm tay 8 bước luồng ở bước 8

## Success Criteria

- [ ] Soạn dở → bấm "Xem trước" → URL `/assignments/preview`, paper hiện đúng title/spec/prompt/tags của draft; reload preview vẫn hiện
- [ ] Card "Bài làm của học viên (mô phỏng)" có Textarea + đếm từ + dòng "Bản xem trước — bài làm không được lưu."; gõ vào không tạo request mạng nào
- [ ] "Quay lại soạn đề" → form còn nguyên giá trị (kể cả đổi Dạng bài sau đó không bị preset đè mất nội dung đã khôi phục); "Hủy"/"Tạo đề khác" → defaults
- [ ] Vào `/assignments/preview` không snapshot (hoặc JSON rác) → empty state đúng copy; topbar title "Xem trước bài tập"
- [ ] `cd apps/web && npx vitest run` xanh toàn bộ (kể cả routes-matcher, preview, assignment-preview-draft, new); `pnpm check-types` xanh

## Risk Assessment

- **R1 (Medium): vitest node env không có `window`/`sessionStorage`** — module guard `typeof window === "undefined"`; test phải stub `window` (bọc `sessionStorage` bên trong) chứ không chỉ stub `sessionStorage`, nếu không guard chặn sớm và test (a) âm thầm thành empty state.
- **R2 (Medium): StrictMode double-invoke initializer sẽ nuốt snapshot** (lần 1 take xóa, lần 2 nhận null) — hiện app không dùng StrictMode (main.tsx:31-40) nên an toàn; ghi chú: nếu sau này thêm StrictMode phải chuyển restore sang `useEffect` mount một lần.
- **R3 (Low): sessionStorage bị chặn (privacy mode/quota)** — mọi hàm try/catch trả null → preview empty state trung thực, create page hoạt động bình thường (không crash).
- **R4 (Low): snapshot cũ còn trong tab dài** — semantics "một lần": take ở lần mount create kế tiếp; đóng tab là sessionStorage tự chết theo tab. Chấp nhận, không thêm TTL (KISS).
- **R5 (Low): dirty-flag khi restore** — đã xử lý trong Key Decision 3; E2E phase 3 sẽ khóa regression bằng bước đổi dạng đề? Không — chỉ khóa "form còn dữ liệu"; dirty flag được phủ bằng tự kiểm tay bước 8.

## Security Considerations

- Nội dung draft chỉ nằm trong `sessionStorage` same-origin, per-tab, không gửi lên server — không tăng surface dữ liệu. Trang preview render toàn bộ qua JSX text node (`StudentPreviewPaper` không dùng innerHTML) — không XSS mới. Empty state không bịa dữ liệu (honest UI).

## Verification Commands

```bash
cd apps/web && npx vitest run assignment-preview-draft preview new routes-matcher
pnpm check-types
pnpm dev  # tự kiểm tay theo bước 8
```

## Next Steps

- Phase 3 khoá toàn bộ luồng bằng E2E Playwright (soạn → xem trước → quay lại còn form → lưu ready → reload) và chạy full gate + 3 spec phụ thuộc chip "Bản nháp".
