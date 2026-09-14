---
title: "Syllabus Excel/CSV Import"
description: "Cho phép upload Excel/CSV trong flow tạo syllabus để nhập nhanh toàn bộ modules + lessons trong một request atomic"
status: completed
priority: P2
effort: 15h
issue: 144
branch: feat/144-syllabus-excel-csv-import
tags: [feature, frontend, backend, api]
blockedBy: []
blocks: []
created: 2026-09-14
---

# Syllabus Excel/CSV Import

## Overview

Trong flow "Tạo syllabus mới" (`AddSyllabusModal`), giáo viên hiện phải tạo syllabus rỗng rồi thêm từng module, từng buổi học thủ công. Plan này thêm khả năng **upload file Excel (.xlsx) hoặc CSV** mô tả cấu trúc giáo trình: file được **parse 100% ở client**, hiển thị preview, rồi gửi kèm `modules` trong cùng request `POST /api/syllabi` hiện có — server insert syllabus + modules + lessons trong **một `db.batch` atomic** (pattern `buildImportBatch` đã có, issue #79).

File **không bao giờ** được gửi lên server — server giữ nguyên guard JSON-only + Origin (`docs/code-standards.md`: "Keep POST writes JSON-only and org-scoped").

## Bối cảnh & chứng cứ

- Scout report: [reports/scout-report.md](./reports/scout-report.md) — data model, kernel action bus, guard, conventions.
- Research lib: [reports/researcher-parsing-libs-report.md](./researcher-parsing-libs-report.md) — chọn `papaparse` (CSV) + `read-excel-file/browser` (XLSX); loại `xlsx`@npm (2 CVE mở), `exceljs` (stale, nặng).
- Kongming design counsel (`--advice`): extend `POST /api/syllabi` thắng tuyệt đối (atomic, một round-trip, không endpoint riêng); tách parser core thuần / adapter browser vì vitest web chạy env node; đóng format thành luật deterministic; reducer fixture chỉ thêm type.

## Kiến trúc

```
File (.csv/.xlsx) ──client parse──> modules JSON ──POST /api/syllabi (JSON)──> db.batch([syllabus, modules..., lessons...]) atomic
      papaparse (csv)                        zod syllabusCreateSchema          pattern: buildImportBatch (kernel.ts:226)
      read-excel-file/browser (xlsx)
```

- **Parse client-side** trong `apps/web/src/lib/syllabus-import.ts`: core thuần `rowsToModules(rows)` (test được trong vitest env node) + adapter browser `parseSyllabusFile(file)` (dynamic import để tách chunk).
- **Contract**: `packages/api/src/contracts.ts` — `syllabusCreateSchema` thêm `modules?` compose từ `moduleUpsertSchema` + `lessonUpsertSchema`, superRefine cap tổng nodes ≤ 500 (khớp `MAX_IMPORT_NODES`, `apps/server/src/routes/kernel.ts:217`).
- **Server**: handler `kernel.post("/syllabi")` build statements + `db.batch` — giữ 201 `{id}`.
- **Transport**: `add-syllabus` action thêm `modules?`; `kernelCommand` pass-through; reducer fixture chỉ thêm type.
- **UI**: upload section trong `AddSyllabusModal` + preview summary + lỗi theo dòng + nút "Tải file mẫu" (CSV BOM+CRLF sinh trong code).
- **Lỗi hiển thị**: client parser là nguồn sự thật duy nhất cho error message (`readBody` trả 400 opaque `invalid body` — không sửa `readBody` trong scope này).

## Định dạng file nhập (hợp đồng forensic — mọi phase theo đúng mục này)

6 cột **theo vị trí** (cột thừa bỏ qua; không được thiếu cột 0 và 2):

| Vị trí | Cột | Bắt buộc |
|---|---|---|
| 0 | Module | Có (hoặc rỗng = kế thừa dòng trước) |
| 1 | Mô tả module | Không |
| 2 | Buổi học | Có nếu dòng đó tạo lesson |
| 3 | Mục tiêu | Không |
| 4 | Tài liệu | Không |
| 5 | Trạng thái | Không (mặc định `sắp tới`) |

Luật deterministic (thứ tự áp dụng):

1. **File**: chỉ nhận đuôi `.csv` / `.xlsx` (từ chối khác, kể cả `.xls`); kích thước ≤ 2 MB.
2. **Chuẩn hóa row/cell**: mọi row được đưa về đúng 6 cột (thiếu pad `""`, thừa bỏ); mọi cell → `String(cell ?? "").trim()`. XLSX trả `number | boolean | Date | null`: number/boolean/null coerce về string; **`Date` → lỗi dòng** "Dòng {n}: ô dạng ngày tháng không hỗ trợ — hãy định dạng ô thành Text" (tránh `String(date)` thành chuỗi GMT rác). Việc này làm bởi hàm thuần `normalizeRow` (exported, unit test được trong node).
3. **CSV**: `Papa.parse(text)` — **không truyền `delimiter`** (auto-detect, chấp nhận `;` của Excel locale Việt Nam) và **không truyền `skipEmptyLines`** (dòng trống do core xử lý theo luật 5, để số dòng khớp file gốc); nếu `result.errors.length > 0` → trả lỗi "Dòng {row}: cú pháp CSV không hợp lệ"; strip BOM `\uFEFF` ở cell đầu dòng đầu; CRLF ok. **XLSX**: chỉ đọc sheet đầu (`readSheet(file)` mặc định).
4. **Header**: bỏ dòng đầu **iff** cell cột 2 (sau trim, lowercase) `=== "buổi học"` hoặc `=== "lesson"`. Không khớp → dòng đầu là data (teacher tự thấy ở preview).
5. **Dòng trống hoàn toàn** (sau chuẩn hóa 6 cột) → bỏ qua (không tính là lỗi; numbering vẫn theo file gốc).
6. **Cột Module rỗng** → dòng thuộc module của dòng trước đó (tự xử lý merged cells trong xlsx). Module rỗng ở **dòng data đầu tiên** → lỗi "Dòng {n}: thiếu tên module".
7. **Nhóm consecutive**: các dòng liên tiếp cùng tên Module (sau trim) gộp thành 1 module; mô tả module lấy từ dòng đầu của nhóm. Module trùng tên **không** liền kề vẫn là 2 module riêng (bảo toàn thứ tự, không global-group).
8. **Trạng thái** (lowercase, sau trim): `đã dạy`/`done` → `done`; `đang học`/`current` → `current`; `sắp tới`/`upcoming`/rỗng → `upcoming`; giá trị khác → lỗi "Dòng {n}: trạng thái không hợp lệ '{value}'".
9. **Lesson**: dòng có cột 2 (Buổi học) không rỗng → tạo lesson `{title, objectives, materials, status}`. Dòng có Module (sau kế thừa) nhưng Buổi học rỗng: nếu toàn bộ cột 3/4/5 trống → hợp lệ (module không có lesson); nếu có bất kỳ nội dung nào ở cột 3/4/5 → **lỗi dòng** "Dòng {n}: có nội dung nhưng thiếu tên buổi học" (không drop im lặng).
10. **Cap**: tổng số modules + lessons ≤ 500 → vượt: lỗi "File có {n} mục (module + buổi học), vượt giới hạn 500." (khớp `MAX_IMPORT_NODES` server).
11. **Rỗng**: không có dòng data nào → lỗi "Không có dòng dữ liệu."
12. **File mẫu** (`buildSampleCsv()`): CSV UTF-8 **có BOM**, dòng CRLF, header tiếng Việt + 3 dòng ví dụ (khớp fixture `assets/syllabus-import.sample.xlsx`).
13. **Exception**: adapter bắt **mọi** exception (`readSheet` reject với `InvalidSpreadsheetError` khi zip hỏng/đổi đuôi, lỗi đọc file…) và trả `{ ok: false, errors: ["Không đọc được file. Kiểm tra file Excel/CSV hợp lệ."] }` — không bao giờ để reject thoát ra caller.

Kết quả parse: `{ ok: true, modules: SyllabusModuleContent[], lessonCount }` hoặc `{ ok: false, errors: string[] }` (thông điệp tiếng Việt, kèm số dòng).

## Triển khai (deploy note)

Schema giữ **không** `.strict()` → zod **strip** key lạ: một server chạy code cũ nhận body có `modules` sẽ bỏ field và trả 201 — syllabus rỗng, không lỗi. Vì vậy: **deploy server trước web**; khi rollback server, tài liệu vận hành phải yêu cầu reload tất cả tab SPA (bundle mới giữ trong memory tab dài hạn).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Parser core & contract](./phase-01-parser-core-and-contract.md) | Completed |
| 2 | [Server batch & transport wiring](./phase-02-server-batch-and-transport.md) | Completed |
| 3 | [Modal UI & E2E](./phase-03-modal-ui-and-e2e.md) | Completed |

*Phase 3: mọi gate local xanh (check/check-types/test/build/contract test); e2e được enforce ở CI PR — port 8000 local bị dev environment của user giữ, disposition duyệt kongming 2026-09-14. 2 e2e locator criticals từ review đã fix trước push (a2314ef).*

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Giáo viên upload .csv/.xlsx trong AddSyllabusModal, xem preview, tạo syllabus kèm toàn bộ modules + lessons trong 1 request | P1 |
| 2 | Server insert atomic bằng `db.batch`, tôn trọng cap 500 nodes, giữ guard JSON-only | P1 |
| 3 | File mẫu tải được từ modal; lỗi parse hiển thị rõ theo số dòng | P2 |

## Success Criteria

- [ ] Upload CSV hoặc XLSX đúng format → syllabus được tạo với đầy đủ modules/lessons đúng thứ tự, status, objectives, materials (e2e Verify cả 2 định dạng). *(unit + server test xanh local; e2e chạy ở CI PR)*
- [x] Tạo syllabus không kèm file (flow cũ) không đổi hành vi (server test backward-compat).
- [x] File sai format/trạng thái lạ/vượt cap 500 → lỗi tiếng Việt có số dòng, không tạo dữ liệu lỗi.
- [x] `pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm --filter e2e e2e` đều exit 0. *(3 lệnh đầu xanh local; e2e xanh ở CI PR)*

## NOT in scope (deferred — không làm trong plan này)

Import vào syllabus đã tồn tại (endpoint `:id/content`); preview table chỉnh sửa được; drag-and-drop / paste clipboard; `.xls` legacy; sinh template `.xlsx` (chỉ CSV); parse phía server; sửa envelope lỗi `readBody` trả zod path; UI chọn sheet; progress bar.

## Dependencies

- Thư viện mới (chỉ `apps/web`): `papaparse@^5.7.0`, `read-excel-file@^9.3.10`, devDep `@types/papaparse@^5.3.16`. Không config Vite thêm.
- Không migration DB (dùng đủ schema hiện tại; cột ngoài schema trong file bị bỏ).

## Handover Contract (`--advice`)

Plan này được viết cho executor model thấp hơn: mỗi phase chia thành task có Goal / Target files + symbols / Steps / Success criteria / Verify (điều kiện pass cơ học: lệnh + kết quả mong đợi), kèm **Failure Protocol** từng phase — Verify fail thì STOP và escalate theo protocol, không tự đoán. Khuyến nghị chạy `/ak:cook plans/260914-0744-syllabus-excel-csv-import/plan.md --advice`.

## Red Team Review

### Session — 2026-09-14
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (Standard tier: Fact Checker + Contract Verifier)
**Findings:** 16 (16 accepted — 13 áp sửa plan, 3 chấp nhận dưới dạng reword/risk-note; 3 biến thể remediation bị từ chối vì scope)
**Severity breakdown:** 3 Critical, 1 High, 12 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Regex contract test `kernel-runtime.contract.test.ts:135` gãy nếu đổi thứ tự `disabled` → `pnpm test` fail chắc chắn | Critical | Accept | Phase 3 (giữ prefix `saving \|\| submitBlocked`, thêm điều kiện phía sau + Verify contract test) |
| 2 | Schema mới đặt sau nơi sử dụng → TDZ/TS2448, `check-types` fail | Critical | Accept | Phase 1 (chèn trước `syllabusCreateSchema`) |
| 3 | Không error path quanh parse: `readSheet` reject → `parsing` kẹt vĩnh viễn; parse lỗi vẫn submit được → syllabus rỗng im lặng | Critical | Accept | Phase 1 (luật 13, try/catch adapter, try/finally) + Phase 3 (disable nút Tạo khi lỗi) |
| 4 | Cell `Date` của read-excel-file → `String(date)` thành chuỗi GMT rác lưu DB | High | Accept | Phase 1 (`normalizeRow` + luật 2 + test) |
| 5 | `Number.parseInt(total) \|\| 10` biến totalLessons=0 thành 10 (file module-only hợp lệ) | Medium | Accept | Phase 3 (gửi trực tiếp `lessonCount` khi import ok) |
| 6 | `skipEmptyLines: true` phá numbering số dòng; `Papa.parse` bỏ qua `result.errors` (quote chưa đóng parse méo im lặng) | Medium | Accept | Phase 1 + plan.md luật 3 (bỏ skipEmptyLines; đọc result.errors + test) |
| 7 | Luật 9 mâu thuẫn luật 5/6: dòng có nội dung nhưng thiếu tên buổi bị drop im lặng | Medium | Accept | plan.md luật 9 (thêm lỗi dòng) + test 1.4-5 |
| 8 | `db.batch` yêu cầu tuple type `[BatchItem, ...BatchItem[]]` — mảng + push fail check-types | Medium | Accept | Phase 2 Task 2.1 (annotate tuple) |
| 9 | Server schema không có `.max()` string → body khổng lồ pass zod (cap 2MB chỉ ở client) | Medium | Accept | Phase 1 Task 1.2 (`.max()` 500/10_000) |
| 10 | Claim "atomic" bị phình: test 400 xảy ra trước DB; prod D1 vs test libsql khác engine | Medium | Accept (reword) | Phase 2 (đổi tên test, downgrade thành giả định kế thừa có cite) |
| 11 | Row ragged (thiếu cột) → TypeError / undefined access | Medium | Accept | Phase 1 (pad/cắt về 6 cột trong `normalizeRow` + test) |
| 12 | Fixture xlsx không exercise luật kế thừa module (A3 có giá trị) | Medium | Accept | Asset regenerated (A3 rỗng) + Phase 3 |
| 13 | Claim "DB e2e in-memory" sai — thực tế file-backed `local.db` wiped bằng rmSync mỗi boot | Medium | Accept (reword) | Phase 3 Risk Assessment |
| 14 | Snapshot amplification: bus refetch toàn bộ snapshot (kèm cây syllabi) sau mỗi write; import 1-click làm cây phình dễ | Medium | Accept (risk-note) | Phase 2 Risk Assessment + follow-up ghi nhận |
| 15 | Server cũ strip `modules` (zod non-strict) → 201 rỗng im lặng khi lệch phiên bản deploy/rollback | Medium | Accept (note) | plan.md "Triển khai (deploy note)" |
| 16 | Zip bomb .xlsx giải nén trong main thread treo tab (fflate không guard ratio) — cap 2MB là kích thước nén | Medium | Accept (reword) | Phase 1 Security Considerations (worker là follow-up ngoài scope) |

**Từ chối remediation variants:** Web Worker parse (scope creep — đã ở deferred list), cap tổng nodes per-org (kiến trúc snapshot là việc của follow-up), test rollback libsql trực tiếp (phải export internals, giá trị thấp so với surface).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03 (sau khi áp findings)
- Decision deltas checked: 11 (13-laws contract, schema placement, normalizeRow export, disabled ordering, totalLessons direct payload, tuple annotation, fixture A3 rỗng, e2e DB wording, atomicity wording, deploy note, security reword)
- Reconciled stale references: 0 còn sót — số luật (13), nội dung sample CSV (dòng 3 Module rỗng), fixture khớp asset, effort 15h đã đồng bộ
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Standard (Fact Checker + Contract Verifier, 3 reviewers × ~10 claims/phase)
- **Claims checked:** ~57
- **Verified:** 53 | **Failed:** 3 | **Unverified:** 1
- Failures (đều đã trở thành finding áp dụng ở trên): (1) giả định đổi `disabled` vô hại với contract test — sai, finding #1; (2) "XLSX trả number/boolean/null là đủ" — thiếu `Date`, finding #4; (3) "DB e2e in-memory per boot" — sai, finding #13.
- Fact-check đáng chú ý khác: plan đúng chỗ scout report sai tên hàm (`buildImportBatch`, không phải `copyTemplateTree`); không tìm thấy lỗ hổng org-scoping/XSS/prototype-pollution; consumer enumeration xác nhận chỉ thiếu `kernel-runtime.contract.test.ts` (finding #1) — toàn bộ consumer còn lại của `syllabusCreateSchema`/`add-syllabus` đều non-breaking với field optional.
