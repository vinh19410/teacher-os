# Ship Official Release v0.0.21 (develop → main)

**Date**: 2026-11-13 06:10 UTC
**Severity**: Medium
**Component**: Release `v0.0.21` (`apps/server/src/routes/materials.ts`, `apps/e2e/specs/media-upload-magic-bytes.spec.ts`, `docs/_reverse/reverse-plan.json`)
**Status**: Resolved

## Chuyện gì đã xảy ra

Đợt promote `develop` → `main` (`v0.0.20` → `v0.0.21`) mang theo **44 commits** cùng các bản sửa lỗi và tài liệu cho release, với **0 D1 migration mới**. Các thay đổi chính được ship kể từ `v0.0.20` gồm:

- **Security hardening**: `#675` (`createStudentGuard` fail-closed + client org self-healing), `#676` & `#681` (kiểm tra extension + 64-byte magic-byte streaming validation xuyên suốt material bank, Speaking, Library audio, Placement audio, Vocab audio và Exam imports).
- **Materials & Class lifecycle**: `#646` (atomic SQL `WITH RECURSIVE` chặn cycle/depth cho thư mục + tách quyền TA RBAC), `#647` (inline media CSP + giới hạn 95 MiB + E2E), `#670` (đồng bộ manual ↔ auto lifecycle khi import/remove curriculum).
- **Test/tooling reliability**: `#656` (`fileURLToPath` trên 88 file server test cho đường dẫn non-ASCII), `#652` & `#653` (sửa seed và pay screen cho `design:compare`).
- **Docs**: Reverse-SRS drafts (31/31 features trong `docs/_reverse/`) và `docs/auth-signin/` tier-1/tier-2 specs.

Thoạt nhìn đây giống một đợt promote gọn vì 0 có migration mới, nhưng các cổng kiểm tra trước release đã phơi bày 3 vấn đề thật: một lỗi format ở `docs/_reverse/reverse-plan.json`, một lỗ hổng Critical ngay Pass 1 của `code-reviewer` trong `apps/server/src/routes/materials.ts`, và một lỗi `401` khi chạy full E2E.

## Sự thật trần trụi

Cảm giác mệt mỏi nhất của đợt ship này là sự tương phản giữa bề ngoài "chắc ổn rồi" với hai cú phanh gấp ngay sát giờ promote.

Khi `code-reviewer` bắt lỗi **Critical** ở Pass 1 cho `storeUpload` trong `apps/server/src/routes/materials.ts`, cảm giác vừa giật mình vừa ức chế: chúng ta vừa đổ công làm validate magic-byte streaming cho hàng loạt bề mặt upload qua `#676` & `#681`, vậy mà chính `storeUpload` vẫn gọi `peeked.stream.cancel()` trên stream đã bị `store.put` khóa qua `pipeThrough`. Nếu bỏ qua bước review đó, bug đã đi thẳng lên `main`.

Cú thứ hai còn tốn sức hơn: chờ **20.5 phút** cho một lượt full E2E (`task-134`) để thấy kết quả dừng ở `270/272` vì lỗi `401` trong `apps/e2e/specs/media-upload-magic-bytes.spec.ts`. Spec chạy riêng thì êm, nhưng ghép vào suite chung sau `admin-auth.spec.ts` lại gãy chỉ vì helper `ensureAdminAccount` không tự đăng nhập khi tài khoản admin đã tồn tại sẵn.

## Chi tiết kỹ thuật

1. **Format gate**: `biome check` báo lỗi format tại `docs/_reverse/reverse-plan.json` — đã format trực tiếp tại chỗ.
2. **Critical stream lock bug**: Trong `apps/server/src/routes/materials.ts`, `storeUpload` vẫn gọi `peeked.stream.cancel()` thay vì `peeked.abort(...)` khi `store.put` đã khóa `peeked.stream` qua `pipeThrough`. Sau khi sửa và thêm regression unit test trong `materials.test.ts`, suite đạt **36/36 passed**.
3. **E2E cross-spec auth state (`401`)**: Chạy full E2E (`task-134`) đạt **270/272**, lộ 1 lỗi thật trong `apps/e2e/specs/media-upload-magic-bytes.spec.ts`: gặp `401` ở test admin khi chạy sau `admin-auth.spec.ts` vì `ensureAdminAccount` không đăng nhập khi admin user đã tồn tại. Đã sửa bằng cách gọi `POST /api/auth/sign-in/email`, verify lại cặp spec đạt **12/12**, rồi chạy lại full E2E đạt **271/272** (1 skipped Google OAuth, **20.5 phút**).
4. **Verification tổng hợp**:
   - `pnpm exec biome check --diagnostic-level=error` trên các file sở hữu: pass
   - `pnpm check-types`: **12/12**
   - `pnpm test`: **14 packages + 4 script suites**
   - `pnpm exec turbo run test:ledger --filter=server`: **9 passed, 1 expected fail**
   - `pnpm --filter server test`: **109 files, 1427 passed, 1 expected fail**
   - Full E2E: **271 passed, 1 skipped**

## Những gì đã thử & Quyết định

- **Format tại chỗ `docs/_reverse/reverse-plan.json`**: Chọn sửa thẳng file thay vì né rule Biome, giữ chuẩn format đồng nhất cho tài liệu reverse-SRS.
- **Vá `storeUpload` + thêm regression test ngay trước release**: Đổi `peeked.stream.cancel()` sang `peeked.abort(...)` và khóa lại bằng test trong `materials.test.ts` (36/36 passed), bác bỏ phương án để sang PR sau vì đây là lỗi Critical trên luồng upload.
- **Bổ sung `POST /api/auth/sign-in/email` ngay trong `media-upload-magic-bytes.spec.ts`**: Chọn làm rõ bước đăng nhập ở cấp spec thay vì sửa hành vi của `ensureAdminAccount` trên toàn bộ suite E2E, tránh phát sinh tác dụng phụ ngoài ý muốn trước giờ promote.

## Phân tích nguyên nhân gốc

- **Sót call site khi dùng cơ chế `peeked.abort(...)`**: Khi áp dụng stream peek/abort, `storeUpload` trong `apps/server/src/routes/materials.ts` vẫn giữ `peeked.stream.cancel()` dù `store.put` đã khóa stream bằng `pipeThrough`. Không có regression unit test phủ nhánh locked-stream nên bộ test ban đầu không bắt được.
- **Đặt giả định sai vào `ensureAdminAccount`**: Spec `media-upload-magic-bytes.spec.ts` mặc định helper tạo tài khoản cũng đảm bảo trạng thái đã đăng nhập. Khi chạy đơn lẻ hoặc khi user chưa có sẵn thì lỗi không lộ, nhưng ngay khi chạy sau `admin-auth.spec.ts`, việc admin user đã tồn tại khiến bước sign-in bị bỏ qua và trả về `401`.

## Bài học rút ra

- Mỗi lần sửa hoặc chuẩn hóa vòng đời stream (`cancel()` → `abort(...)`), **phải grep toàn bộ caller** và viết test kiểm tra đúng trường hợp stream đã bị khóa bởi `pipeThrough`.
- Trong E2E, không được đánh đồng `ensureAdminAccount` với trạng thái đã có session hợp lệ. Spec nào cần quyền admin phải tự gọi `POST /api/auth/sign-in/email` hoặc kiểm tra session tường minh để không gãy theo thứ tự chạy của `admin-auth.spec.ts`.
- Không cắt bớt bước `code-reviewer` hay full E2E gate dù release không có D1 migration mới — cả hai lỗi nghiêm trọng nhất của `v0.0.21` đều chỉ lộ ra ở hai bước cuối này.

## Bước tiếp theo

- Hoàn tất promote `develop` → `main` cho `v0.0.21` dựa trên bộ verification đã qua gate (`pnpm check-types` 12/12, server test 1427 passed / 1 expected fail, full E2E 271 passed / 1 skipped).
- Trong các đợt dọn tech-debt E2E tới, rà lại các spec dùng `ensureAdminAccount` để đảm bảo không còn spec nào phụ thuộc ngầm vào thứ tự chạy sau `admin-auth.spec.ts`.
