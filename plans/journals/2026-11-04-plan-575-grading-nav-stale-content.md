---
title: Plan 575 grading navigation stale content fix
date: 2026-11-04
summary: "Hoàn tất khảo sát, tái hiện và chốt plan 2 phase TDD + handover (--advice) khắc phục lỗi đứng hình khi điều hướng sang /grading (#575)."
---

# Plan 575 grading navigation stale content fix

## What happened
Đã điều tra và tái hiện thành công lỗi #575 được phản ánh trên staging (Cô Mỹ): bấm "Chấm bài" trên sidebar menu thì URL đổi thành `/grading` nhưng màn hình giữ nguyên trang cũ, phải F5 mới thấy hàng chờ chấm.

Tham vấn cố vấn kiến trúc `kongming` và thực nghiệm kiểm chứng đã làm rõ:
- Menu sidebar dùng `<Link to="/grading">` và route `/_auth/grading/` khai báo hoàn toàn hợp lệ; `activeOptions` và trailing slash không phải nguyên nhân.
- Gốc rễ nằm ở `/_auth.beforeLoad` (`apps/web/src/routes/_auth/route.tsx:7-21`): trên mọi lượt điều hướng và hover (`defaultPreload: "intent"`), TanStack Router đều kích hoạt `authClient.getSession()`, gửi request cross-origin sang `/api/auth/get-session` không cache và không có timeout.
- Trong khi request mạng này đang bay (đặc biệt khi mạng chậm, Cloudflare edge latency hoặc worker cold-start), TanStack Router đã cập nhật URL ngay lập tức (`history.pushState`) nhưng giữ nguyên màn hình cũ vì transition chưa commit. Không có spinner do `defaultPendingMs` mặc định 1000ms.
- Hai subagent Red-Team (`SecurityAdversary`, `AssumptionDestroyer`) đã rà soát và đóng góp 7 điểm mấu chốt:
  1. Giữ TTL cache ngắn (10 giây) để giảm thiểu cửa sổ trễ bảo mật.
  2. Bắt buộc xóa cache khi `signOut()`, `reauth()`, khi cập nhật tên/avatar (`updateUser` trong `profile.tsx` / `avatar-section.tsx`), hoặc khi session trả về `{ data: null }`.
  3. Bổ sung try/catch an toàn trong `beforeLoad` tránh unhandled `TimeoutError` khi `AbortSignal.timeout(5000)` hết hạn.
  4. Cấu hình `defaultPendingMs: 200` trong `main.tsx` để người dùng thấy spinner kịp thời nếu mạng chậm thực sự.

## Decision
Chốt thực thi 2 phase TDD theo kế hoạch `plans/261104-1110-575-grading-nav-stale-content`:
- Phase 1: Thêm `getCachedSession` (TTL 10s, deduplication, timeout 5s, auto-purge null) vào `apps/web/src/lib/auth-client.ts`, gắn dọn cache vào `reauth.ts`, `profile.tsx`, `avatar-section.tsx`, có unit test đầy đủ.
- Phase 2: Áp dụng vào `_auth/route.tsx` với try/catch fail-open an toàn, đặt `defaultPendingMs: 200` trong `main.tsx`, bổ sung router navigation test độc lập.

## Next steps
Cập nhật GitHub issue #575 với labels và thông tin plan, bắt đầu thực thi code (Phase 1 & 2) theo quy trình TDD.
