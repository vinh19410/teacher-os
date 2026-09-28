---
title: Plan reading 14 question types
date: 2026-09-25
summary: "Lập kế hoạch thêm 8 dạng Reading còn thiếu (đủ 14 dạng IELTS) cho flow tạo bài tập — plan 260925-0515, issue #269"
---

# Plan reading 14 question types

# Kế hoạch: Reading đủ 14 dạng câu hỏi IELTS (ak:plan --github)

**Plan:** `plans/260925-0515-reading-all-question-types/` · **Issue:** #269 · **Mode:** hard, HOLD scope

## Bối cảnh

Nghiên cứu trước đó (plans/reports/research-2026-09-25-ielts-reading-question-types.md) chốt IELTS Reading có 11 dạng chính thức (14 khi tách nhỏ). Dự án đang có 6 dạng trong `ASSIGNMENT_PART_TYPES` (tfng/sent, headings/info, ynng/mcq). User yêu cầu kế hoạch triển khai đủ 8 dạng còn lại cho flow tạo bài tập Reading mới.

## Quyết định thiết kế chính

- Phân bổ 5/5/4 theo part: p1 + note/shortans/diagram; p2 + summary/sentend/tablecomp; p3 + features/flowchart. Id mới zero-collision (grep toàn repo).
- 2 dạng matching dùng kind `letter` sẵn có; ngân hàng lựa chọn A–H ghi trong ô intro (placeholder TYPE_HINTS) — cùng mức fidelity với `info`. 6 dạng còn lại dùng kind `text` fallback như `sent` (alts "a/b/c" khớp quy tắc chấm IELTS).
- Diagram cần ảnh → thêm cột `image_url` (ADD COLUMN DEFAULT '', precedent 0019 audio_name), https-only theo precedent avatar-policy.

## Quy trình đã chạy

Scope Challenge (HOLD) → scout (Explore) + research format 8 dạng (researcher, nguồn ielts.org PDF nguyên văn) song song → scaffold `ak plan create` + rename phase-01 + `add-phase` ×2 → viết plan.md + 3 phase files → red-team 3 persona (code-reviewer ×3 song song) → adjudicate → consistency sweep → validate CLI OK.

## Phát hiện đáng giá từ red-team (15 findings, 13 áp)

1. **Critical:** `StudentPreviewPaper` khai báo prop `intro` nhưng không bao giờ render — ngân hàng A–H của 2 dạng matching sẽ không hiện ở preview nếu chỉ làm theo plan đầu.
2. `imageUrl` phải đi đủ dây chuyền `PreviewDraft`/`savePreviewDraft` (whitelist tay tại new.tsx:323-341) — bỏ sót là tính năng chết âm thầm.
3. "Lưới an toàn" kind-map mà plan trích thực ra không tồn tại: `answerKindByType` module-private, sync test chỉ so ids → phải export + viết test sync mới.
4. Step migration "chạy dev DB cục bộ" là quy trình không có thật: drizzle config là d1-http remote; apply do alchemy lúc deploy.
5. e2e leak-check hiện có không hề visit trang preview; stale surface lớn hơn dự kiến (5 vị trí).
6. Reset type/part xóa intro nhưng không xóa imageUrl (mới) → phải reset; render ảnh gated theo type.

## Trạng thái

- Plan validated (`ak plan validate` OK), issue #269 gắn label "ready to review".
- Chưa implement — bước tiếp theo `/ak:cook plans/260925-0515-reading-all-question-types/plan.md` (3 phase, ~12h, 1 PR duy nhất vì contracts ↔ web catalog sync-couple qua test và CI chạy pnpm test).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
