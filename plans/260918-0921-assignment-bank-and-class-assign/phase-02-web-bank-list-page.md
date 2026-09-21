---
phase: 2
title: "Trang Ngân hàng bài tập /assignments/bank"
status: complete
priority: P1
effort: "4h"
dependencies: ["phase 1"]
---

# Phase 2: Trang Ngân hàng bài tập `/assignments/bank`

## Goal

Dựng trang list ngân hàng theo `assignment-bank.html`: bộ lọc 2 tầng (Dạng bài → Dạng đề phụ thuộc), hàng đề chọn để xem preview sticky bên phải, tag trạng thái trung thực (`Bản nháp` / `Đã dùng N lớp` / `Sẵn sàng`), count + "Xóa bộ lọc", empty state — tất cả đọc từ `data.assignmentPrompts` + `data.classAssignments` (tính `used`).

## Context Links

- Design chuẩn: `assignment-bank.html` — phân tích đầy đủ mục 3 của [../research/design-analysis-report.md](../research/design-analysis-report.md); kho copy text chuẩn ở mục 6.
- Pattern trang list + ChipFilter: `apps/web/src/routes/_auth/assignments/index.tsx:17-59` (assignments), `classes/index.tsx:21-51`, `students/index.tsx:19-52`.
- Genres/labels: `apps/web/src/components/assignments/assignment-presets.ts:19-124` (`TASK_PRESETS`, `taskOf`, `genreOf`, `wordCount`, `compositionDefaults`).
- Preview precedent: `apps/web/src/components/assignments/student-preview-paper.tsx` (spec dòng 41, tags 46-53).

## Key Insights

- **Thứ tự ưu tiên tag trạng thái** (`statusInfo` design): `draft` → `Bản nháp` (xám); `used > 0` → `Đã dùng {N} lớp`; còn lại `ready` chưa dùng → `Sẵn sàng` (xanh). `used` = số **distinct classId** trong `data.classAssignments` theo `promptId`.
- Bộ lọc Dạng đề phụ thuộc Dạng bài: `task1` → {Biểu đồ, Bảng số liệu, Bản đồ, Quy trình}; `task2` → {Discuss both views, Opinion, Advantages, Problem / Solution}; `all` → gộp; luôn có chip đầu `Tất cả dạng`. Đổi Dạng bài làm genre hiện tại invalid → tự reset `all`. Value chips = preset id trong `TASK_PRESETS` (chart/table/map/process/discuss/opinion/advantage/problem) — label hiển thị lấy từ preset.
- Hàng đề = button (dùng `aria-pressed` cho selected — quyết định red-team F14, thay cho role listbox/option của mock); selected → cập nhật preview; item đang chọn bị lọc khỏi list → tự chọn item đầu. Sắp xếp mới nhất trước (`createdAt` desc — trường này phase 1 đã thêm lên wire dạng ISO).
- Count `Đang hiện {N} / {M} đề`: N = kết quả lọc (tính cả query), M = tổng **cả draft**; `aria-live="polite"`. Bank hiển thị cả draft (khác picker ở phase 3 chỉ hiện ready).
- **Search trong trang là của design** (red-team F7 — `assignment-bank.html:199,312-319,390` wiring state.query): text input **đặt trong filter card** (không đụng topnav), placeholder/aria-label `Tìm đề theo tiêu đề hoặc nguồn`, match không phân biệt hoa thường theo title + source + genre label; query nằm chung state filter — "Xóa bộ lọc" reset cả query; count phản ánh query.
- Words/minutes derived từ task preset (Task 1: 150 từ · 20 phút; Task 2: 250 từ · 40 phút) — encode trong chip `Task 1 · 150 từ`.
- Không có action per-row (không edit/delete/giao ngay) — hàng chỉ chọn-xem-trước; giao bài qua trang Lớp học (preview-note link).
- Preview-note giữ **nguyên văn copy tĩnh của design** cho mọi đề (red-team F8): `Đề này chưa giao lớp. Giao cho học viên ở trang Lớp học.` — thông tin `used` đã có ở tag hàng đề, không thêm nhánh copy mới.

## Requirements

- Route file `apps/web/src/routes/_auth/assignments/bank.tsx` (static `/assignments/bank` thắng `$assignmentId` — precedent `/assignments/new`); breadcrumb `Bài tập / Ngân hàng` ("Bài tập" → `/assignments`).
- PageHead: h1 `Ngân hàng bài tập`, lead `Đề đã lưu sau khi soạn. Lọc theo dạng bài rồi giao cho lớp ở trang Lớp học.`, CTA phải btn-primary `Tạo đề mới` → `/assignments/new`.
- Grid `lg:grid-cols-[1.35fr_0.95fr]`: trái = card bộ lọc + list; phải = aside preview sticky (`lg:sticky lg:top-[76px]`).
- **Card bộ lọc**: text input search (Key Insights) đặt trên cùng; block `Dạng bài` (chips): `Tất cả` / `Task 1 · 150 từ` (task1) / `Task 2 · 250 từ` (task2); block `Dạng đề` (id genre-block) chips theo Key Insights + chip đầu `Tất cả dạng`; chân card: `result-count` (`Đang hiện **N** / M đề`) + nút ghost `Xóa bộ lọc` (chỉ render khi có filter — task ≠ all, genre ≠ all, hoặc query ≠ ""; reset tất cả về mặc định + clear text). Chip active: nền fg, chữ trắng (dùng biến style hiện có của `ChipFilter`/`apps/web/src/components/assignments/prompt-composer.tsx:46-71` — thống nhất với trang new).
- **List hàng đề**: mỗi hàng grid `1fr auto` min-h ~72px: trái = h3 title + row-meta (tag genre label + meta source + meta `Thêm {dd/mm/yyyy}` từ `createdAt`); phải = tag trạng thái (statusInfo) + meta `{Task 1|Task 2} · Band {x}`. Hover viền đậm; selected nền surface + viền fg + `aria-pressed="true"`. Default select: đề mới nhất.
- **Preview aside** (mở rộng `StudentPreviewPaper` hoặc component mới `BankPreviewAside` re-use nội dung): kicker `Xem trước phía học viên`; title; spec `Academic · {words} từ · {minutes} phút · Band {band}`; body `pre-wrap`; tags: genre label · `Band {x}` · source · `{Task 1|Task 2}`; preview-note tĩnh `Đề này chưa giao lớp. Giao cho học viên ở trang Lớp học.` (`Lớp học` → `/classes`). Preview hiện cho cả draft.
- **Empty state**: ẩn list + preview khi lọc ra 0 → card canh giữa: h2 `Không có đề khớp bộ lọc`, p `Thử dạng bài khác, hoặc xóa bộ lọc để xem toàn bộ ngân hàng.` (đúng design — KHÔNG thêm nút vào card này, red-team F8). Ngân hàng 0 đề tuyệt đối: cùng card + CTA `Tạo đề mới` → `/assignments/new` (recorded decision).
- **Wiring**: thêm `"/assignments/bank"` vào `VALID_EXACT_ROUTES` (`apps/web/src/routes-matcher.ts:4-18`) + case test `routes-matcher.test.ts`; `routeTitles` thêm `"/_auth/assignments/bank": "Ngân hàng bài tập"` (`apps/web/src/components/layout/app-shell.tsx:9-26`); trang `/assignments` (`apps/web/src/routes/_auth/assignments/index.tsx:54-59`) thêm nút ghost link `Ngân hàng đề` cạnh `+ Tạo bài tập`; `create-success-card.tsx` thêm link phụ `Xem ngân hàng đề` → `/assignments/bank` (dòng meta/copy giữ #202).

## Related Code Files

- Create: `apps/web/src/routes/_auth/assignments/bank.tsx`, `apps/web/src/routes/_auth/assignments/bank.test.tsx` (phase 4 mới viết assert — scaffold có thể để phase 4), component `apps/web/src/components/assignments/bank-preview-aside.tsx` (nếu tách khỏi StudentPreviewPaper)
- Modify: `apps/web/src/routes-matcher.ts`, `apps/web/src/routes-matcher.test.ts`, `apps/web/src/components/layout/app-shell.tsx`, `apps/web/src/routes/_auth/assignments/index.tsx`, `apps/web/src/components/assignments/create-success-card.tsx`, có thể `apps/web/src/components/assignments/student-preview-paper.tsx` (thêm props `academicPrefix`/`dueLabel`/`noteTag` tuỳ chọn)
- Delete: không

## Implementation Steps

1. Tạo route file `bank.tsx`: đọc `useData()`, derive `usedByPromptId` (Map từ `classAssignments`), state `task` ("all"|"task1"|"task2") + `genre` ("all"|presetId) + `query` (string); memo list lọc theo task + genre + query (match title/source/genre label, lowercase); sort `createdAt` desc (ISO string so được trực tiếp); `selectedId` mặc định → đề đầu.
2. Dựng filter card (search input + 2 block chips + count + Xóa bộ lọc) + list hàng đề theo Requirements (dùng `ChipFilter`, `Tag`, `Card`, `SectionLabel` hiện có; ngày `dd/mm/yyyy` format từ ISO `createdAt` — helper chung với phase 3).
3. Dựng preview aside (reuse/extend StudentPreviewPaper): truyền prompt đang chọn; spec/tags theo design; preview-note tĩnh đúng design.
4. Empty states 2 loại (filter-empty vs zero-bank).
5. Wiring: matcher + title + CTA `/assignments` + link từ create-success-card.
6. Chạy dev server (`pnpm dev`) tự kiểm bằng tay: tạo 2 đề (1 ready, 1 draft) từ `/assignments/new`, vào `/assignments/bank` từ nút mới, kiểm filter/search/preview/count/reset.

## Todo

- [ ] Route + data derive (used, filter task/genre/query, sort, selected)
- [ ] Filter card: search input + 2 tầng chips + count + Xóa bộ lọc
- [ ] List hàng đề + tag trạng thái statusInfo
- [ ] Preview aside sticky + preview-note tĩnh design
- [ ] Empty states
- [ ] Wiring (matcher, title, CTA /assignments, link success card)

## Success Criteria

- `/assignments/bank` khớp cấu trúc design; mọi copy text đúng kho chuẩn (mục 6 research report); vào được từ nút `Ngân hàng đề` trên `/assignments`.
- Filter task ↔ genre liên động đúng (đổi task reset genre invalid); search lọc theo title/source/genre; count đúng N/M; "Xóa bộ lọc" chỉ hiện khi có filter và reset sạch (kể cả query).
- Tag trạng thái đúng ưu tiên draft > used > ready; "Đã dùng N lớp" phản ánh `classAssignments` thật.
- `pnpm check-types` xanh; routes-matcher test có case `/assignments/bank` xanh.

## Verification

```bash
pnpm check-types
cd apps/web && npx vitest run routes-matcher
pnpm dev  # tự kiểm tay theo bước 6
```

## Risk Assessment

- **R1: Trùng visual chip filter với trang new** — dùng lại `ChipFilter` + label y hệt preset; không tạo style mới.
- **R2: Route `/assignments/bank` vs `$assignmentId`** — TanStack Router xếp static trên dynamic (precedent #202 F1); routes-matcher exact key chốt service worker; E2E phase 4 mở trực tiếp URL.
- **R3: Ngày `Thêm {date}` timezone** — `createdAt` là ISO string trên wire (phase 1); format dd/mm/yyyy qua helper ngày dùng chung (chuẩn VN), không phụ thuộc múi giờ trình duyệt.

## Security Considerations

- Trang chỉ đọc snapshot đã org-scoped; không có mutation mới. Nội dung đề render qua JSX text node (không `innerHTML`).

## Next Steps

- Phase 3 tái dùng logic statusInfo + preview cho picker và tab Bài tập.
