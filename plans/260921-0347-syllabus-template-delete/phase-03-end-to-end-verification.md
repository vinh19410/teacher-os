---
title: "Phase 3: end-to-end-verification"
status: todo
---

# Phase 3 — Verification toàn diện

## Goal

Chạy toàn bộ test/type/lint của repo trên một commit chứa cả Phase 1 + Phase 2, và đối chiếu từng success criterion với 3 vế của yêu cầu user trước khi bàn giao.

## Bối cảnh & căn cứ

- **Scripts root** (`/Users/vinhtran/Documents/project/personal/teacher-os/package.json`): `test` = `turbo run test && pnpm test:ci-workflow && pnpm test:topology-drift` (dòng 20), `check` = `biome check --write .` (dòng 19), `check-types` = `turbo run check-types` (dòng 13).
- **Scripts per-app**: server `test` = `vitest run` (`apps/server/package.json:13`), `check-types` = `tsc -b` (dòng 12); web `test` = `vitest run` (`apps/web/package.json:12`), `check-types` = `vite build && tsc --noEmit` (dòng 10).
- **Phạm vi ảnh hưởng của plan này**: `packages/api/src/contracts.ts` (thêm schema), `apps/server/src/routes/kernel.ts` (thêm 1 endpoint), `apps/server/src/kernel.test.ts` (thêm 1 describe), `apps/web/src/lib/data-actions.ts` + `apps/web/src/lib/repos/kernel.ts` (thêm 1 action + 1 case), `apps/web/src/components/syllabus/delete-syllabus-button.tsx` (file mới), `apps/web/src/routes/_auth/syllabus/index.tsx` (footer card), `apps/web/src/lib/repos/kernel-command.test.ts` (thêm describe). Không schema/migration → topology không đổi (`test:topology-drift` phải vẫn xanh).
- **E2E** (optional): `apps/e2e` tồn tại với `playwright.config.ts` + `specs/` — KHÔNG bắt buộc trong plan này; chỉ chạy nếu môi trường dev server khả dụng.
- **Yêu cầu gốc 3 vế**: (1) cho phép xóa syllabus template; (2) lớp đã chọn không bị ảnh hưởng; (3) lớp mới không được chọn template đã xóa. Vế (2) và (3) đã có assert máy ở Phase 1 (matrix 15: copy sống sót + import lại 404; matrix 16: copy không xóa được; anomaly + org-scoping).

## Yêu cầu

- [ ] Toàn bộ test server + web pass (đã đạt ở Phase 1/2, tái xác nhận trên commit cuối)
- [ ] `pnpm test` toàn repo pass (gồm `test:ci-workflow` và `test:topology-drift`)
- [ ] `pnpm check-types` pass (turbo chạy cả server `tsc -b` lẫn web `vite build && tsc --noEmit`)
- [ ] `pnpm check` (biome) pass — không diff formatting/lint trên các file mới/sửa
- [ ] Success criteria checklist dưới đây được đối chiếu từng mục
- [ ] E2E Playwright: optional stretch — chỉ chạy nếu dev server khả dụng, kết quả không chặn done

## Files tạo/sửa

| Đường dẫn | Action | Mô tả | Phụ thuộc |
|-----------|--------|-------|-----------|
| (không sửa file nguồn trong phase này) | — | Phase chỉ chạy lệnh verify + đối chiếu checklist; mọi fix phát sinh quay lại file của Phase 1/2 | Phase 1, Phase 2 |

## Các bước triển khai

1. **Test toàn repo**:

   ```bash
   cd /Users/vinhtran/Documents/project/personal/teacher-os && pnpm test
   ```

   Mong đợi: turbo chạy test mọi package xanh, `test:ci-workflow` và `test:topology-drift` xanh (plan không đụng topology).

2. **Type-check toàn repo**:

   ```bash
   pnpm check-types
   ```

   Mong đợi: server `tsc -b` + web `vite build && tsc --noEmit` đều exit 0. Nếu web fail với "switch không cover union" → case `delete-syllabus` thiếu trong `kernelCommand` (Phase 2 bước 2).

3. **Lint/format**:

   ```bash
   pnpm check
   ```

   Mong đợi: biome exit 0 (lệnh có `--write` — nếu có diff được tự sửa, commit diff đó; chú ý biome-ignore comment trong `delete-syllabus-button.tsx` nếu rule a11y flag wrapper div).

4. **Đối chiếu success criteria** — đi qua từng checkbox trong section "Success Criteria" của `plan.md`, mục nào thiếu test/bằng chứng thì quay lại Phase tương ứng bổ sung.

5. **(Optional stretch) E2E smoke** — chỉ khi dev server khả dụng:

   ```bash
   # apps/e2e có playwright.config.ts + specs/ — chạy spec liên quan syllabus nếu có
   pnpm --filter e2e test  # hoặc lệnh playwright theo package.json của apps/e2e
   ```

   Kịch bản smoke thủ công (quan trọng hơn spec tự động cho phase này): tạo template → tạo lớp nhập từ template đó → vào `/syllabus` bấm "Xóa" trên card template → confirm → (a) card biến mất; (b) vào class detail của lớp cũ: giáo trình còn nguyên cây + tiến độ; (c) mở add-class modal / import modal của lớp mới: template đã xóa không còn trong danh sách.

## Todo

- [ ] `pnpm test` toàn repo xanh
- [ ] `pnpm check-types` xanh
- [ ] `pnpm check` xanh (commit diff formatting nếu có)
- [ ] Đối chiếu xong checklist Success Criteria của plan.md
- [ ] (Optional) E2E/smoke thủ công 3 kịch bản (a)(b)(c) nếu dev server khả dụng
- [ ] Cập nhật `status: completed` cho plan.md và 3 phase file

## Verification

| Yêu cầu user | Bằng chứng máy | Bằng chứng thủ công (nếu chạy dev) |
|---------------|----------------|-------------------------------------|
| (1) Xóa được template | matrix 15 (server): DELETE trả 200, template + cây biến mất khỏi snapshot; test mapping `kernelCommand delete-syllabus` (web) | Nút "Xóa" trên card → confirm → toast "Đã xóa template." → card biến mất |
| (2) Lớp đã chọn KHÔNG bị ảnh hưởng | matrix 15: copy của lớp còn đủ cây (modules + lessons), `class.syllabusId` vẫn trỏ copy, `sourceTemplateId` detach null; matrix 16: copy không thể bị xóa nhầm qua endpoint template | Class detail của lớp đã import: giáo trình + tiến độ buổi học nguyên vẹn sau khi template bị xóa |
| (3) Lớp mới không chọn được | matrix 15: import-syllabus với templateId đã xóa → 404; web: `templates` filter `classId === null` trên snapshot refresh (use-syllabus.ts:24) tự loại template | Add-class modal / import modal của lớp mới: template đã xóa không còn trong select |
| Anomaly + isolation | anomaly test: class trỏ thẳng template vẫn xóa được, pointer null; org-scoping test: template org khác → 404 | — |

Lệnh tổng hợp:

```bash
pnpm --filter server test    # Phase 1 scope
pnpm --filter web test       # Phase 2 scope
pnpm test                    # toàn repo + ci-workflow + topology-drift
pnpm check-types             # toàn repo
pnpm check                   # biome
```

## Rủi ro & mitigations

| Rủi ro | Khả năng | Tác động | Mitigation |
|--------|----------|----------|------------|
| `test:topology-drift` đỏ vì thêm schema export mới vào contracts.ts | Thấp | Chặn merge | Đọc output drift; nếu cờ là do thêm export hợp lệ (không đổi shape snapshot) → cập nhật fixture drift theo convention của script; nếu drift chỉ ra snapshot contract thay đổi ngoài ý muốn → sửa endpoint |
| Biome flag biome-ignore comment không dùng / sai rule name trong component mới | Trung bình | `pnpm check` fail | Chạy `pnpm check` sớm ở Phase 2; điều chỉnh comment theo gợi ý của biome |
| Web check-types fail vì switch `kernelCommand` thiếu case | Thấp (TS bắt ngay khi thêm union) | Build đỏ | Case đã có ở Phase 2 bước 2; lỗi này chỉ xuất hiện nếu thêm action mà quên mapping |
| Test server chậm/flaky do D1 batch trên template lớn | Thấp | Timeout CI | Template trong test mới chỉ 2 modules + 1-2 lessons — dưới MAX_IMPORT_NODES (kernel.ts:230) nhiều |

## Security

- Không thay đổi bề mặt security ở phase này — chỉ verify. Xác nhận lại bằng quan sát output test: matrix org-scoping xanh (template org khác → 404), matrix 16 xanh (copy của lớp → 404, che tồn tại), các guard `kernelCtx`/`readBody` được cover bởi suite bootstrap hiện có (401 test, kernel.test.ts:334-337).
