---
title: "Ship beta #377: vocab-srs e2e test 3 tự chủ state khi chạy isolated"
date: 2026-10-20
summary: "Bác bỏ giả thuyết 'row student bị xoá'; chứng minh root cause là test-isolation (closure state từ test 1–2 trong describe.serial). Thêm helper seedIsolatedEnvironment (Mức 0: seed due quá khứ + review_log trước khi portal home mount và prefetch cache 60s). Phát hiện và tách issue #379 cho vacuous assertion wrong-streak overlay."
---

# Ship beta #377: vocab-srs isolated seed

## What happened
Thực thi pipeline `ak-vibe --ship --beta --advice` cho issue #377 (`LibsqlError: SQLITE_CONSTRAINT: FOREIGN KEY constraint failed` tại `apps/e2e/specs/vocab-srs.spec.ts:390`).

1. **ak:debug:** Repro deterministic với `--grep "seeded overdue review card"` trên develop sạch; kiểm tra `apps/e2e/local.db` sau run fail cho thấy `student/vocab_card/vocab_deck/user` đều 0 rows; grep toàn bộ `apps/server/src` xác nhận không có code xoá `student`. Kết luận: không có row nào bị xoá — test 3 phụ thuộc closure state (`studentId`, `deckId`, `wordIds`) do test 1–2 trong `test.describe.serial` gán.
2. **Thiết kế Mức 0 (sau verification-failure #2):** Portal home (`routes/_auth/index.tsx:158`) gọi `useVocabOverview()` ngay khi mount sau verify email; `query-client.ts:42` đặt `staleTime: 60_000` + `networkMode: "offlineFirst"` nên SPA navigation sang `/vocab` không refetch. Helper `seedIsolatedEnvironment` vì vậy seed thẳng word `"sustainable"` với `due_at` quá khứ và 1 `vocab_review_log` hôm nay **trước** bước signup/verify.
3. **Phát hiện #379:** Assertion `if (safety >= 5) expect(overlaySeen).toBe(true)` là vacuous trên session 1-card vì `typingEligible("sustainable") = true` và tier rules (`quiz-generator.ts:238-261`) force `typing` sau tối đa 2 lần choice sai → test điền đúng `"sustainable"` làm kết thúc session trước khi `wrongStreak` chạm 5. Đã tách sang issue #379 kèm bằng chứng tĩnh từ source.

## Decision
- Giữ nguyên 100% hành vi đường serial (dòng xoá duy nhất trong spec là `await signInStudent(page);` được bọc `if (!isolated)`).
- Seed DB trước signup trong helper để `provisionStudentForUser` (`apps/server/src/student-provisioning.ts:22-31`) match `lower(trim(email))` và return sớm.
- Không sửa assertion overlay trong PR #377 để tránh trộn scope và giữ kỷ luật không đụng assertion ngoài phạm vi; theo dõi riêng ở #379.

## Next steps
- Merge PR vào `develop` và đóng plan `teacher-os/261020-0747`.
- Xử lý issue #379 trong PR riêng (đổi chính sách trả lời của loop để wrong-streak 5 tất định).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
