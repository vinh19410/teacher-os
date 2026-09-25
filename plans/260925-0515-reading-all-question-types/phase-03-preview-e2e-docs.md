---
phase: 3
title: "Preview, Bank Surfaces, E2E & Docs"
status: pending
priority: P2
effort: 4h
dependencies: [2]
---

# Phase 3: Preview, Bank Surfaces, E2E & Docs

## Context Links

- [plan.md](./plan.md) · [reports/scout-codebase.md](./reports/scout-codebase.md) (mục Rủi ro #4, #5)
- Code: `student-preview-paper.tsx:21` (prop `intro` hiện là prop chết — KHÔNG được render), `:57-71` (renderer stem+opts); `preview.tsx:19,86-95`; `apps/web/src/lib/repos/assignment-prompts.ts:8-29` (mapper field tường minh — field mới bị bỏ lại); `apps/web/src/lib/mock-data.ts:58-77` (type `AssignmentPrompt`); `prompt-preview-aside.tsx` (aside chi tiết ngân hàng, dùng tại `index.tsx:306`); `apps/e2e/specs/assignment-prompt-create.spec.ts` (assertion stale: `:132`, `:139`, `:179`, `:186-193`, `:209`)

## Goal

Preview hiển thị trọn vẹn đề dạng mới — **bao gồm intro (câu lệnh + ngân hàng lựa chọn) và ảnh diagram** — không leak đáp án (kể cả trên trang preview); ảnh nhìn thấy được ở ngân hàng đề; e2e chứng minh luồng tạo đề mới end-to-end.

## Requirements

- [ ] **Render `intro` trong `StudentPreviewPaper`** (red-team #1 — Critical): block whitespace-pre-line sau passage, trước danh sách câu hỏi, cho nhánh `isAuto` — đây là nơi chứa câu lệnh giới hạn từ và ngân hàng A–H của `features`/`sentend`; kèm test pin "intro hiện trong preview"
- [ ] `StudentPreviewPaper` nhận `imageUrl`, render `<img>` **chỉ khi `typeId/part` là diagram và URL khác rỗng** (gated theo type — red-team #5), scheme https verify tại renderer (lớp bảo vệ chính của preview vì draft client-side không qua contract — red-team #7), kèm `referrerPolicy="no-referrer"` + `loading="lazy"` (red-team #6)
- [ ] `preview.tsx` truyền đủ `items`/`passage`/`intro`/`imageUrl` (fix gap `preview.tsx:86-95`)
- [ ] **Ảnh ở ngân hàng đề** (red-team #13): `repos/assignment-prompts.ts` mapper thêm `imageUrl`; type `AssignmentPrompt` (`mock-data.ts:58-77`) thêm field; `PromptPreviewAside` render thumbnail nhỏ khi có
- [ ] **E2E leak-check visit trang preview** (red-team #11): assert DOM preview không chứa chuỗi đáp án của các câu vừa soạn — assertion hiện có (`:141-145`) chỉ check trang create, không vào preview
- [ ] E2E hiện hữu sửa toàn bộ assertion stale theo hành vi form-trống sau commit 29eee03 (`:132` submit enabled trên form reading trống, `:139` "8/8 đáp án", `:179` nút "Dùng file mẫu Cambridge 10" không còn, `:186-193` flow listening sample, `:209` "6/6 đáp án") — không bỏ spec
- [ ] E2E spec mới: tạo đề reading `ready` dạng `summary` (fill passage + intro + 2 câu) và dạng `diagram` (URL ảnh) → submit → verify ngân hàng + chi tiết + preview có `<img>`/intro
- [ ] Docs: CHỈ cập nhật nội dung đã tồn tại (`docs/codebase-summary.md:40` mô tả flow assignments — thêm nhắc image_url nếu đoạn đó liệt kê field; KHÔNG tạo section đếm số dạng mới — grep do plan chỉ định trả rỗng, red-team #14)

## Implementation Steps

1. `student-preview-paper.tsx` — render intro block; prop `imageUrl` gated theo diagram + https check + img an toàn.
2. `preview.tsx` — truyền đủ 4 giá trị; chạy `pnpm --filter web test` cập nhật `preview.test.tsx` (snapshot mới có intro/ảnh).
3. `repos/assignment-prompts.ts` + `mock-data.ts` + `prompt-preview-aside.tsx` — mapper, type, thumbnail aside.
4. Chạy `pnpm --filter e2e e2e` lấy baseline fail thực tế; sửa 5 vị trí stale liệt kê trên; viết spec mới theo pattern spec reading hiện có.
5. Grep docs trước khi sửa; chỉ edit nội dung tồn tại.
6. Full gate: `pnpm test && pnpm check-types && pnpm check && pnpm --filter e2e e2e`.

## Todo

- [ ] Preview: intro block + imageUrl gated + truyền 4 props
- [ ] Bank surfaces: mapper + type + aside thumbnail
- [ ] E2E: fix 5 stale vị trí + spec summary/diagram + leak-check trên preview
- [ ] Docs: chỉ sửa nội dung có sẵn
- [ ] Full gate xanh

## Verification

- Preview 1 đề `sentend`: intro ngân hàng A–H hiện trước câu hỏi; preview 1 đề `diagram`: ảnh hiện, alt đúng.
- Preview đề `tablecomp` KHÔNG có ảnh (gated theo type) dù từng dán URL trước khi đổi type.
- Full gate 4 lệnh xanh local.

## Risk & Mitigation

- **Fix preview đổi snapshot test cũ** — cập nhật có chủ đích, diff chỉ thêm (intro/ảnh) không mất phần tử cũ.
- **E2E fail do môi trường** — đối chiếu baseline `plans/reports/tester-*` trước khi quy cho thay đổi plan; ước lượng 4h đã tính việc viết lại 2 flow theo form trống.
- **Leak qua renderer mới** — intro block chỉ render nội dung giáo viên nhập (text), không chạm `answer`/`alts`; leak-check preview chốt.

## Security

- Anti-leak: DOM preview (đã fix gap) assert không chứa đáp án; ảnh chỉ `<img src>` sau https check, `no-referrer` chống tracking; không `dangerouslySetInnerHTML`.
