---
title: Ship Official Release v0.0.27
date: 2026-11-25
summary: "Promote develop lên main v0.0.27: tài liệu chung lớp, intro + timer tự luyện, cứng hoá upload Speaking; merge origin/main giữ superset develop; follow-up Medium nháp AI Speaking bị bỏ sót"
---

# Ship Official Release v0.0.27 (develop → main)

**Date**: 2026-11-25 08:45 UTC
**Severity**: Medium
**Component**: Release `v0.0.27` (`develop` → `main`), placement AI grading (`apps/server/src/lib/placement-ai/`)
**Status**: Release đã chuẩn bị (bump `0.0.27` + `CHANGELOG.md` mục 2026-11-25), còn mở một finding Medium cần follow-up

## Chuyện gì đã xảy ra

Đợt promote `v0.0.26` → `v0.0.27` gom **14 commit feature/fix** trên `develop` (`ce21580b`…`0a6c0162`) cộng merge `origin/main` tại `53556700`. Phạm vi chính:

- **Tài liệu chung theo lớp (#914, #918):** tab "Tài liệu chung" ở web + student, endpoint không lộ `objectKey`, `href` đi qua `isSafeMaterialUrl`.
- **Tự luyện:** màn hình intro inline trước khi bắt đầu (#883), đồng hồ đếm ngược đồng bộ giờ server qua header `X-Server-Now` + migration `0090_concerned_mach_iv.sql` gom trùng lượt `in_progress` và tạo partial unique index `quiz_attempt_practice_in_progress_uq` (#880/#931).
- **Placement Speaking:** cứng hoá upload (token riêng, CAS `pending_upload`/`pending_grading`, 409 khi đã chốt) + luồng khôi phục học viên (#924), chấp nhận đuôi `.aac` (#928).
- **Listening/Reading:** stream audio bằng HTTP Range + ETag (#878), cô lập option bank theo nhóm và gỡ hướng dẫn xung đột (#875, #876, #877, #879).
- **UI:** ẩn tab bạn cùng lớp ở student (#913), sidebar thu gọn không lộ footer + drawer mobile (#919), `Tabs` tự cuộn tab active (#920).

## Sự thật phũ phàng

Phần code thì gọn. Phần làm mất thời gian lại là thứ ngoài code: merge `origin/main` vào `develop` dính **6 file conflict**, và sau đó test web đỏ lòm vì máy đang tải chứ không phải vì code sai. Bực nhất là 7 test timeout trông y hệt regression thật, phải chạy lẻ từng cái mới dám kết luận. Và đúng lúc tưởng đã xong thì review lôi ra một race trong luồng chấm AI Speaking mà chính PR #924 (PR "cứng hoá") đáng lẽ phải bịt. Cứng hoá upload nhưng lại để lọt nhánh chấm, nghe hơi trớ trêu.

## Chi tiết kỹ thuật

- **Conflict tại `53556700`:** `CHANGELOG.md`, `apps/e2e/specs/student-classmates.spec.ts`, `apps/server/src/lib/media-response.test.ts`, `apps/student/src/components/class/class-detail-view.tsx`, `apps/student/test/class-detail.test.tsx`, `packages/ui/src/components/app-shell/user-footer.test.tsx`. Nguồn gốc: các backport/hotfix đi thẳng lên `main` (scheduler, notifications `emit.ts`, sidebar) trong lúc `develop` sửa cùng vùng.
- **Sau merge phải chạy `pnpm install`:** lockfile/dependency từ `main` khác `develop`; bỏ qua bước này thì typecheck/test lỗi resolve module, không liên quan logic.
- **7 test `apps/web` timeout khi chạy full suite trên máy đang tải**, chạy cô lập thì PASS. Không sửa test, không nới timeout trong commit release.

## Quyết định

1. **Giải conflict theo hướng giữ superset của `develop`.** `develop` đã chứa phần lớn thay đổi của `main` cộng thêm feature mới, nên lấy bản `develop` làm gốc rồi bổ sung phần riêng của `main`. Bác bỏ "ours/theirs" toàn file: sẽ âm thầm mất guard hoặc test của một phía.
2. **`user-footer.test.tsx` gộp cả hai phía:** giữ test của `main` (fix sidebar/footer) lẫn test của `develop` (#919), vì hai bộ kiểm hai hành vi khác nhau. Không chọn một bên.
3. **Coi 7 timeout là nhiễu tải, không phải blocker:** bằng chứng là pass khi chạy lẻ. Bác bỏ việc tăng timeout toàn cục vì nó che luôn regression hiệu năng thật về sau.
4. **Finding Medium từ review xử lý follow-up, không chặn release** (chi tiết bên dưới).

## Finding Medium: nháp AI Speaking không được tạo

Trong `apps/server/src/lib/placement-ai/run-placement-grading.ts` (~510-524): khi upload Speaking đến **lúc Writing vẫn đang `processing`**, code gọi `finalizePlacementAiGrading(deps, sub)` rồi claim với `from = ["none", "failed", "drafted"]`. Nhưng lượt `processing` đó được claim **trước khi có audio**, nên nó chấm Writing xong và chuyển sang `drafted` mà không có transcript Speaking. Nếu finalize chưa kết thúc job (còn trong hạn), claim kế tiếp không khớp trạng thái và `return` luôn. Kết quả: submission `drafted` có audio Speaking nhưng transcript rỗng và **không có nháp AI Speaking**, giáo viên phải tự chấm hoặc bấm chấm lại mà không biết vì sao.

**Root cause:** Thiết kế coi "đã `drafted`" là điểm kết thúc, trong khi điều kiện đúng phải là "đã `drafted` **với đủ input đang có**". Không có test nào cho thứ tự Writing-processing → Speaking-upload.

**Hướng sửa:** `finalizePlacementAiGrading` (hoặc bước sau khi job Writing kết thúc) phải re-claim khi kết quả là `drafted` mà submission có Speaking nhưng transcript rỗng, theo đúng CAS `(aiStatus, aiStartedAt)` hiện có để không đè lượt mới.

## Bài học

- Mỗi backport thẳng lên `main` là một món nợ conflict. Lần này 6 file, lần trước 4. Backport phải được merge ngược về `develop` ngay trong ngày.
- Sau mọi merge chéo nhánh: chạy `pnpm install` trước khi đọc kết quả gate, đừng debug lỗi resolve.
- Test timeout dưới tải phải được kiểm chứng bằng chạy lẻ trước khi gọi là flaky, và ghi tên lại, đừng chỉ nhún vai cho qua.
- State machine async có nhiều input đến lệch giờ cần test cho **mọi thứ tự đến**, không chỉ happy path.

## Bước tiếp theo

1. **Engineering (đợt kế tiếp, ưu tiên cao):** mở issue (label `ai-handle`) cho finding Medium; thêm test tái hiện "upload Speaking khi Writing `processing`" trong bộ test placement-ai, rồi sửa re-claim trong `finalizePlacementAiGrading`.
2. **Release operator:** sau deploy prod, kiểm submission placement có audio Speaking nhưng `aiStatus = drafted` và transcript rỗng; chấm lại thủ công nếu có.
3. **Engineering:** ghi tên 7 test web timeout vào issue theo dõi flaky, đo thời gian chạy dưới tải trước khi tính đến chuyện tách shard hay tăng timeout cục bộ.
4. **Quy trình:** sau mỗi hotfix lên `main`, merge `main` → `develop` cùng ngày.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
