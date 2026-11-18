# Plan: Entry Test Writing & Speaking — IELTS Grading & AI Error-Only Listing

- **Issue:** #800 (`https://github.com/vinh19410/teacher-os/issues/800`)
- **Target branch:** `develop` (`--merge --beta`)
- **Status:** In Progress

## Overview

Chuyển phần chấm Writing & Speaking trong Entry Test (Placement Test) sang mô hình:
1. **AI chỉ liệt kê lỗi học viên** (`errors` + `speakingTranscript`) — bỏ hoàn toàn đề xuất điểm (`rubric`) và nhận xét tham khảo (`feedback`).
2. **Giáo viên nhập 4 tiêu chí IELTS + điểm tổng (`0–9`, bước `0.5`)** cho Writing và Speaking; tự tính điểm tổng theo `ieltsOverallBand` khi đủ 4 tiêu chí nhưng cho phép sửa tay trực tiếp.
3. **Tổng hợp CEFR & tương thích ngược:** quy đổi tuyến tính `(band / 9) * 100%` trong `computePlacementFinal`; dữ liệu cũ (`/15`, `/20`) vẫn đọc và hiển thị bình thường.

## Phases

| Phase | Scope | Ownership | Status |
|---|---|---|---|
| Phase 1 | DB schema + migration (`writing_band`, `speaking_band`), `@teacher-os/api` contracts & tests | `packages/db/**`, `packages/api/**` | Pending |
| Phase 2 | Server AI pipeline (`grader`, `openai-grader`, `fake-grader`, `run-placement-grading`, `placement-result`, `placement-submission-service`, routes & tests) | `apps/server/**` | Pending (after Phase 1) |
| Phase 3 | Teacher UI (`PlacementSubmissionPanel`, `PlacementAiStatusBanner`), Student portal (`placement-result-views`), Profile public result (`result.js`, `highlight.js`) & tests | `apps/web/**`, `apps/student/**`, `apps/profile/**` | Pending (after Phase 1, parallel with Phase 2) |
| Phase 4 | E2E specs update & run, screenshots for POT, full local gates, isolated review, PR & merge to `develop` | `apps/e2e/**`, `plans/reports/**` | Pending (after Phase 2 & 3) |

## Acceptance Criteria

1. AI pipeline chỉ tạo và lưu `errors` + `speakingTranscript` (không có `rubric`, `feedback`).
2. Schema DB lưu `writing_band` & `speaking_band` (`real`, bước `0.5`), đọc fallback cho bài cũ (`/15`, `/20`).
3. UI giáo viên khởi tạo điểm trống (`—`), dùng `BandSlider` + input số `0–9` bước `0.5`, auto-fill điểm tổng theo `ieltsOverallBand` và cho sửa tay, chặn nút Chốt khi thiếu điểm, bỏ `AiFeedbackNote`.
4. `computePlacementFinal` quy đổi `(band / 9) * 100%`; Zalo, email, portal học viên và trang kết quả công khai hiển thị Band IELTS (`X.X/9`) & 4 tiêu chí IELTS (có fallback bài cũ).
5. `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, và các spec E2E placement pass; review cô lập sạch; issue #800 có POT và đã merge vào `develop`.
