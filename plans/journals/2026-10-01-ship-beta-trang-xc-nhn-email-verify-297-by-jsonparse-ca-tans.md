---
title: "Ship beta trang xác nhận email verify (#297) — bẫy JSON.parse của TanStack Router search"
date: 2026-10-01
summary: "Route /verify-email 2 app + resend; e2e 5/5 fail vì parseSearch JSON.parse biến marker verified=1 thành number; đổi marker sang verified=ok — 117/117 e2e xanh, ship beta vào develop."
---

# Ship beta trang xác nhận email verify (#297) — bẫy JSON.parse của TanStack Router search

## What happened
Ship `--beta` issue #297 trên branch `vinh19410/feat/verify-email-confirmation-page`: trang xác nhận sau khi user bấm link verify email, cho cả teacher (web EN) lẫn học viên (student VI) — route `/verify-email` + view 3 nhánh (success / error + resend). Sign-up truyền `callbackURL` kèm marker `?verified=1` để view phân biệt "vừa verify xong" với "vào thẳng URL".

E2e fail 5/5 một cách âm thầm khó hiểu: view không bao giờ nhận thấy marker. Trace dài ra mới thấy: **TanStack Router `parseSearch` mặc định chạy `JSON.parse` trên từng search value** — `verified=1` trong URL bị parse thành **number** `1`, còn view guard `typeof search.verified === "string"` nên rơi vào nhánh prune, xóa param khỏi URL (URL-sync). Cứ tưởng better-auth v1.6.27 nuốt mất callbackURL — `curl` xác nhận redirect giữ nguyên query nguyên vẹn; thư viện vô tội.

Fix 1 dòng mang tính quyết định: đổi marker sang `verified=ok` — non-JSON, `JSON.parse('"ok"')` không xảy ra trên chuỗi không quote nên value giữ nguyên string, guard pass. Toàn bộ e2e 117/117 xanh sau đó.

## The brutal truth
Cực because mình đã chuẩn bị đổ lỗi cho better-auth và sẵn sàng viết workaround quanh nó — trong khi thủ phạm là tầng router mà chính app mình cấu hình. Đã đối chiếu dist của thư viện (đúng quy trình, vẫn là việc nên làm) nhưng **chỉ verify tầng library, quên verify tầng consuming side** (router parse search trước khi code view thấy nó). Mất nguyên một vòng debug e2e chỉ vì một assumption chưa được kiểm chứng ở đúng lớp. 5/5 test fail cùng một lý do là tín hiệu hệ thống, không phải tín hiệu flake — đáng lẽ phải nghi ngờ tầng parse sớm hơn.

## Technical details
- Repro: URL `/verify-email?verified=1` → router search nhận `{ verified: 1 }` (number) → guard `typeof === "string"` fail → prune param khỏi URL qua URL-sync → view vào nhánh error.
- Root cause: TanStack Router default `parseSearch` = `JSON.parse` từng value (`stringifySearch`/`parseSearch` semantics).
- Fix: marker `?verified=ok` trong `callbackURL` từ sign-up form (cả `apps/web/src/components/sign-up-form.tsx` lẫn `apps/student/src/components/auth/sign-up-form.tsx`).
- Verification: `pnpm check`, `pnpm check-types`, web vitest 1174 passed, e2e full (ports 8100/8101/8103) 117 passed exit 0.
- Plan: `plans/261001-0635-verify-email-confirmation-page/plan.md` (completed).

## Finding phụ — cần ticket riêng
Teacher verify email trên browser **chưa có session** nhận **403 ROLE_MISMATCH JSON thô** (không phải trang đẹp): `packages/auth` `session.create.before` throw vì GET navigation không mang Origin header, `resolveRequestApp` mặc định về student. DB đã flip `verified` trước đó nên bấm link lần 2 thì OK — tức là bug chỉ bắn một lần đúng lúc user cần thấy success screen nhất. Cần issue follow-up: trả về redirect/view thay vì raw JSON 403 cho unauthenticated verify navigation.

## Lessons learned
- Khi đối chiếu dist của một thư viện, **verify thêm tầng consuming side** (router, client wrapper, middleware) trước khi kết tội hoặc quanh nó — bug nằm ở lớp mình sở hữu nhiều hơn cả.
- Đừng chọn marker/query value có thể bị serializer biến dạng (`"1"` → number). Chuỗi non-JSON như `ok` an toàn với `JSON.parse` mặc định của TanStack Router.
- Fail pattern đều đặn (5/5 cùng fail mode) = tầng parse/transform, không phải flake hay data.

## Decision
- Đổi marker `verified=1` → `verified=ok` thay vì custom `parseSearch`/`stringifySearch` cho route: ít diện chạm nhất, không đụng public contract của route.
- Finding ROLE_MISMATCH 403 tách ticket riêng, không nhét vào PR #297 (khác boundary: packages/auth vs UI page).

## Next steps
- Mở issue follow-up cho 403 ROLE_MISMATCH raw JSON khi teacher verify trên browser không session (owner: chủ branch/issue #297, ngay sau merge).
- Ship beta → PR vào `develop`, label `ready to ship beta` theo quy trình #292. Stable promotion chờ quy trình riêng.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
