---
title: "Khử trùng lặp đề Listening 'Talking about the history of bikes' và chuẩn hoá nhãn nguồn Unknown (#887)"
date: 2026-11-25
summary: "Hạ bản sao legacy PR #843 về draft qua migration 0092 (sau rebase đụng 0091 của PR #940), chuẩn hoá 'Unknown' thành 'Other sources', siết quyền đọc draft trên student-practice và đồng bộ badge TestCard (#887)."
---

# Journal: Khử trùng lặp đề Listening "Talking about the history of bikes" và chuẩn hoá nhãn nguồn `Unknown` (#887)

- **Date:** 2026-11-25 15:49
- **Severity:** Medium
- **Component:** Listening Library (`packages/db`), Student Practice API (`apps/server`), Practice Catalog UI (`apps/student`)
- **Status:** Resolved (chờ verify Staging sau deploy `develop`)
- **Issue:** #887 (`fix(listening): đề "Talking about the history of bikes" bị trùng trang 1 và 42, nhãn nguồn không thống nhất`)
- **Plan:** `plans/261125-1321-887-fix-listening-bikes-duplicate-and-unknown-source/plan.md`
- **Branch:** `vinh19410/fix-listening-talking-about-the-history-of-bikes` (target: `develop`, `--ship --beta --advice`)

## Chuyện gì đã xảy ra & Nguyên nhân gốc rễ

Đề Listening *"Talking about the history of bikes"* xuất hiện trùng ở trang 1 và trang 42 danh mục tự luyện kèm nhãn nguồn không thống nhất. Nguyên nhân không có gì phức tạp — thuần tuý là nợ dữ liệu tạo tay cũ không được dọn khi thêm bulk importer, cộng với chỗ chuẩn hoá nguồn làm chưa tới:

1. **Bản ghi legacy PR #843 còn sót lại:** Hàng tạo tay cũ `"Talking about the history of bikes"` (UUID không mang tiền tố `lib-listen-`, `collection` rỗng) vẫn nằm song song với bản canonical bulk-import `lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3` từ `Unknown-S4-talking-about-the-history-of-bikes.json` (file `498/498` → `created_at` mới nhất → nổi lên trang 1, đẩy bản legacy về trang 42).
2. **Nhãn `Unknown` lọt lưới và badge thiếu đồng bộ:** `normalizeCollectionAndGroup` để nguyên `"Unknown"` trên 9 file `Unknown-*.json`, trong khi `TestCard` ẩn luôn `testGroup` khi `collection` rỗng và thiếu cắt ngắn (truncation).

## Thực tế mệt mỏi của phiên làm việc

Một lỗi dữ liệu thoạt nhìn khá gọn lại dính liên tiếp ba cú ngáng chân ngoài dự tính. Đau đầu nhất là máy VM chia sẻ vọt load average lên `22–30`: `turbo run check-types` chạy song song chết ngang vì OOM (`exit 137`), còn Vitest liên tục nổ timeout `5000ms` khiến cảm giác như cả bộ test đang gãy trong khi lỗi nằm ở áp lực tài nguyên máy chủ. Xong vòng code chính thì local code review bắt đúng ca hiếm `submitted + in_progress` cùng tồn tại trên một đề đã hạ về `draft`, suýt để lọt lỗi rò snapshot hỏng sang `$attemptId.detail.tsx`. Tới sát bước ship, rebase lên `origin/develop` mới nhất lại đụng đúng PR #940 vừa merge `0091_fix_reading_shares_duplicated_title.sql`, buộc phải đánh số lại toàn bộ migration sang `0092` và kiểm chứng lại cả chuỗi snapshot.

## Quyết định kỹ thuật & Thay đổi

- **Drizzle migration `0092_fix_listening_bikes_dedup_and_unknown_source.sql` (đổi số từ `0091` sau PR #940, nối `meta/0092_snapshot.json` `prevId` về `93f0b276-45e5-4723-84a4-8f64b365ff12`):** Chủ động **hạ bản legacy non-`lib-listen-` về `draft` thay vì `DELETE`** nhằm bảo toàn toàn vẹn `/history` và `study_pack_item`. Việc hạ trạng thái chỉ chạy khi bản canonical đang `ready`, có part `s4` và `audio_key` không rỗng; ghi chú `[Duplicate of ...]` giới hạn `<= 2000` ký tự; chuẩn hoá `'Unknown'` → `'Other sources'` an toàn INF-03 trên 4 bảng (không chạm `updated_at` trên `assignment_prompt`).
- **Quyền đọc đề `draft` (`apps/server/src/routes/student-practice.ts`):** `loadPracticeTestForRead` chỉ mở `GET /quiz` và `GET /audio` trên đề `draft` khi học viên đã đăng nhập sở hữu một practice attempt ở trạng thái `submitted`, và **luôn trả `attempt: null`** trên đề `draft` (từ chối cho resume/submit `in_progress` cũ theo phát hiện của local code review để chặn rò snapshot hỏng vào `$attemptId.detail.tsx`). `POST /attempts` và người chưa nộp bài vẫn trả cứng `404`.
- **Seed & importer thư viện Listening (`packages/db/src/seed/listening-library.ts`, `packages/db/scripts/import-listening-library.ts`):** Chuẩn hoá `/^unknown$/i` → `"Other sources"`, bổ sung hai verify gate `unknownCollectionMatches` và `unknownPartSourceMatches`, thêm cảnh báo trùng lặp pre-flight non-fatal (`ORDER BY id ASC LIMIT 500`), an toàn `--public-logs` và lọc ký tự điều khiển ASCII/C1/Unicode chống log injection.
- **Practice Catalog UI (`apps/student/src/components/practice/skill-catalog.tsx`):** Đồng bộ logic trim/join nhãn của `TestCard` với `PracticeIntroScreen`, thêm `max-w-[calc(100%-1.25rem)] truncate` và thuộc tính `title`.
- **Chiến lược xác minh dưới tải VM cao:** Theo tư vấn `kongming`, **không nới timeout hay sửa cấu hình repo** — chạy tuần tự bằng `pnpm check-types --concurrency=1` và Vitest `--no-file-parallelism --maxWorkers=1` (pass 100% ở ngưỡng mặc định `5000ms`). Kiểm chứng UI chọn phương án nhẹ Option A (`boot:api` + `student` `vite preview` + Playwright) xuất 6 ảnh chụp 3 viewport sáng/tối tại `plans/reports/887-listening-catalog-*.png`, và khoá chặt ca `submitted + in_progress` bằng regression test corrupt snapshot.

## Bài học rút ra

- **Bulk importer bắt buộc phải đi kèm rà soát dữ liệu tạo tay cũ và verify gate:** Không có pre-flight duplicate check và gate kiểm tra nhãn `"Unknown"` thì dữ liệu legacy PR #843 cùng 9 file `Unknown-*.json` sẽ im lặng trôi thẳng lên catalog.
- **Mở quyền đọc `draft` cho lịch sử nộp bài phải đóng kín cửa `in_progress`:** Cho phép xem lại bài đã nộp không được phép kéo theo quyền resume phiên làm dở trên đề đã hạ cấp; mọi route đọc đề `draft` cần kiểm tra cả ca người dùng có đồng thời `submitted` lẫn `in_progress`.
- **Tách nhiễu hạ tầng trước khi đụng cấu hình test:** Khi VM chia sẻ chạm load `22–30` gây OOM `exit 137` và timeout `5000ms`, tuần tự hoá chạy kiểm tra giúp chứng minh code đúng mà không che giấu hồi quy thật.
- **Rebase `develop` xong phải soát ngay thứ tự migration và chuỗi `prevId`:** Các PR chứa migration hợp nhất sát nhau rất dễ đụng slot như vụ `0091` → `0092`.

## Bước tiếp theo

- **Sau deploy Staging (`develop`):** Người ship/QA xác minh live `/student/practice/listening` (không còn trùng đề *"Talking about the history of bikes"*, nhãn nguồn hiển thị thống nhất `"Other sources"`).
- **Tuỳ chọn trên Staging:** Chạy lại workflow `Import Listening Library Staging` để kiểm chứng các verify gate mới và pre-flight duplicate warning trên môi trường thực.
- **Đợt release `develop -> main` kế tiếp:** Chủ release bổ sung mục ghi nhận migration `0092_fix_listening_bikes_dedup_and_unknown_source.sql` vào `docs/production-release-runbook.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
