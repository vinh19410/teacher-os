---
title: "Xem trước đề đã lưu theo góc nhìn học viên"
description: "Thêm nút 'Xem trước' cho đề đang chọn ở /assignments, điều hướng đến trang preview riêng hiển thị đúng như học viên nhìn thấy."
status: completed
priority: P2
effort: 4h
issue: 282
branch: develop
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-09-30
---

# Xem trước đề đã lưu theo góc nhìn học viên

## Overview

Tại `/assignments`, khi giáo viên chọn một đề (ví dụ "The Influence of the Crime
Writer Agatha Christie" — dữ liệu runtime do giáo viên tạo, không có trong seed),
aside preview hiện chỉ là bản thu gọn. Plan này thêm nút **"Xem trước"** điều
hướng đến một trang riêng render đúng giao diện học viên nhìn thấy khi làm bài.

Giải pháp: mở rộng route `/assignments/preview` sẵn có bằng search param
`?id=<promptId>` ("bank mode"). Route này đã render `StudentPreviewPaper` —
component giấy bài đúng góc học viên — nhưng hiện chỉ đọc draft chưa lưu từ
sessionStorage. Bank mode resolve đề theo id từ snapshot kernel qua `useData()`.
Tiền lệ trong repo: `/assignments/tests/preview` đã resolve preview theo id từ
snapshot (`resolveRefDraft`).

Phương án bị loại: tạo route mới `/assignments/prompts/$id/preview` — nhân đôi
page shell (breadcrumb + answer sheet mô phỏng), tách UX "Xem trước" thành hai
trang, không mang lại giá trị thêm vì trang đích đã tồn tại.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Chọn đề ở `/assignments` → thấy nút "Xem trước" → sang trang riêng render đúng giao diện học viên | P1 |
| 2 | Flow preview draft (từ trang soạn đề) hoạt động nguyên vẹn, không hồi quy | P1 |
| 3 | Unit test + e2e phủ cả hai mode | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Bank-mode preview route](./phase-01-bank-mode-preview-route.md) | Pending |
| 2 | [Nút Xem trước và e2e](./phase-02-preview-button-and-e2e.md) | Pending |

## Success Criteria

- [ ] Chọn đề bất kỳ ở `/assignments` → nút "Xem trước" xuất hiện trong aside; bấm → URL `/assignments/preview?id=<promptId>` → trang render `StudentPreviewPaper` với đầy đủ nội dung đề đã lưu (đề reading: passage, image, bank, câu hỏi; writing: prompt + answer sheet mô phỏng; số từ hoạt động).
- [ ] Breadcrumb bank mode `Bài tập › Xem trước`; nút back "Quay lại danh sách" trả về `/assignments`.
- [ ] `?id=` không hợp lệ → empty state trung thực + link về `/assignments` (không trắng trang, không crash).
- [ ] `?id=` hiện diện → ưu tiên đề theo id, draft cũ trong sessionStorage không được phép chiếm trang.
- [ ] Không có `?id=` → hành vi draft mode hiện tại giữ nguyên (test hiện có pass).
- [ ] `pnpm --filter web run test` pass toàn bộ; e2e `assignment-bank.spec.ts` pass.

## Dependencies

- Không có dependency chéo plan. Dữ liệu đề lấy từ `KernelSnapshot.assignmentPrompts` (đã có sẵn qua `mapAssignmentPrompts`).

<!-- slug: assignment-prompt-preview-page -->
