---
title: "Phase 5: Tests, E2E Spec & Local Verification Gates"
status: done
---

# Phase 5: Tests, E2E Spec & Local Verification Gates

## Context Links

- E2E boot setup: [`apps/e2e/src/boot.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/e2e/src/boot.ts) (lines 80–84)
- Student component tests: [`apps/student/src/components/vocab/vocab-suggestion-list.test.tsx`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/student/src/components/vocab/vocab-suggestion-list.test.tsx)
- Web component tests: [`apps/web/src/components/vocab/vocab-hub.test.tsx`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/web/src/components/vocab/vocab-hub.test.tsx)
- Existing vocab E2E specs: [`apps/e2e/specs/vocab-library-clone.spec.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/e2e/specs/vocab-library-clone.spec.ts), [`apps/e2e/specs/vocab-hub-suggestion.spec.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/e2e/specs/vocab-hub-suggestion.spec.ts)

## Overview

Bật tường minh `PRAGMA foreign_keys = ON;` trong `apps/e2e/src/boot.ts` sau `migrate()` để E2E chạy đúng chế độ khóa ngoại của Cloudflare D1, bổ sung unit tests cho `VocabCourseCatalog` (`apps/student`) và `VocabProgressTab` (`apps/web`), mở rộng E2E kiểm chứng toàn trình học viên tự truy cập khóa học từ vựng (kể cả khóa lớn 140 bài `libcourse-15`) mà không cần giáo viên assign/suggest, kiểm tra 3 viewport (`1440×900`, `768×1024`, `375×812`) + chụp screenshot, và chạy toàn bộ local verification gates theo `AGENTS.md`.

## Key Insights

- **Bật `PRAGMA foreign_keys = ON;` trong `apps/e2e/src/boot.ts` (RT-F4)**:
  - Trong `apps/e2e/src/boot.ts:80-84`, `migrate()` chạy trong transaction nên `PRAGMA foreign_keys=ON` trong `0038`/`0039` bị SQLite bỏ qua. Thêm `await client.execute("PRAGMA foreign_keys = ON;");` ngay sau `PRAGMA busy_timeout = 5000;` để mọi E2E spec đều kiểm chứng thực sự các ràng buộc khóa ngoại giống hệt Cloudflare D1.
- **Kịch bản E2E quan trọng nhất cần chứng minh**:
  1. Một học viên mới thuộc org của giáo viên nhưng **chưa được ghi danh vào lớp nào** và **chưa nhận bất kỳ gợi ý bộ từ nào** đăng nhập vào Student Portal, mở `/vocab`.
  2. Học viên thấy khu vực **"Khóa học từ vựng"** hiển thị đủ 20 khóa học có sẵn (`EXPECTED_COUNTS.course = 20`), bấm chọn 1 khóa học (bao gồm kiểm tra khóa lớn `libcourse-15` 140 bài) → URL cập nhật `?courseId=...` và hiển thị danh sách bài học (`libdeck-*`).
  3. Học viên bấm vào 1 bài học (`libdeck-*`) → vào `/vocab/libdeck-*`, kiểm tra DB `vocab_deck` vẫn có 0 dòng (không clone rác sang org), `vocab_card` được lazy-provision cho `libword-*`.
  4. Học viên bấm "Học từ mới" → vào phiên học SRS (`/vocab/libdeck-*/session`), màn giới thiệu từ (`vocab-learn-intro`) render cùng `hasAudio: true`.
  5. Quay lại `/vocab` (qua nút `"← Danh sách bộ từ"`), bài `libdeck-*` vừa mở xuất hiện ngay lập tức trong mục **"Bộ từ đang học"** với badge tên khóa học (`Khóa ...`) mà không bị kẹt stale cache 60s.
  6. Kiểm tra 3 viewport (`1440×900`, `768×1024`, `375×812`) trên trang `/vocab` của học viên (cả bước danh sách khóa học và bước danh sách bài học) không bị tràn ngang (`scrollWidth <= clientWidth`).

## Requirements

- [ ] Trong `apps/e2e/src/boot.ts:80-84`, thêm `await client.execute("PRAGMA foreign_keys = ON;");` sau `migrate()`.
- [ ] Viết unit test `apps/student/src/components/vocab/vocab-course-catalog.test.tsx`:
  - Render danh sách khóa học, tìm kiếm khóa học (debounce 300ms).
  - Bấm chọn khóa học → tải và hiển thị danh sách bài học kèm số từ mới / đã học / thành thạo / đến hạn, bấm nút quay lại danh sách khóa học.
- [ ] Cập nhật unit test `apps/web/src/components/vocab/vocab-hub.test.tsx` kiểm tra `VocabProgressTab` hiển thị badge `Khóa ${className}` (hoặc `"Thư viện"` khi `className` rỗng) cho deck có `source: "library"`.
- [ ] Viết hoặc mở rộng E2E spec kiểm chứng luồng học viên tự truy cập khóa học từ vựng (`libcourse-*` → `libdeck-*`) + kiểm tra 3 viewport (`1440×900`, `768×1024`, `375×812`).
- [ ] Chạy toàn bộ local gates theo `AGENTS.md`:
  - `pnpm check`
  - `pnpm check-types`
  - `pnpm --filter @teacher-os/db test`
  - `pnpm --filter @teacher-os/api test`
  - `pnpm --filter server test`
  - `pnpm --filter web test`
  - `pnpm --filter student test`
  - `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`

## Related Code Files

- Modify: `apps/e2e/src/boot.ts`
- Create: `apps/student/src/components/vocab/vocab-course-catalog.test.tsx`
- Modify: `apps/web/src/components/vocab/vocab-hub.test.tsx`
- Modify/Create: `apps/e2e/specs/vocab-library-clone.spec.ts` (hoặc tạo `apps/e2e/specs/student-vocab-courses.spec.ts`)

## Implementation Steps

1. Thêm `await client.execute("PRAGMA foreign_keys = ON;");` vào `apps/e2e/src/boot.ts`.
2. Viết `apps/student/src/components/vocab/vocab-course-catalog.test.tsx` kiểm tra render, tìm kiếm debounce, chọn khóa học, hiển thị bài học và xử lý lỗi tải dữ liệu.
3. Bổ sung test case `source: "library"` (kèm `className`) trong `apps/web/src/components/vocab/vocab-hub.test.tsx`.
4. Thêm E2E test kiểm chứng học viên tự duyệt khóa học, mở bài `libdeck-*`, vào phiên học SRS và xuất hiện ngay trong "Bộ từ đang học" + kiểm tra 3 viewport.
5. Chạy `pnpm check`, `pnpm check-types`, toàn bộ unit tests và E2E suite trên port `8100/8101/8103`.

## Todo

- [ ] Bật `PRAGMA foreign_keys = ON;` trong `apps/e2e/src/boot.ts`
- [ ] Unit test `apps/student/src/components/vocab/vocab-course-catalog.test.tsx`
- [ ] Unit test badge `source: "library"` trong `apps/web/src/components/vocab/vocab-hub.test.tsx`
- [ ] E2E test luồng học viên tự truy cập khóa học từ vựng + verify 3 viewport
- [ ] Pass toàn bộ local gates (`check`, `check-types`, unit tests, E2E)

## Success Criteria

- 100% unit tests trong `db`, `api`, `server`, `web`, `student` pass.
- E2E spec mới và các spec từ vựng hiện có (`vocab-srs.spec.ts`, `vocab-library-clone.spec.ts`, `vocab-hub-suggestion.spec.ts`) pass với `PRAGMA foreign_keys = ON`.
- `pnpm check` và `pnpm check-types` không có lỗi.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
