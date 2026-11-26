---
title: "Gộp tab Hành trình học & Giáo trình, trang chi tiết buổi học, cắt bài giảng PDF và bài tập theo buổi"
description: "Gộp tab Hành trình học + Giáo trình trên trang lớp học viên thành 1 tab có thể bấm từng buổi vào trang chi tiết gồm Bài giảng (cắt PDF từ sách gốc bằng pdf-lib) và Bài tập buổi học (file/link upload trước/sau buổi + bài tập tương tác gắn buổi)."
status: pending
priority: P1
effort: "1d"
tags: [student, web, materials, syllabus, assignments, pdf-lib]
created: 2026-11-26
---

# Gộp tab Hành trình học & Giáo trình + Chi tiết buổi học (Bài giảng & Bài tập)

## Overview

Hợp nhất hai tab **Hành trình học** và **Giáo trình** ở cổng học viên (`/classes/$classId`) thành một tab **Hành trình học** duy nhất (còn 3 tab: `Hành trình học` | `Bài tập` | `Tài liệu chung`). Các buổi học được nhóm theo Module giáo trình kèm tiến độ hoàn thành (lớp không có giáo trình giữ timeline phẳng). Mỗi buổi có ngày có thể bấm để mở trang chi tiết `/classes/$classId/sessions/$date` hiển thị đầy đủ thông tin buổi, **Bài giảng** (cắt thật từ file PDF sách gốc qua `pdf-lib` phía trình duyệt để tránh OOM trên Cloudflare Workers) và **Bài tập của buổi** (gồm cả file/link giáo viên tải lên trước hoặc sau buổi học lẫn bài tập tương tác từ Ngân hàng đề được gắn buổi học).

## Quyết định đã chốt

1. **Cắt bài giảng từ sách gốc:** Dùng `pdf-lib` (`^1.17.1`, lazy-load phía trình duyệt trong `apps/web`) cắt trực tiếp file PDF sách gốc (ưu tiên nguồn riêng của giáo viên: Ngân hàng tài liệu hoặc file PDF cục bộ trên máy ≤ 100 MB; nguồn Tài liệu chung kèm cảnh báo rõ rằng học viên đang thấy toàn bộ sách trong tab Tài liệu chung) theo khoảng trang `từ–đến` cho 1 hoặc nhiều buổi → tải file PDF con lên R2 qua API sẵn có kèm metadata nguồn (`sourceTitle`, `sourcePageStart`, `sourcePageEnd`) và gắn `category = "lecture"`. Học viên xem trước và tải về chỉ thấy đúng các trang đã cắt, không lộ toàn bộ sách gốc và không gặp giới hạn 128 MB RAM của Cloudflare Workers. <!-- Red-Team RT-10 -->
2. **Bài tập của buổi:** Kết hợp hai nguồn — (a) tài liệu/liên kết gắn trực tiếp vào buổi với `category = "homework"` (upload/gắn/gỡ trước hoặc sau buổi học đều được) và (b) bài tập tương tác `class_assignment` có thêm cột tùy chọn `session_date` để hiển thị trực tiếp trong trang chi tiết buổi (học viên bấm "Làm ngay"/"Xem lại"/"Nhận xét").
3. **Bố cục học viên:** 3 tab (`Hành trình học` | `Bài tập` | `Tài liệu chung`). Trong `Hành trình học` nhóm buổi theo Module giáo trình kèm tiến độ module; lớp không có giáo trình giữ timeline phẳng; bấm mỗi buổi mở `/classes/$classId/sessions/$date`.
4. **Phạm vi phía giáo viên:** Toàn bộ thao tác cắt sách theo buổi, phân loại Bài giảng/Bài tập, upload trước/sau buổi và gắn buổi khi giao bài tương tác sống trong trang chi tiết lớp giáo viên (`apps/web/src/routes/_auth/classes/$classId.tsx`).

## Ngoài phạm vi

- Học viên tải lên file bài làm cho bài tập dạng file (bài nộp trực tuyến vẫn đi qua luồng `class_assignment` / `/learn/quizzes/$assignmentId`).
- Cắt PDF trực tiếp trên template Giáo trình dùng chung ở `/syllabus/$syllabusId`.
- Giải mã file PDF có mật khẩu bảo vệ (hệ thống báo lỗi rõ ràng bằng tiếng Việt khi phát hiện PDF bị mã hóa).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [DB Schema, Migration & Shared Contracts](./phase-01-start.md) | Pending |
| 2 | [Server API Routes, Curriculum Mapping & Date-Move Sync](./phase-02-server-api-and-sync.md) | Pending |
| 3 | [PDF Slicer Engine (pdf-lib) & Teacher Class UI](./phase-03-pdf-slicer-and-teacher-ui.md) | Pending |
| 4 | [Student Merged Journey Tab & Session Detail Page](./phase-04-student-merged-journey-and-session-detail.md) | Pending |
| 5 | [E2E Specs, 3-Viewport Light/Dark Verification & Polish](./phase-05-tests-e2e-and-visual-verification.md) | Pending |

## Acceptance Criteria

- [ ] Migration Drizzle mới chạy sạch trên SQLite/libsql: thêm `category` (`lecture`|`homework`, default `lecture`), `source_title`, `source_page_start`, `source_page_end` trên `lesson_material`, và `session_date` (kèm index) trên `class_assignment`.
- [ ] API tài liệu buổi hỗ trợ phân loại `lecture`/`homework` (attach, upload file kèm query/title/source range, create link, patch category) trước và sau buổi học (chặn buổi `holiday` 409); `POST /api/classes/:id/assignments` hỗ trợ `sessionDate` tùy chọn và đồng bộ ngày khi dời buổi (`moveDate`), nghỉ lễ (`holidays.ts`), đổi ngày khai giảng (`class-start-date-reschedule.ts`), hoặc xóa buổi (set null).
- [ ] `GET /api/student/classes/:classId` trả kèm cấu trúc `syllabus` + metadata module/mục tiêu/đếm bài giảng & bài tập cho từng buổi; `GET /api/student/classes/:classId/sessions/:date` trả đầy đủ chi tiết buổi (IDOR 404, ẩn cột teacher-only, tôn trọng `visibleAssignmentFilter`).
- [ ] Công cụ cắt PDF bằng `pdf-lib` (lazy-load) cho phép giáo viên chọn sách PDF từ Tài liệu chung / Ngân hàng / máy tính, nhập khoảng trang cho 1 hoặc nhiều buổi, cắt ra file PDF con đúng số trang (có thông báo lỗi rõ khi PDF mã hóa hoặc khoảng trang sai) và gắn làm Bài giảng.
- [ ] Trang chi tiết lớp giáo viên hỗ trợ quản lý riêng **Bài giảng** và **Bài tập buổi học** (upload file/link trước hoặc sau buổi + giao bài từ Ngân hàng đề gắn vào buổi đó) và nút **Cắt sách theo buổi**.
- [ ] Trang chi tiết lớp học viên chỉ còn 3 tab (`Hành trình học` | `Bài tập` | `Tài liệu chung`); tab `Hành trình học` nhóm buổi theo Module giáo trình kèm tiến độ (hoặc timeline phẳng khi không có giáo trình), bấm mỗi buổi mở `/classes/$classId/sessions/$date` hiển thị Bài giảng (xem trước PDF + badge trang sách gốc + tải) và Bài tập của buổi (tương tác + file upload).
- [ ] Toàn bộ gates local pass (`pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, spec E2E liên quan bao gồm `student-session-detail`, `student-classmates`, `student-class-detail`, `class-shared-materials`, `material-upload-student`, `material-bank`, `material-multi-upload`), kèm screenshot 3 viewport (`1440×900`, `768×1024`, `375×812`) light + dark mode. <!-- Red-Team RT-7 -->

## Validation Log

### Session 1 — 2026-11-26
- **User Decisions Confirmed:** (1) Cắt thật PDF trong app bằng `pdf-lib` (browser-side tránh OOM Cloudflare Workers); (2) Bài tập buổi học gồm cả file/link upload (trước hoặc sau buổi) lẫn bài tập tương tác `class_assignment` gắn `sessionDate`; (3) Gộp còn 3 tab `Hành trình học | Bài tập | Tài liệu chung` với nhóm theo Module giáo trình (lớp không giáo trình giữ timeline phẳng); (4) Thao tác phía giáo viên trong trang chi tiết lớp.
- **Verification Results:** `ak plan validate` passed (`valid: true`, `Failed: 0`). Whole-Plan Consistency Sweep passed after applying all 11 Red-Team findings below.

## Red Team Review

### Session — 2026-11-26
**Reviewers:** 3 parallel adversarial reviewers (Security Adversary, Failure Mode Analyst, Assumption Destroyer)
**Findings:** 11 deduplicated (11 accepted, 0 rejected)
**Severity breakdown:** 6 Critical, 4 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| RT-1 | `class-start-date-reschedule.ts` 3-step holiday/2-phase `SHIFT_DATE_PREFIX` chunking (D1 100 bind limit) + CAS guard | Critical | Accept | Phase 2 |
| RT-2 | `classAssignment.sessionDate` atomic `bucketMoved` (`moveDate`), SQL guard + `parseStartDateStrict` + TA 403 (`POST /assignments`), `enrollment-activation.ts` sync | Critical | Accept | Phase 2 |
| RT-3 | Tách `SyllabusBankMaterialRef` khỏi `StudentLessonMaterialView`, sửa symbol `KernelClassAssignmentRow` & test path | Critical | Accept | Phase 1 |
| RT-4 | Bổ sung `apps/web/src/lib/repos/class-assignments.ts` (`mapClassAssignments`) để chiếu `sessionDate` | Critical | Accept | Phase 3 |
| RT-5 | Fallback timeline phẳng cho lớp legacy có giáo trình (`date: null`), giữ buổi `holiday` & buổi bổ sung khi nhóm Module, không lồng `<li>` | Critical | Accept | Phase 2, Phase 4 |
| RT-6 | Đồng bộ chính sách ẩn tài liệu buổi `holiday`/`cancelled` trên `student-materials.ts` và zero-out đếm trên `GET /classes/:classId`, `:date` sai định dạng trả 404 | Critical | Accept | Phase 2 |
| RT-7 | Giữ tương thích `.strict()` / omit default payload, 2-tab panel + 2 upload queue độc lập ở `SessionMaterialsModal`, cập nhật & chạy đủ E2E tài liệu | High | Accept | Phase 3, Phase 4, Phase 5 |
| RT-8 | Validate query + `body.cancel()` trước `storeUpload`, SQL `holidayBucketDateGuard` trên `PATCH`/`POST links`, DB `CHECK`, bidi filter, cắt tên file ≤ 200 ký tự | High | Accept | Phase 1, Phase 2, Phase 3 |
| RT-9 | Whitelist student-safe curriculum (không lộ `materialsNote`), truyền `now` cho `loadClassAssignmentItems`, dedupe `prevSessionDate`/`nextSessionDate` theo `enrollmentId` | High | Accept | Phase 2 |
| RT-10 | Ưu tiên nguồn riêng của GV trong `SliceBookModal` + cảnh báo cho Tài liệu chung, trần 100 MB + magic check + `Content-Type` + lazy `BlobDocumentView`, lọc `isProjected`/`shiftedAway` | High | Accept | Phase 3 |
| RT-11 | Không viết từ cấm `attendance`/`attendanceNote` trong `student.ts` (`student-projection-lock.test.ts`), lọc `recordingUrl` qua `isSafeMaterialUrl` | Medium | Accept | Phase 2, Phase 4 |

<!-- slug: student-session-detail-and-pdf-slicing -->
