---
title: "Không cho bỏ qua phần Speaking trong đề Entry Test"
description: "Bắt buộc thí sinh ghi âm phần Speaking trước khi nộp bài Entry Test ở cả UI công khai (profile), cổng học viên (student) và Backend API khi đề có câu hỏi Speaking."
status: completed
priority: P1
effort: 3h
branch: vinh19410/Không-cho-bỏ-qua-bài-test-speaking
tags: [feature, frontend, backend, api, placement-test]
blockedBy: []
blocks: []
created: 2026-11-18
---

# Không cho bỏ qua phần Speaking trong đề Entry Test

## Overview

Hiện tại đề Entry Test (Placement Test) cho phép thí sinh bấm nút "Bỏ qua phần Speaking" hoặc bấm "Vẫn nộp bài ngay" trong hộp xác nhận khi chưa có bản ghi âm Speaking, và Backend API vẫn chấp nhận `speakingMode: "skipped"` hoặc `"none"` ngay cả khi đề có câu hỏi Speaking. Kế hoạch này chặn việc bỏ qua Speaking trên cả ba lớp: Backend API (`packages/api` + `apps/server`), trang công khai `/kiem-tra-dau-vao/` (`apps/profile`), và cổng học viên `/placement-test` (`apps/student`), đồng thời giữ nguyên cơ chế "Kết thúc phần Speaking" sớm khi đã thu âm ít nhất 1 câu, luồng upload 2 bước (`POST` -> `PUT` audio cho file lớn và retry mạng), và tương thích ngược hiển thị lịch sử cho bài cũ có `speakingStatus = "skipped"`.

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Loại `"skipped"` khỏi submit schema (`400 PLACEMENT_SUBMIT_INVALID`) và từ chối `speakingMode !== "upload"` ở Backend API (`400 PLACEMENT_SPEAKING_REQUIRED`) khi đề phát hành có câu hỏi Speaking | P1 |
| 2 | Giao diện `/kiem-tra-dau-vao/` (profile) và `/placement-test` (student) loại bỏ hoàn toàn nút "Bỏ qua phần Speaking" và chặn nộp bài nếu chưa có bản ghi âm hợp lệ | P1 |
| 3 | Giữ nguyên nút "Kết thúc phần Speaking" sớm (nếu đã có audio hợp lệ), giải quyết dead-end khi file > 50 MB, và giữ hiển thị kết quả cho bản ghi lịch sử `speakingStatus === "skipped"` | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Backend Contract & API Enforcement](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Profile & Student UI Enforcement + E2E](./phase-02-ui-and-e2e-enforcement.md) | Completed |

## Success Criteria

- [x] `studentPlacementSubmitSchema` và `placementPublicSubmitSchema` chỉ chấp nhận `speakingMode: "upload" | "none"`; `hasPlacementSpeakingTasks(snapshot)` được dùng thống nhất ở API và Student UI, còn `resolveSpeakingSubmitDecision()` ở Profile chặn nộp khi `hasSpeakingTasks && !hasValidBlob`.
- [x] `POST /public/placement-test/submissions` và `POST /api/student/placement-test/submissions` trả 400 `PLACEMENT_SPEAKING_REQUIRED` khi `hasPlacementSpeakingTasks(snapshot)` là `true` và `speakingMode !== "upload"`, không tạo lead/submission hay tiêu hao quota rate-limit; nếu `!hasPlacementSpeakingTasks(snapshot)` mà gửi `speakingMode === "upload"`, trả 400 `PLACEMENT_SUBMIT_INVALID`.
- [x] Không còn nút "Bỏ qua phần Speaking" hay đường xác nhận "Vẫn nộp bài ngay" để bỏ qua Speaking ở `apps/profile` và `apps/student`; mọi thông báo lỗi micro hướng dẫn cấp quyền/đổi thiết bị hoặc liên hệ giáo viên, và trạng thái > 50 MB có nút xóa bản ghi để ghi lại.
- [x] Unit tests (`packages/api`, `apps/server`, `apps/profile`, `apps/student`), `pnpm check`, `pnpm check-types`, và E2E specs liên quan đều pass.

## Red Team Review

### Session — 2026-11-18
**Findings:** 11 tổng hợp từ 2 reviewer (Security Adversary + Assumption Destroyer) — sau gộp trùng còn 6 finding riêng biệt
**Severity breakdown:** 4 Critical, 2 High, 2 Medium (sau deduplicate: 4 Critical, 1 High, 1 Medium)

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | `normalizePublishedPlacementSnapshot()` luôn backfill 8 câu Speaking khi `tasks.length === 0`, nên chiến lược test seed `speaking.tasks = []` bị gãy | Critical | Accept | Phase 1, Phase 2 |
| 2 | Luồng nộp 2 bước (`POST` `speakingMode: "upload"` -> `PUT` audio) vẫn tồn tại tradeoff nếu client cắt ngang trước `PUT` | Critical | Accept (Scope Clarification) | Plan Overview, Phase 1 |
| 3 | Schema submit vẫn giữ `"skipped"` và mã lỗi 400 chưa thống nhất với client `apps/profile` | High | Accept | Phase 1, Phase 2 |
| 4 | Guard Phase 1 bỏ sót chiều ngược lại (`!hasPlacementSpeakingTasks(snapshot) && speakingMode === "upload"`) | Critical/Medium | Accept | Phase 1 |
| 5 | Dead-end khi bản ghi > 50 MB, fallback `"skipped"` ở `test.js:3811`, `unansweredConfirmState` và `window.scrollTo(top: 0)` khi lỗi 400 | High | Accept | Phase 2 |
| 6 | Bỏ sót 4 test trong `apps/student/test/placement-test.test.tsx` và lỗi strict-mode/mock ẩn trong `placement-ai-grading.spec.ts` & `student-placement-test.spec.ts` | Critical | Accept | Phase 2 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-ui-and-e2e-enforcement.md`
- Decision deltas checked: 6 (schema `z.enum(["upload", "none"])`, bỏ chiến lược seed `tasks: []`, thêm guard `!hasPlacementSpeakingTasks`, xử lý `PLACEMENT_SPEAKING_REQUIRED` & `> 50 MB` & scroll ở UI, cập nhật danh sách đầy đủ unit/E2E tests)
- Reconciled stale references: 5
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Light (2 phases)
- **Claims checked:** 12 (file paths, schemas, `normalizePublishedPlacementSnapshot`, `validatePlacementForPublish`, route handlers, UI helpers, test sites)
- **Verified:** 12 | **Failed:** 0 | **Unverified:** 0
- **Structural CLI check:** `ak plan validate` -> `valid: true`

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-ui-and-e2e-enforcement.md`
- Decision deltas checked: 6
- Reconciled stale references: 0
- Unresolved contradictions: 0

<!-- slug: require-placement-speaking -->
