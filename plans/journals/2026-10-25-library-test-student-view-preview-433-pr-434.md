---
title: "Library test student-view preview (#433, PR #434)"
date: 2026-10-25
---

# Library test student-view preview (#433, PR #434)

Feature: nút "Xem trước" ở trang soạn bộ đề admin mở overlay toàn màn hình render đề bằng chính component take screen học viên (QuizPaper/QuizNavigator/split-pane Reading), làm thử không lưu.

Kiến trúc: mapping pure `libraryPartToQuizView` ở packages/api (strip key, infer per-group, qOffset) là hợp đồng hiển thị cho luồng clone sau này; QuizPart thêm `qOffset`/`optionBank`/`source`; QuizPaper bank theo part + suppress detail bank rỗng + gate ảnh theo group parts; PinOverlay key theo `item.q ?? offset` (backward-compat: caller cũ offset == q); QuizReadingSplitLayout dời sang packages/ui + `fillParent`; admin `buildTestPreview` tách nguồn ĐẾM (outline) khỏi nguồn NỘI DUNG (parse-gate) + 5 tab state; overlay focus-trap + answers per-tab + guard autosave header (blur race `relatedTarget`) + flush lưu khi đóng.

Bài học: (1) plan red-team tự động 3 persona bắt được 2 Critical thật (PinOverlay key theo offset mảng; alert giả option bank rỗng cho grouped bankable) — đáng từng phút; (2) assert visual bằng screenshot trong e2e bắt bug nền overlay trong suốt mà assertion DOM không thấy; (3) blur→click race: guard `previewOpenRef` không đủ vì blur chạy trước onClick — cần check `relatedTarget`; (4) `pnpm --filter e2e e2e -- <filter> -g <grep>` không truyền `-g` xuống playwright như mong đợi — dùng `pnpm --filter e2e exec playwright test <files> -g` trực tiếp.

Verification: unit 5 package (257/180/353/1432/180), check-types, biome, e2e admin-library 5/5 (gồm verify 3 viewport + keyboard), full Playwright 193/193. PR #434 → develop (beta, #433).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
