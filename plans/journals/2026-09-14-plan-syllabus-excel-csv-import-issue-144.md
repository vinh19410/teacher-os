---
title: "Plan syllabus Excel/CSV import (issue #144)"
date: 2026-09-14
summary: "ak:plan --github --advice: 3-phase plan cho upload Excel/CSV trong AddSyllabusModal; 16 red-team findings áp đủ"
---

# Plan syllabus Excel/CSV import (issue #144)

## Bối cảnh

Yêu cầu: phần input/create syllabus cho phép upload Excel/CSV để nhập nhanh. Chạy `ak:plan --github --advice` → plan `plans/260914-0744-syllabus-excel-csv-import/` (issue #144).

## Quyết định kiến trúc (khám phá chính)

1. **Parse 100% client-side** (papaparse ^5.7.0 cho CSV + read-excel-file/browser ^9.3.10 cho XLSX), gửi JSON — giữ nguyên guard POST JSON-only + Origin của server (`docs/code-standards.md`). Loại `xlsx`@npm (2 CVE mở không fix trên npm) và `exceljs` (stale 23 tháng, 948KB).
2. **Extend `POST /api/syllabi`** thay vì endpoint riêng: optional `modules` trong `syllabusCreateSchema`, server insert syllabus + modules + lessons bằng một `db.batch` tuple-typed — atomic theo tài liệu D1, kế thừa pattern `buildImportBatch` (issue #79). Endpoint riêng tạo nguy cơ "shell syllabus rỗng" khi timeout giữa 2 bước.
3. **Parser tách core thuần / adapter browser**: vitest web chạy env node nên `rowsToModules` + `normalizeRow` là hàm thuần test được; nhánh XLSX (cần FileReader) chỉ phủ bằng e2e.
4. **Format contract 13 luật deterministic** viết thẳng trong plan.md (delimiter auto-detect cho `;` locale VN, BOM strip, exact-header skip, kế thừa module khi cell rỗng — tự xử lý merged cells, consecutive grouping, status whitelist, cap 500 nodes khớp MAX_IMPORT_NODES).

## Red-team (3 reviewer adversarial) — 16 findings, 3 Critical

- Regex contract test `kernel-runtime.contract.test.ts:135` (`disabled={saving || submitBlocked`) sẽ gãy nếu chèn `parsing` vào giữa → fix: giữ prefix, nối điều kiện phía sau.
- Schema mới đặt sau nơi sử dụng → TDZ/TS2448 → fix: chèn trước `syllabusCreateSchema`.
- Thiếu error path quanh `readSheet` reject (file xlsx hỏng/đổi đuôi) → modal kẹt `parsing` + parse lỗi vẫn submit được → syllabus rỗng im lặng → fix: try/catch adapter + try/finally + disable nút Tạo.
- Các Medium đáng nhớ: cell `Date` của read-excel-file thành chuỗi GMT rác (thêm `normalizeRow`); `Number.parseInt(total) || 10` biến totalLessons=0 thành 10; `skipEmptyLines: true` phá numbering số dòng; `db.batch` yêu cầu tuple `[BatchItem, ...BatchItem[]]`; server cần `.max()` string vì cap 2MB chỉ sống ở client; zod non-strict strip `modules` trên server cũ → deploy note (server trước web).

## Bài học

- Contract test quét source bằng regex (`kernel-runtime.contract.test.ts`) là loại gate mà plan chỉ phát hiện được bằng cách grep consumer thật — Contract Verifier enumeration là bắt buộc, không optional.
- Hai "detail nhỏ" của lib parse (Date cells, exceptions từ readSheet) là toàn bộ khoảng cách giữa plan chạy được và plan brick UI — kongming + red-team đều hội tụ về error-path-first.
- Fixture binary (.xlsx) nên được planner sinh sẵn vào plan assets để executor chỉ copy — sinh file nhị phân là việc không nên giao executor yếu.

## Artefact

- Plan: `plans/260914-0744-syllabus-excel-csv-import/` (plan.md + 3 phases, handover contract --advice, Failure Protocol từng phase)
- Issue: #144 (label `ready to review`); branch `feat/144-syllabus-excel-csv-import`
- Next: `/ak:cook plans/260914-0744-syllabus-excel-csv-import/plan.md --advice`

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
