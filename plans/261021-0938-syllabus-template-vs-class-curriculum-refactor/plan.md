---
title: "Refactor tạo và gán syllabus: tách Template và Giáo trình của lớp (hướng A+)"
description: "Giữ một bảng syllabus, tách Template và Giáo trình của lớp ở API, service và web; syllabus.class_id là nguồn sự thật duy nhất của quan hệ lớp ↔ giáo trình; TemplatePicker dùng chung."
status: in-progress
priority: P1
effort: "5-6d"
tags: [refactor, backend, frontend, database, api, tech-debt]
branch: plan/394-syllabus-refactor-a-plus
issue: 394
created: 2026-10-21
---

# Refactor tạo và gán syllabus (hướng A+)

## Overview

Mô hình copy-on-import của issue #79 đã đúng hành vi, nhưng khái niệm Template và Giáo trình của lớp vẫn dùng chung một bảng, một nhóm route `/syllabi/:id/...` và một kiểu dữ liệu web, được phân biệt bằng `classId === null`. Quan hệ lớp ↔ giáo trình có hai nguồn sự thật (`class.syllabus_id` và `syllabus.class_id`), nên mới có nhánh "con trỏ lệch" ở server và web. `kernel.ts` dài 2116 dòng chứa toàn bộ logic này.

Plan này làm theo **hướng A+** đã chốt trong brainstorm ([brief](../reports/brainstorm-261021-1500-syllabus-refactor.html)):

- Giữ nguyên bảng `syllabus`, `syllabus_module`, `syllabus_lesson`. Không tách bảng, không thêm bảng progress.
- Lấy `syllabus.class_id` (đã có unique partial index `syllabus_class_unique`) làm nguồn sự thật. `class.syllabus_id` chỉ còn là cột dẫn xuất, chỉ ghi qua một hàm.
- Tách route theo ngữ cảnh: `/syllabus-templates/...` và `/classes/:id/curriculum/...`, dùng chung một bộ handler nội dung qua factory. Route cũ giữ làm alias tạm thời.
- Web tách kiểu `SyllabusTemplate` và `ClassCurriculum`, hook `useTemplates()` và `useClassCurriculum(classId)`; một `TemplatePicker` có preview dùng cho tạo lớp và gán sau.

Căn cứ: [reports/scout-report.md](./reports/scout-report.md) (bằng chứng trong code) và [reports/design-decisions.md](./reports/design-decisions.md) (quyết định D1-D8).

## Brainstorm contract

- **Outcome:** Template và Giáo trình của lớp là hai khái niệm tách bạch ở API, service và web. Quan hệ lớp ↔ giáo trình có đúng một nguồn sự thật. Chọn template dùng chung một `TemplatePicker` có preview ở cả tạo lớp và gán sau.
- **Constraints:** Giữ copy riêng từng lớp, không sync. Migration viết tay, bảo toàn dữ liệu (không xoá dòng nào). Mọi query và DELETE có `org_id`. Giữ thứ tự batch đã ghim (copy trước, class sau cùng khi insert) và `MAX_IMPORT_NODES = 500`. Chạy full e2e trước khi squash-merge vào `develop`.
- **Non-goals:** Tách bảng template và class (hướng B), bảng progress (hướng C), rebuild bảng `class`, bỏ cột `class.syllabus_id`, sync template sang lớp, wizard tạo syllabus, nối `syllabus_lesson` với buổi dạy thật, tối ưu kích thước snapshot, đổi cách lưu `status` của lesson trong template, làm import đọc template atomic (rủi ro có sẵn, ghi ở bảng rủi ro).
- **Acceptance:** xem [Success Criteria](#success-criteria).
- **Better approaches:** không tách bảng ngay. Bằng chứng: phần lẫn lộn nằm ở code (rẽ nhánh `classId`, handler không phân biệt loại), không ở schema; chi phí chuyển của A+ gần 0 và vẫn giữ đường đi tới B.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Đo dữ liệu thật và khoá baseline](./phase-01-start.md) | Pending |
| 2 | [Tách server thành router và service, không đổi hành vi](./phase-02-server-extraction-no-behavior-change.md) | Pending |
| 3 | [Bất biến con trỏ và migration đối soát](./phase-03-pointer-invariant-and-reconcile-migration.md) | Pending |
| 4 | [Factory route nội dung và contract mới](./phase-04-content-route-factory-and-new-contract.md) | Pending |
| 5 | [Web: kiểu, hook và command bus](./phase-05-web-types-hooks-and-command-bus.md) | Pending |
| 6 | [Web UI: TemplatePicker và tách editor](./phase-06-web-ui-template-picker-and-editor-split.md) | Pending |
| 7 | [E2E và verify toàn bộ](./phase-07-e2e-and-full-verification.md) | Pending |
| 8 | [Gỡ route alias deprecated (tuỳ chọn, sau một release)](./phase-08-remove-deprecated-aliases.md) | Pending |

## Dependencies

Tuyến tính 1 → 7; phase 8 là tuỳ chọn, chỉ chạy sau khi phase 7 đã deploy và đã qua một release.

1. Phase 1 chặn phase 3: kết quả đo quyết định migration có dọn con trỏ mồ côi hay không.
2. Phase 2 chặn phase 3 và 4: service và router mới là nơi đặt logic mới.
3. Phase 3 chặn phase 4: route mới dùng `findClassCurriculum` và `setClassCurriculumPointer`.
4. Phase 4 chặn phase 5: web cần route mới.
5. Phase 5 chặn phase 6; phase 6 chặn phase 7.

Không chạy song song: các phase cùng đụng `kernel.ts`, `contracts.ts` hoặc `repos/kernel.ts`.

## Delivery plan (PR)

| PR | Phase | Nội dung | Điều kiện merge |
|---|---|---|---|
| 1 | 2 | Di chuyển code, không đổi hành vi | Full e2e xanh trên nhánh; `kernel.test.ts` không đổi |
| 2a | 3 | Bất biến con trỏ, migration `0042` (nếu cần) | Full e2e xanh; user đã diễn tập staging theo runbook |
| 2b | 4 | Route mới + alias, chuyển test sang route mới | Full e2e xanh |
| R1 | (release) | Phát hành PR 1, 2a, 2b lên prod (server trước web) | Smoke route mới trả 401, không phải 404 (xem phase 7 Task 7.5) |
| 3a | 5, 7.1, 7.3 | Web data layer, e2e seed, docs (UI không đổi) | R1 xong; full e2e xanh |
| 3b | 6, 7.2 | Web UI mới + spec e2e mới | Full e2e xanh; ảnh 3 viewport |
| 4 | 8 | Gỡ alias (tuỳ chọn) | Sau một release; user xác nhận không còn client cũ |

Mỗi PR đích `develop`, tiêu đề conventional commit tiếng Anh, mô tả tiếng Việt, được mở ngay khi phase tương ứng xong (không dồn về phase 7). CI không chạy cho PR vào `develop` nên cổng là lệnh local ở phase 7 Task 7.4. Prod chỉ deploy khi merge `develop` vào `main` (một lệnh deploy cập nhật cả hai Worker và áp migration theo `docs/production-release-runbook.md`), nên web mới và Worker mới không đổi nguyên tử: R1 buộc server lên trước và có smoke kiểm.

## Handover contract (`--advice`)

Plan này viết để một executor yếu hơn (Sonnet, Flash) chạy được: mỗi task có Goal, Target files, Steps, Success criteria, Verify (so sánh cơ học) và mỗi phase có khối Failure Protocol nguyên văn. Khi một Verify không đạt, executor dừng và gọi `kongming`, không tự suy luận tiếp. Chạy bằng `/ak:cook <plan>/plan.md --advice`.

## Plan-level risks

| Rủi ro | Tác động | Giảm thiểu |
|---|---|---|
| Dữ liệu prod có con trỏ mồ côi hoặc khác org (migration 0009 cố ý để nguyên) | Migration đối soát đổi dữ liệu ngoài dự kiến | Phase 1 đo trước; migration chỉ sửa trường hợp có copy; dọn con trỏ mồ côi cần user đồng ý |
| Tách `kernel.ts` làm đổi thứ tự route hoặc thứ tự batch | Hồi quy khó bisect | Phase 2 chỉ di chuyển code, merge riêng, `kernel.test.ts` không sửa |
| Client cũ (tab đang mở) gọi route cũ sau deploy Worker | Lỗi 404 tạm thời | Giữ alias ở phase 4, chỉ gỡ ở phase 8 sau một release |
| Sót `org_id` ở handler mới | Rò dữ liệu chéo org | Factory nhận `resolve(c, db, orgId)` trả về syllabus đã lọc org; test cross-org cho từng nhóm route |
| Con trỏ khác org (do 0009 để nguyên) làm FK chặn xoá template của org kia | 500 khi xoá template | Phase 1 tách Q1b; user quyết định NULL hoá trong 0042; test xoá template khi có con trỏ chéo org |
| Import đọc template bằng ba truy vấn riêng, `replace-content` chen vào giữa | Bản copy thiếu buổi, cố định vì không sync | Rủi ro có sẵn từ #79, ngoài phạm vi; ghi nhận, không sửa trong plan này |
| Migration D1 trên prod | Không rollback tự động | Time Travel bookmark + diễn tập staging theo `docs/production-release-runbook.md` |

## Success Criteria

- [ ] `rg -n "\b(sy|s|syllabus|curriculum|copy|template)\.classId\b|classId\s*(===|!==)\s*null" apps/web/src --glob '!**/*.test.*' --glob '!**/repos/syllabus.ts' --glob '!**/vocab/**'` không trả dòng nào sau phase 6 (phase 1 ghi kết quả baseline của đúng lệnh này để chứng minh cổng có bắt được; vocab dùng `classId` cho deck nên nằm ngoài).
- [ ] Chỉ module `apps/server/src/lib/syllabus-curriculum.ts` ghi `class.syllabus_id` bằng `.set({ syllabusId` (hai hàm: `setClassCurriculumPointer` theo lớp và `clearPointersTo` theo syllabus đích; riêng `POST /classes` đặt con trỏ ngay trong lệnh insert lớp), và test bất biến "mỗi lớp có copy thì con trỏ trỏ đúng copy; không có copy thì con trỏ null" xanh sau mọi thao tác tạo lớp, import, gỡ và xoá template do code mới thực hiện. Dữ liệu cũ do migration chữa theo kết quả đo ở phase 1 (con trỏ mồ côi cũ có thể còn nếu user không đồng ý dọn).
- [ ] `apps/server/src/routes/kernel.ts` giảm ít nhất 500 dòng so với 2116 dòng ban đầu; `pnpm --filter server test` xanh sau phase 2 mà không sửa `kernel.test.ts`.
- [ ] Migration `0042` (chỉ tạo khi phase 1 cho thấy cần) chạy sạch trên cơ sở dữ liệu giả lập có con trỏ lệch, chạy lại không đổi gì (idempotent), không xoá dòng nào.
- [ ] Hành vi tạo, import CSV/Excel, gán, gỡ giáo trình không đổi ngoài `TemplatePicker` mới.
- [ ] `pnpm exec biome check apps packages`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter web test`, `pnpm design:compare` và full `pnpm --filter e2e e2e` (port override theo AGENTS.md) đều xanh.
- [ ] UI đã verify ở 3 viewport 1440×900, 768×1024, 375×812 và focus bàn phím theo `REVIEW.md`.

## Red Team Review

Bốn reviewer (Security, Failure Mode, Assumption, Scope) cộng kongming đã duyệt; kết luận GO có điều kiện, đã áp dụng:

| Phát hiện | Xử lý |
|---|---|
| Ý "template luôn lưu `upcoming`" đổi hành vi, gãy test, không bảo vệ gì | Bỏ (D4 mới); không có `statusPolicy` |
| Alias `replace-content` ghi đè được bản copy lớp | Alias dùng `findTemplate` (phase 4) |
| Con trỏ khác org chặn xoá bởi FK | Q1b riêng ở phase 1; NULL hoá trong 0042 cần user đồng ý |
| Migration 0042 không phải lúc nào cũng cần | Chỉ tạo khi Q2 > 0 hoặc user chọn NULL hoá |
| Thứ tự release server trước web | PR R1 + smoke 401 |
| Unique conflict khác org gây 500 | 409 ở import (phase 4); resolver join `class` theo org |
| Gate/verify yếu (`-t` bỏ qua test, `pnpm check`) | Đổi sang biome và kiểm số test chạy |
| PR quá lớn | Tách 1 / 2a / 2b / R1 / 3a / 3b / 4; phase 8 tuỳ chọn |

## Unresolved questions

1. Phase 1 đo ra bao nhiêu lớp có con trỏ mồ côi hoặc khác org trên prod? Nếu lớn hơn 0, user quyết định có `NULL` hoá các con trỏ đó trong migration không (mặc định: không).
2. Có client ngoài web gọi `/api/syllabi/...` hoặc `/api/classes/:id/import-syllabus` không? Mặc định: không, alias giữ một release.
3. Có cần tạo giáo trình riêng cho lớp mà không qua template không? Mặc định: không (non-goal); nếu có thì cân nhắc lại hướng B.
