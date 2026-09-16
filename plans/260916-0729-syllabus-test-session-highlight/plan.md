---
title: "Buổi thi giữa kỳ/cuối kỳ trên Syllabus — loại buổi, highlight, import cột Loại"
description: "Thêm khái niệm loại buổi học (thường / thi giữa kỳ / thi cuối kỳ) vào syllabus: highlight buổi thi ở màn hình syllabus, đánh dấu qua modal Sửa/Thêm buổi học, và khai báo từ file import Excel/CSV qua cột Loại tùy chọn"
status: pending
priority: P2
effort: 6h
issue: 154
branch: feat/syllabus-test-session-highlight
tags: [feature, frontend, backend, database]
blockedBy: []
blocks: []
created: 2026-09-16
---

# Buổi thi giữa kỳ/cuối kỳ trên Syllabus — loại buổi, highlight, import cột Loại

## Overview

Syllabus thực tế luôn có các buổi thi giữa kỳ/cuối kỳ nhưng hiện hệ thống coi mọi
buổi như nhau: `syllabus_lesson` không có khái niệm loại buổi, import v3 (#152)
chỉ nhận 4 cột nên không có chỗ khai báo buổi thi, và màn hình syllabus detail
không có gì phân biệt buổi thi với buổi học thường. Plan này thêm field `kind`
(`lesson` | `midterm` | `final`) xuyên suốt 6 layer (migration → schema →
contract → server → client → e2e), cho phép đánh dấu buổi thi bằng 2 đường
(manual qua modal, import qua cột "Loại"), và highlight buổi thi ở màn hình
syllabus bằng nền dòng tint amber + badge gắn vào title — không hồi sinh cột
status mà #152 vừa gỡ.

## Bối cảnh & chứng cứ

- Scout report (2026-09-16): `packages/db/src/schema/syllabus.ts` —
  `syllabusLesson` chỉ có `status` (done/current/upcoming, là tiến độ lớp chứ
  không phải loại buổi); grep `midterm|final|exam|thi` toàn bộ data model =
  zero kết quả (duy nhất copy tĩnh trong `brand-panel.tsx:87`).
- Import v3: `apps/web/src/lib/syllabus-import.ts` — 4 cột, title tự sinh
  `Buổi {n}`, chặn tường minh mọi ô thứ 5 khác rỗng → hiện không thể khai báo
  buổi thi từ file.
- UI detail: `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx:279-317` —
  lesson row thuần (`grid-cols-[1fr_auto]`), #152 vừa gỡ status badge khỏi màn
  hình này → highlight phải ở cấp dòng, không tái lập cột trạng thái.
- Pattern tái dụng: prop `showStatus` tách modal syllabus/lớp
  (`add-lesson-modal.tsx`, `class-detail/curriculum-management-section.tsx:356`
  truyền `showStatus`); fallback an toàn `lessonDotClassFor()`
  (`components/syllabus/lesson-status.tsx`); Badge variants
  `warn = bg-warn-soft text-warn` với token `--warn-soft` sẵn trong
  `packages/ui/src/styles/globals.css:82`.
- Deep copy template→lớp (`buildImportBatch`, `apps/server/src/routes/kernel.ts`)
  liệt kê field tường minh khi insert → **không** tự mang `kind`; phải thêm tay.

## Quyết định đã chốt với user (2026-09-16)

1. **Import**: nâng format lên **5 cột** với cột "Loại" tùy chọn — file 4 cột
   v3 vẫn import bình thường. (Không chọn phương án chỉ-đánh-dấu-thủ-công.)
2. **Phạm vi highlight**: chỉ màn hình Syllabus (template + bản copy khi mở từ
   menu Syllabus). Màn hình Chi tiết lớp **không** thêm highlight/kind-select.

## Đặc tả: data model & nhãn UI

- `syllabus_lesson.kind`: `text NOT NULL DEFAULT 'lesson'`, union
  `"lesson" | "midterm" | "final"`. Không FK, không index mới.
- Nhãn hiển thị: `midterm` → **Thi giữa kỳ**, `final` → **Thi cuối kỳ**,
  `lesson` → không hiển thị gì. Select trong modal "Loại buổi học": Buổi học /
  Thi giữa kỳ / Thi cuối kỳ.
- Highlight ở lesson row (syllabus detail): thêm lớp nền `bg-warn-soft/50` vào
  row + `<Badge variant="warn" dot>` cạnh title. Hover `hover:bg-surface-warm`
  giữ nguyên (ghi đè khi hover là chủ đích). Giá trị `kind` lạ ngoài union →
  render như buổi thường (fallback pattern `lessonDotClassFor`). Điều kiện
  tint là **kiểm tra dương**: tint + badge chỉ khi `kind === "midterm" ||
  kind === "final"` (helper `isTestSessionKind` dùng chung cho badge và row
  tint); `kind` lạ/undefined → KHÔNG tint, KHÔNG badge.
- `kind` là **nội dung giáo trình** (sao chép theo template→lớp), khác `status`
  là tiến độ per-lớp (reset `upcoming` khi copy) — copy-on-import phải giữ
  `kind`.

## Đặc tả format import v4 (hợp đồng forensic — mọi thay đổi parser theo đúng mục này)

5 cột **theo vị trí** (thiếu pad `""`, thừa cắt; cell → `String(cell ?? "").trim()`):

| Vị trí | Cột | Bắt buộc |
|---|---|---|
| 0 | Module | Có (rỗng = kế thừa dòng trước) |
| 1 | Mô tả module | Không |
| 2 | Mục tiêu | Tạo buổi nếu bất kỳ cột 2/3/4 khác rỗng **hoặc cột 4 ≠ lesson** |
| 3 | Tài liệu | Không |
| 4 | Loại | Không (rỗng = `lesson`) |

Delta so với luật v3 (15 luật trong `plans/260915-1108-syllabus-import-v2/plan.md`):

1. `normalizeRow` chuẩn hóa về **5 cột** (was 4). Lỗi cell `Date` giữ nguyên.
2. Header check dòng 1: `cells[4].toLowerCase()` ∈ {`trạng thái`, `status`} →
   lỗi old-template v2 tường minh (vẫn chạy **trước** skip-header); `cells[2]`
   ∈ {`buổi học`, `lesson`} → lỗi old-template v1 (giữ nguyên); `cells[0]` =
   `module` → skip header (giữ nguyên).
3. **Bãi bỏ** luật per-row "cột thứ 5 thừa" của v3 — cột 5 giờ là dữ liệu.
   Thay bằng: `cells[4]` ∈ {`đã dạy`, `đang học`, `sắp tới`, `done`,
   `current`, `upcoming`} → lỗi old-template v2 ở dòng đó (dữ liệu status cũ
  lọt vào cột Loại phải báo đúng nguyên nhân, không báo "loại không hợp lệ").
4. Mapping Loại: `""`/`buổi học`/`lesson` → `lesson`; `giữa kỳ`/`midterm` →
   `midterm`; `cuối kỳ`/`final` → `final`; khác → lỗi dòng
   `Dòng {n}: loại buổi không hợp lệ '{value}' (dùng: giữa kỳ / cuối kỳ)`.
   So khớp trên chuỗi đã lowercase-trim.
5. Điều kiện tạo buổi: `cells[2] ≠ "" || cells[3] ≠ "" || kind ≠ "lesson"` —
   dòng chỉ điền Loại vẫn tạo buổi thi (không cần mục tiêu/tài liệu).
6. `SyllabusModuleContent.lessons[].kind` default `"lesson"` ở zod → payload
   create/replace luôn có kind. File v3 4 cột: `cells[4] = ""` → chạy như cũ.
7. `buildSampleCsv()`: 5 cột, giữ BOM+CRLF, thêm 1 dòng `giữa kỳ` + 1 dòng
   `cuối kỳ` — **khớp fixture e2e** (csv + xlsx regenerate bằng `exceljs`, dep
   sẵn của apps/e2e). Vị trí chốt: dòng `giữa kỳ` cuối Module 1, dòng
   `cuối kỳ` cuối Module 2 — tổng **5 buổi/2 module**; mọi e2e pin số lượng
   ("3 buổi học", `Số buổi dự kiến`, StatCard tổng buổi, ordinal "buổi 3") phải
   cập nhật theo (xem phase 3). Dữ liệu dòng sample đặt trong constant export
   `SAMPLE_ROWS` dùng chung cho `buildSampleCsv` và script regenerate fixture.

## Phạm vi

**In scope**: field kind end-to-end; đánh dấu qua Add/EditLessonModal (chỉ màn
hình syllabus); highlight syllabus detail; import v4 + preview cột Loại;
fixture/unit/e2e.

**NOT in scope**: highlight/kind-select ở màn hình Chi tiết lớp
(`curriculum-management-section.tsx` không đổi); class session/thời khóa biểu;
điểm số hay kết quả thi; đếm buổi thi ở StatCard.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Data layer + API — kind xuyên DB/contract/server](./phase-01-start.md) | Completed |
| 2 | [Web UI — đánh dấu loại buổi + highlight syllabus detail](./phase-02-web-mark-and-highlight.md) | Completed |
| 3 | [Import v4 cột Loại + fixtures + e2e](./phase-03-import-v4-and-e2e.md) | Completed |

## Success Criteria

- [x] Buổi thi tạo từ modal (màn hình syllabus) hiển thị badge "Thi giữa kỳ"/
      "Thi cuối kỳ" + nền dòng amber ở syllabus detail.
- [x] File import 5 cột có cột Loại tạo đúng buổi thi; file 4 cột v3 cũ vẫn
      import không lỗi.
- [x] Import preview hiển thị cột Loại; lỗi loại không hợp lệ báo đúng dòng.
- [x] Import template vào lớp: bản copy giữ nguyên `kind` của mọi buổi.
- [x] Màn hình Chi tiết lớp không đổi (không kind-select, không highlight).
- [x] `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter web test`,
      `pnpm --filter e2e e2e` xanh.

## Verification

```bash
pnpm db:generate                  # sau khi sửa schema (phase 1)
pnpm check-types
pnpm --filter server test
pnpm --filter web test
pnpm --filter e2e e2e
```

Lưu ý vận hành: `db:generate` chỉ sinh file migration. Môi trường dev/prod dài
hạn cần chạy `pnpm db:migrate:deploy` (packages/db) khi deploy — các gate test
trong plan đều dùng DB throwaway nên không phát hiện thiếu migrate ở target
env (risk red-team #11).

## Red Team Review

### Session — 2026-09-16 (re-run trên plan đã có, vibe pipeline gate)
**Reviewers:** Security Adversary (Fact Checker), Assumption Destroyer
(Contract Verifier) — Failure Mode Analyst timeout; các concern cốt lõi của
lens này (mất dữ liệu âm thầm, migration gap, fixture breakage) đã được 2
reviewer còn lại phủ. Tier Standard, ~56 claims checked, 1 FAILED claim
(số case test stale).

**Findings:** 12 sau dedup (13 thô), 12 accepted (1 accepted dạng rút gọn),
0 rejected. Severity: 0 Critical, 3 High, 9 Medium.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 2 thiếu `data-actions.ts` (payload union), `data-store-reducer.ts` (mirror add/edit), `apps/web/test/fixtures/mock-data.ts` (seed literal), `data-store-reducer.test.ts` — thêm `kind` bắt buộc gãy compile ở file ngoài scope; `kernel-runtime.contract.test.ts` regex-pin `data-actions.ts` | High | Accept | Phase 2 |
| 2 | Điều kiện tint `kind !== "lesson"` (âm tính) mâu thuẫn spec "kind lạ → buổi thường": kind lạ/undefined sẽ tint không badge | High | Accept | plan.md spec + Phase 2 |
| 3 | Edit modal màn hình syllabus luôn gửi kind → lost-update clobber khi snapshot stale | High | Accept (rút gọn) — kind là last-write-wins giống title/objectives (app không có optimistic locking); reject dirty-check/versioning vì out-of-scope. Ghi risk + guard test màn hình lớp | Phase 1 risk + Phase 3 |
| 4 | Rewrite fixture duy nhất sang 5 cột vỡ 10+ e2e pin (3→5 buổi, ordinal, totalCard) và chưa chốt vị trí dòng thi | Medium | Accept | plan.md luật 7 + Phase 3 |
| 5 | Phase 1 kind required trên `KernelSyllabusLessonRow` vs Phase 2 test "snapshot không kind" — mâu thuẫn compile | Medium | Accept: kind required; test "không kind" dùng cast kèm comment version-skew, normalize vẫn giữ như belt-and-braces | Phase 1 + Phase 2 |
| 6 | Risk "web chỉ gửi kind khi showKind" không có bước verify — bug payload reset kind âm thầm | Medium | Accept: unit test payload (showKind=false không chứa key kind) + e2e edit buổi thi từ màn hình lớp giữ nguyên kind | Phase 2 + Phase 3 |
| 7 | Claim "readBody strict zod 400 khi kind lạ" sai — zod non-strict STRIP unknown key, chỉ 400 với giá trị ngoài enum | Medium | Accept (diễn đạt lại) | Phase 1 risk |
| 8 | `buildSampleCsv` ↔ fixture chỉ đồng bộ bằng kỷ luật one-off — 3 bản copy không chung nguồn sự thật | Medium | Accept: constant `SAMPLE_ROWS` export + giữ script regen trong repo | Phase 3 |
| 9 | Lệch nhãn preview "Giữa kỳ/Cuối kỳ" vs `lessonKindLabel` "Thi giữa kỳ/Thi cuối kỳ"; e2e substring-match che mâu thuẫn | Medium | Accept: preview dùng `lessonKindLabel` (nhãn đầy đủ), e2e assert text đầy đủ/exact | Phase 3 |
| 10 | Rewrite fixture duy nhất xóa coverage e2e file 4 cột v3 | Medium | Accept: thêm fixture legacy `syllabus-import.legacy-v3.{csv,xlsx}` + 1 case e2e | Phase 3 |
| 11 | Verification thiếu bước apply migration cho target env | Medium | Accept (note vận hành, không auto-run remote) | plan.md Verification |
| 12 | Claim stale "16 case v3" (thực tế 22) + line-anchor drift | Medium | Accept: sửa số, ưu tiên anchor theo symbol | Phase 3 |

#### Adjudication evidence
Mọi finding đều có citation `file:line` từ reviewer (đạt evidence filter);
chi tiết từng finding trong transcript red-team session 2026-09-16. Claims
verify sai duy nhất: "16 case v3" → thực tế 22 `it(` trong
`syllabus-import.test.ts`.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-web-mark-and-highlight.md,
  phase-03-import-v4-and-e2e.md (sau khi áp findings).
- Decision deltas checked: 6 — (1) tint positive-check + `isTestSessionKind`;
  (2) vị trí + số buổi sample 5 buổi; (3) `SAMPLE_ROWS` + script regen giữ
  trong repo; (4) kind required trên row + cast test version-skew; (5) nhãn
  preview = nhãn đầy đủ `lessonKindLabel`; (6) fixture legacy v3 thêm mới.
- Reconciled stale references: 4 — plan.md luật 7 khớp phase 3 steps;
  phase 2 requirements khớp plan.md spec (tint + isTestSessionKind);
  phase 1 req 4 khớp phase 2 step 2 (cast test); phase 3 req 3 khớp step 3/6
  (nhãn đầy đủ).
- Unresolved contradictions: 0.
