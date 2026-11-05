---
title: "Ship #615: Khóa ô nhận xét và slider khi đang lưu bài để chống mất chữ"
date: 2026-11-05
summary: "Hoàn tất triển khai TDD sửa lỗi #615: khóa ô feedback textarea và thanh trượt BandSlider bằng disabled={isSaving}, bổ sung guards defense-in-depth, unit tests và integration test đạt 100% pass, code review đạt 0 findings, sẵn sàng mở PR beta vào develop"
---

# Ship #615: Khóa ô nhận xét và slider khi đang lưu bài để chống mất chữ

## Chuyện gì đã xảy ra

1. **Phân tích nguyên nhân gốc:**
   - Trong màn hình chấm bài (`/grading/:attemptId`), khi giáo viên nhấn "Chốt trả bài" / "Lưu điểm" hoặc "Lưu bản nháp", request API được gửi đi bất đồng bộ (~1.5 giây).
   - Trong lúc request in-flight, ô nhận xét `#grade-feedback` và các thanh trượt `BandSlider` không bị khóa. Giáo viên gõ tiếp nội dung vào ô nhận xét.
   - Khi request lưu thành công, server trả về `gradedAt` mới hoặc `draft.version` mới, làm đổi `key` của `GradeForm` (`draftActive ? draft-${draft.version} : data.grade?.gradedAt ?? "new"`), khiến component unmount và mount lại với dữ liệu vừa lưu từ server. Toàn bộ chữ gõ thêm trong lúc lưu bị biến mất hoàn toàn không có cảnh báo.

2. **Triển khai TDD Red → Green:**
   - **Phase 1 (Red):** Viết unit test trong `grade-form.test.tsx` assert rằng khi `saving={true}` hoặc `savingDraft={true}`, `#grade-feedback` có `disabled === true`, các `BandSlider` có `disabled === true`, `<form>` có `aria-busy="true"`, và nút Chốt trả bài bị disabled. Xác nhận test fail (Red).
   - **Phase 2 (Green):**
     - Bổ sung prop `disabled?: boolean` cho `BandSlider` (`apps/web/src/components/grading/band-slider.tsx`), truyền xuống `<input type="range">`, thêm style `disabled:cursor-not-allowed disabled:opacity-50`, và thêm guards `if (!disabled)` trong `onChange` và `onPointerUp`.
     - Trong `GradeForm` (`apps/web/src/components/grading/grade-form.tsx`):
       - Khai báo `const isSaving = saving || Boolean(savingDraft);`.
       - Gắn `data-testid="grade-form"` và `aria-busy={isSaving}` lên `<form>`.
       - Truyền `disabled={isSaving}` cho `BandSlider` và guard `if (!isSaving)` trong `onChange`.
       - Truyền `disabled={isSaving}` cho `Textarea id="grade-feedback"` và guard `if (!isSaving)` trong `onChange`.
       - Mở rộng submit guard: `if (!complete || isSaving || !canPublish) return;`.
       - Khóa nút "Chốt trả bài": `disabled={!complete || isSaving || !canPublish}`.
       - Khóa nút "Lưu bản nháp": `disabled={!complete || isSaving}` và guard đồng bộ `if (!complete || isSaving) return;`.
   - **Phase 3 (Verify & Quality):**
     - Bổ sung integration test trong `apps/web/src/routes/_auth/grading/index.test.tsx` dùng `Promise.withResolvers` mô phỏng mutation in-flight pending, xác nhận inputs bị khóa và sau khi resolve, form remount với dữ liệu server chính xác.
     - Chạy toàn bộ 26 unit & integration tests liên quan: pass 100%.
     - `pnpm exec biome check` và `pnpm check-types`: pass sạch (0 errors).

3. **Tham vấn Kongming & Code Review:**
   - Trải qua 3 vòng tham vấn Kongming (`--advice`): điều tra ban đầu, chốt plan & red-team adjudication, và sau khi hoàn tất implementation & review.
   - Red Team Review gồm 3 reviewer (`SecurityAdversary`, `FailureModeAnalyst`, `AssumptionDestroyer`) với 6 accepted findings giúp chuyển đổi quyết định từ `readOnly` sang `disabled` (tránh false affordance, chặn triệt để IME flush và paste), thêm guards defense-in-depth, và bổ sung test integration.
   - Local Code Review kết luận: **PASS** (0 Critical / 0 High / 0 Medium).

## Quyết định

- Ship theo chế độ `beta` vào nhánh `develop`.
- Sử dụng thuộc tính chuẩn `disabled={isSaving}` trên `#grade-feedback` và `BandSlider`, thống nhất với tiền lệ `GradeModal` (`inputsDisabled = saving || gradeSaved`).
- Giữ nguyên cơ chế server-authoritative `key` remount của repo.

## Bước tiếp theo

- Mở PR vào `develop` qua `ak-ship beta`.
- Kích hoạt `ak-review-pr` để review, fix, reply, gắn label `ready to ship beta`.
- Tham vấn Kongming đánh giá PR và comment lên issue #615.
- Merge PR và theo dõi CI `develop` tới khi xanh.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
