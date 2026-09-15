---
title: "Syllabus Import v2 — Template 5 cột, Preview bảng, UX gỡ file, giữ state khi đóng modal"
description: "V1.1 cho feature import Excel/CSV (#144): bỏ cột Buổi học (thứ tự tự động theo dòng), preview dạng bảng chi tiết, nút gỡ file dạng icon, đóng popup không mất dữ liệu"
status: pending
priority: P2
effort: "5h"
issue: 150
branch: feat/syllabus-import-v2
tags: [feature, frontend, ux]
blockedBy: []
blocks: []
created: 2026-09-15
---

# Syllabus Import v2 — Template 5 cột, Preview bảng, UX gỡ file, giữ state khi đóng modal

## Overview

Nâng cấp 4 điểm của feature import Excel/CSV trong `AddSyllabusModal` (ship hôm qua, issue #144) theo phản hồi sử dụng:

1. **Template bỏ cột "Buổi học"** — format mới còn **5 cột**: `Module | Mô tả module | Mục tiêu | Tài liệu | Trạng thái`. Thứ tự buổi học **tự động theo thứ tự dòng import**: title tự sinh `Buổi {n}` (n = số thứ tự buổi toàn file, 1-based). Cột cũ thuần túy là số thứ tự gõ tay — redundant.
2. **Preview dạng bảng chi tiết** — thay tóm tắt (1 dòng summary + `<details>` tên module) bằng bảng từng buổi học: `# | Module | Mục tiêu | Tài liệu | Trạng thái`, scroll dọc trong modal 480px.
3. **Nút gỡ file dạng icon** — nút chữ "Gỡ file" thay bằng icon-button `X` (lucide) đặt ở header card preview; error branch dùng cùng cấu trúc card.
4. **Đóng popup giữ nguyên dữ liệu** — Hủy/Esc/click overlay phải giữ form + file đã import khi mở lại. Hiện trạng code **đã** giữ (modal luôn mounted, `resetForm()` chỉ chạy sau submit thành công) — việc của plan này là **khóa behavior** bằng contract test + e2e để không ai vô tình phá (các write-modal khác như `AddInvoiceModal` cố ý reset-on-open — copy-paste ngược là rủi ro thật).

Phạm vi kỹ thuật: chỉ client (`apps/web` + fixtures e2e). Server/contract `POST /api/syllabi` **không đổi** — shape `SyllabusModuleContent` giữ nguyên, chỉ có nguồn dữ liệu title thay đổi (auto thay vì cột 2).

## Bối cảnh & chứng cứ

- Scout report (2026-09-15): định vị đầy đủ parser/modal/tests/fixtures — `apps/web/src/lib/syllabus-import.ts` (core `rowsToModules`/`normalizeRow`/`buildSampleCsv`, adapter `parseSyllabusFile`), `apps/web/src/components/modals/add-syllabus-modal.tsx`, `apps/web/src/lib/syllabus-import.test.ts` (16 test), contract test `kernel-runtime.contract.test.ts` (pin source modal qua regex), e2e `apps/e2e/specs/syllabus-excel-csv-import.spec.ts` + fixtures `apps/e2e/fixtures/syllabus-import.sample.{csv,xlsx}` (xlsx là binary commit sẵn, **không có script sinh**).
- Kongming design counsel (`--advice`, checkpoint 2026-09-15) — 3 điều chỉnh đã áp vào plan: (1) bỏ điều kiện `length >= 6` trong rule detect template cũ (chỉ cần `cells[2]`, đặt trong `rowsToModules`, chạy **trước** skip-header); (2) **không** thêm prop `dense` vào `DataTable` dùng chung — dùng bảng compact riêng trong modal; (3) script gen xlsx **bắt buộc tự round-trip verify** bằng `read-excel-file` (đã là prod dep của web, không thêm deps).
- Đã verify trong source: route `_auth/syllabus/index.tsx:105` mount `<AddSyllabusModal open={modalOpen}>` **vô điều kiện**; modal không có `useEffect` nào; `Modal` (`ui/modal.tsx:61`) `return null` khi đóng nhưng hooks của `AddSyllabusModal` vẫn mounted → state giữ nguyên.

## Định dạng file nhập v2 (hợp đồng forensic mới — mọi phase theo đúng mục này)

5 cột **theo vị trí** (cột thừa cắt bỏ; row thiếu pad `""`):

| Vị trí | Cột | Bắt buộc |
|---|---|---|
| 0 | Module | Có (hoặc rỗng = kế thừa dòng trước) |
| 1 | Mô tả module | Không |
| 2 | Mục tiêu | Tạo buổi học nếu bất kỳ cột 2/3/4 khác rỗng |
| 3 | Tài liệu | Không |
| 4 | Trạng thái | Không (mặc định `sắp tới`) |

14 luật deterministic (thứ tự áp dụng; thay thế bộ 13 luật v1 trong `plans/260914-0744-syllabus-excel-csv-import/plan.md`):

1. **File**: chỉ nhận đuôi `.csv`/`.xlsx` (kể cả `.xls` bị từ chối); ≤ 2 MB. *(giữ luật 1 v1)*
2. **Chuẩn hóa row**: mọi row về đúng **5 cột** (thiếu pad `""`, thừa cắt); cell → `String(cell ?? "").trim()`; cell `Date` → lỗi dòng "Dòng {n}: ô dạng ngày tháng không hỗ trợ — hãy định dạng ô thành Text". Bởi `normalizeRow` thuần. *(luật 2 v1, 6→5)*
3. **CSV/XLSX**: `Papa.parse(text)` không truyền `delimiter`/`skipEmptyLines`; `result.errors` → "Dòng {row}: cú pháp CSV không hợp lệ"; strip BOM cell đầu dòng đầu; XLSX đọc sheet đầu (`readSheet(file)`). *(giữ luật 3 v1)*
4. **Template cũ → lỗi tường minh**: **trước** mọi xử lý khác trong `rowsToModules`, normalize dòng đầu; nếu `cells[2].toLowerCase()` `=== "buổi học"` hoặc `=== "lesson"` → trả `{ ok: false, errors: ['File dùng template cũ (cột "Buổi học" đã bỏ). Hãy tải file mẫu mới rồi điền lại dữ liệu.'] }`. **Không** kèm điều kiện độ dài row (read-excel-file/papaparse pad đuôi khác nhau — điều kiện length là nguồn misfire duy nhất, không mang thông tin gì). Đặt trong `rowsToModules` để cả 2 nhánh CSV/XLSX đều có. *(mới — thay luật 4 v1)*
5. **Header**: bỏ dòng đầu **iff** `cells[0].toLowerCase() === "module"`. *(mới — header mới có "Module" ở cột 0; cũ cũng có nên luật 4 phải chạy trước)*
6. **Dòng trống hoàn toàn** → bỏ qua (numbering lỗi vẫn theo file gốc). *(giữ luật 5 v1)*
7. **Module kế thừa / nhóm consecutive**: cột 0 rỗng → thuộc module dòng trước; rỗng ở dòng data đầu → lỗi "Dòng {n}: thiếu tên module"; các dòng liên tiếp cùng tên module gộp 1 module, mô tả lấy từ dòng đầu nhóm; trùng tên không liền kề = 2 module riêng. *(giữ luật 6+7 v1)*
8. **Buổi học auto-thứ tự**: dòng tạo buổi học **iff** bất kỳ ô cột 2/3/4 khác rỗng → tạo lesson `{ title: "Buổi {n}", objectives: cells[2], materials: cells[3], status }`; **n = số thứ tự buổi toàn file, 1-based, chỉ tăng khi tạo lesson** (module-only row và dòng trống không tiêu số). Luật 9 v1 ("có nội dung nhưng thiếu tên buổi học") **bãi bỏ** — không còn cột tên buổi. *(mới — thay luật 9 v1)*
9. **Module-only row**: dòng chỉ có tên module (+ mô tả), cột 2/3/4 rỗng → module (mới hoặc kế thừa) **không có lesson** — hợp lệ. *(giữ nguyên tắc v1, diễn đạt lại)*
10. **Trạng thái** (cột 4, lowercase sau trim): `đã dạy`/`done` → `done`; `đang học`/`current` → `current`; `sắp tới`/`upcoming`/rỗng → `upcoming`; lạ → lỗi "Dòng {n}: trạng thái không hợp lệ '{value}'". *(giữ luật 8 v1, cột 5→4)*
11. **Cap**: modules + lessons ≤ 500 → vượt: "File có {n} mục (module + buổi học), vượt giới hạn 500." *(giữ luật 10 v1)*
12. **Rỗng**: không có dòng data → "Không có dòng dữ liệu." *(giữ luật 11 v1)*
13. **File mẫu** (`buildSampleCsv()`): CSV UTF-8 **BOM** + CRLF, header 5 cột + 3 dòng ví dụ → 2 module · 3 buổi (Buổi 1, Buổi 2, Buổi 3 xuyên module); **khớp fixture e2e**. *(luật 12 v1, 5 cột)*
14. **Exception**: adapter bắt mọi exception → `{ ok: false, errors: ["Không đọc được file. Kiểm tra file Excel/CSV hợp lệ."] }`. *(giữ luật 13 v1)*

Kết quả parse: `{ ok: true, modules: SyllabusModuleContent[], lessonCount }` | `{ ok: false, errors: string[] }` — tiếng Việt, kèm số dòng.

**Known limit (chấp nhận, không sửa):** file cũ 6 cột **không có dòng header** sẽ không dính luật 4 mà misparse rồi dính lỗi "trạng thái không hợp lệ '…'" — thông điệp chưa tường minh bằng, nhưng là edge hiếm (template luôn có header).

**Sample CSV v2** (nội dung `buildSampleCsv()`):

```
\uFEFFModule,Mô tả module,Mục tiêu,Tài liệu,Trạng thái
Module 1 — Nền tảng,Làm quen format đề,Hiểu cấu trúc đề,Cambridge 18,sắp tới
,,Viết introduction,File mẫu 2,đã dạy
Module 2 — Thực hành,,Viết body paragraph,,đang học
```

## Kiến trúc

```
File (.csv/.xlsx) ──parse client (không đổi)──> rows ──rowsToModules v2 (5 cột, auto "Buổi {n}")──>
  AddSyllabusModal: card preview [summary + bảng buổi học + nút X gỡ file] ──POST /api/syllabi (JSON, không đổi)──> db.batch atomic
```

- `apps/web/src/lib/syllabus-import.ts` — đổi `normalizeRow` (5 cột), `rowsToModules` (luật 4/5/8 mới), `buildSampleCsv` (5 cột), header comment trỏ hợp đồng mới.
- `apps/web/src/components/modals/add-syllabus-modal.tsx` — preview card + bảng compact (markup ngay trong file modal, **không** đụng `ui/data-table.tsx`), nút icon `X` lucide ở header card cho cả nhánh ok/error.
- `apps/web/scripts/gen-sample-xlsx.mjs` (mới) — sinh `apps/e2e/fixtures/syllabus-import.sample.xlsx` bằng zip stdlib (`node:zlib` + CRC32 tự viết, 5 entries, inline strings), **round-trip verify** đọc lại bằng `read-excel-file/node` trước khi exit 0.
- Contract test `kernel-runtime.contract.test.ts` — thêm pin giữ-state (modal không có reset-on-open effect + route mount vô điều kiện).
- E2E `syllabus-excel-csv-import.spec.ts` — cập nhật fixture/assert cho preview bảng + thêm test đóng/mở giữ dữ liệu (Hủy, Esc, click overlay).
- **Không đổi**: `packages/api/src/contracts.ts`, `apps/server/**`, `ui/data-table.tsx`, các modal khác.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Parser format v2 + template + fixtures](./phase-01-parser-format-v2.md) | Pending |
| 2 | [Modal preview UI + khóa giữ-state + e2e](./phase-02-modal-ui-and-lock.md) | Pending |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Template & parser 5 cột; thứ tự buổi tự động theo dòng; file template cũ nhận lỗi tường minh | P1 |
| 2 | Preview dạng bảng chi tiết từng buổi, scroll trong modal 480px, không vỡ layout | P1 |
| 3 | Nút gỡ file icon gọn ở header card, cả nhánh preview OK lẫn nhánh lỗi | P2 |
| 4 | Đóng modal (Hủy/Esc/overlay) giữ nguyên dữ liệu — bị khóa bởi contract test + e2e | P1 |

## Success Criteria

- [ ] Upload CSV/XLSX format 5 cột → tạo syllabus đúng modules/lessons, title `Buổi 1..n` đúng thứ tự dòng (e2e cả 2 định dạng).
- [ ] File template cũ 6 cột → đúng 1 lỗi tường minh "File dùng template cũ…", không misparse im lặng.
- [ ] Preview hiển thị bảng `# | Module | Mục tiêu | Tài liệu | Trạng thái` từng buổi; nút gỡ file icon có `aria-label="Gỡ file"` ở cả 2 nhánh.
- [ ] E2E mới chứng minh: điền form + import → Hủy/Esc/overlay → mở lại vẫn còn nguyên name + preview.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm test` exit 0; `pnpm --filter e2e e2e` xanh ở CI PR.

## NOT in scope (deferred)

Sửa `DataTable` dùng chung (dense prop); import vào syllabus đã tồn tại; drag-and-drop/paste; `.xls` legacy; sinh template `.xlsx` tải về cho user (vẫn chỉ CSV); cho phép custom lesson title trong file; Web Worker parse; sửa "Buổi {n}" stale sau reorder lesson trong app.

## Handover Contract (`--advice`)

Plan viết cho executor model thấp hơn: mỗi phase chia task có **Goal / Target files + symbols / Steps / Success criteria / Verify** (điều kiện pass cơ học: lệnh + kết quả mong đợi), kèm **Failure Protocol** literal từng phase — Verify fail thì STOP, không tự đoán, escalate theo protocol. Khuyến nghị chạy: `/ak:cook plans/260915-1108-syllabus-import-v2/plan.md --advice`.

## Kongming Counsel Summary (checkpoint 2026-09-15)

- **Áp dụng:** bỏ điều kiện length trong luật 4; đặt detection trong `rowsToModules` (cả CSV/XLSX), chạy trước skip-header; predicate lesson tường minh (bất kỳ cột 2/3/4 khác rỗng); ordinal counter chỉ tăng khi push lesson; bảng preview riêng trong modal (DataTable là full-page component 9 callers, thiếu scroll/truncate cho 480px); nút X: `aria-label` + `title` + icon `aria-hidden`, ghost variant đủ hit-target, error branch dùng cùng cấu trúc card (1 selector e2e dùng chung); lock giữ-state = negative-pin + e2e hành vi 3 đường đóng, **không** lift state lên route; gen-xlsx script phải round-trip verify bằng `read-excel-file/node`, đủ 5 zip entries (thiếu `xl/_rels/workbook.xml.rels` là lỗi "no sheet found" kinh điển).
- **Cảnh báo executor:** 16 parser test viết lại gần như toàn bộ (nhiều test pin luật cũ); e2e selectors scope vào `dialog` + coi chờ Playwright strict mode khi "Buổi 1/2" xuất hiện cả preview lẫn detail; `apps/server/src/syllabus-template-migration.test.ts` (migration 0009) **không liên quan — không đụng**; giữ nguyên mọi regex contract-test pin hiện có trong modal (`onClose={saving ? () => undefined : onClose}`, `disabled={saving || submitBlocked`, `result?.kind === "refreshed"`, comment "refreshed result — a committed").
- **Model routing:** host ZCode (không phải Claude Code/Codex/Cursor) — counsel cùng model phiên (`same-model counsel`), không pin được Fable/Sol theo bảng routing của `advisory-supervision.md`.

## Validation Log

### Gate (fast mode + `--advice`: red-team gate thay bằng kongming counsel design-level; validation gate chạy chuẩn)

- Mode: **fast** (auto-detect — scope rõ, 1 feature area, đã scout+counsel; không `--fast` flag nhưng depth tương đương, scope giữ nguyên 100% yêu cầu user).
- Files ownership: Phase 1 = `apps/web/src/lib/syllabus-import.{ts,test.ts}`, `apps/web/scripts/gen-sample-xlsx.mjs`, `apps/e2e/fixtures/*`, `plans/260914-…/plan.md` (addendum). Phase 2 = `apps/web/src/components/modals/add-syllabus-modal.tsx`, `apps/web/src/lib/kernel-runtime.contract.test.ts`, `apps/e2e/specs/syllabus-excel-csv-import.spec.ts`. **Disjoint** — không conflict.
- Verify commands tồn tại: `pnpm --filter web test`, `pnpm --filter web check-types`, `pnpm check`, `pnpm test`, `pnpm --filter e2e e2e` (script đã xác nhận trong package.json).
- Checklist câu hỏi gãy (validate-workflow): file paths đúng theo read pass 2026-09-15; số luật (14) khớp phase-01; sample CSV khớp fixture e2e và assert e2e ("2 module · 3 buổi học" giữ ở card header); contract-test pins hiện có được liệt kê và giữ nguyên trong phase-02.
