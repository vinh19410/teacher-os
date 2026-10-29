---
handoff-version: 1
generated: 2026-10-07T01:42:00Z
generator: ak:handoff
focus: "sửa 1 + 2 và follow theo tài liệu https://developer.sepay.vn/vi/bankhub/tong-quan"
workspace: /Users/vinhtran/Documents/project/personal/teacher-os
branch: develop
head: cc35bb1
---

# HANDOFF: sửa lỗi 500 của POST /api/bank-link/link-token (Bank Hub)

## Mission and current status
Focus: "sửa 1 + 2 và follow theo tài liệu https://developer.sepay.vn/vi/bankhub/tong-quan".

Mục tiêu: `POST /api/bank-link/link-token` (local dev) phải trả hosted link URL thay vì 500, và mọi lỗi từ SePay Bank Hub phải ra mã lỗi rõ ràng (502/429) thay vì 500 trống.

Done:
- Đã chứng minh nguyên nhân gốc (xem Decisions). Chưa sửa code logic nào.
- Đã thêm chẩn đoán vào thông báo lỗi `BankHubError` (đường dẫn trường zod + tên khoá cấp cao nhất, không có giá trị). Chưa commit.

Remaining:
- Mục 1: sửa parse phẳng cho `createLinkToken` + sửa fixture test.
- Mục 2: bắt `BankHubError` ở các route bank-link, trả 502/429 kèm `code`.
- Đối chiếu với tài liệu SePay Bank Hub (URL người dùng cung cấp, chưa được fetch trong session này).
- Bấm lại nút liên kết trên web local để xác nhận với sandbox thật.

Urgency: normal (chặn luồng liên kết ngân hàng ở local, chưa có dấu hiệu ảnh hưởng production).

## Scope and guardrails
Workspace: /Users/vinhtran/Documents/project/personal/teacher-os

In scope:
- `apps/server/src/lib/bank-hub/bank-hub-client.ts`, `bank-hub-types.ts` và `bank-hub-client.test.ts`.
- `apps/server/src/routes/bank-link.ts` và `apps/server/src/bank-link.test.ts`.

Out of scope:
- Schema DB / migration (bảng `org_bank_link` đã đúng, migration 0034 đã áp ở local).
- Luồng webhook/IPN (`bank-hub-webhooks.ts`) trừ khi cùng giả định envelope sai.

Constraints:
- Giao tiếp bằng tiếng Việt; commit message và identifier bằng tiếng Anh, theo conventional commits (theo `AGENTS.md`).
- Không đưa mã plan/phase/finding vào comment code, tên test hay commit (quy tắc review-audit).
- Gate verification là chạy local (`pnpm check`, `pnpm check-types`, `pnpm --filter server test`); CI chỉ chạy cho PR vào `main`.

Safety boundaries:
- Không đọc/in `.env` hay secret `SEPAY_BANKHUB_*`; không log giá trị `link_token` hay dữ liệu tài khoản.
- Không kill tiến trình `alchemy dev` mà không chắc là của mình: đang có hai tiến trình `alchemy dev` (PID 71615, 73056) chạy song song, một trong hai có thể là bản thừa.
- Không gọi API SePay production. Chỉ sandbox (`https://bankhub-api-sandbox.sepay.vn`).

## Current state
Branch: develop
HEAD: cc35bb1 (đầu session là f65e4f7; đã có commit mới từ phiên khác)
Working tree: dirty
Changed files:
- `.claude/agent-memory/code-reviewer/MEMORY.md` (không thuộc task này)
- `apps/server/src/lib/bank-hub/bank-hub-client.ts` (thay đổi chẩn đoán của task này)

Untracked files:
- `.claude/agent-memory/code-reviewer/project_local-lint-gate.md` (không thuộc task này)
- `plans/261007-0832-essay-highlight-annotations/` (không thuộc task này)
- `plans/journals/2026-10-07-plan-highlight-v-ghi-ch-trn-essay-writing-khi-chm.md` (không thuộc task này)
- `plans/handoffs/` (file handoff này)

Intentional local modifications: yes — chỉ `bank-hub-client.ts` (phần chẩn đoán trong hàm `request()`, khi parse thất bại). Các file khác là của việc khác, không đụng.

Dev stack local đang chạy ở port 8000/8001/8003 (workerd), có HMR; D1 local ở `packages/infra/.alchemy/local/d1/`.

## Decisions and rationale
- Nguyên nhân gốc: SePay sandbox trả body phẳng `{xid, hosted_link_url, link_token, expires_at}` cho `POST /v1/link-token/create`, còn code parse theo envelope `{code, data: {...}}` — Rationale: log thật cho `data: invalid_type; keys=xid,hosted_link_url,link_token,expires_at` — Alternative rejected: thiếu migration (bảng và migration 0034 có ở D1 local), thiếu cấu hình (sẽ ra 503), credential hỏng (`createCompany` thành công ngày 06/10), origin sai (nhánh đó trả 502) — Reference: `bank-hub-client.ts` (`linkTokenEnvelope` và đọc `raw.data.hosted_link_url`), `bank-hub-types.ts:35`.
- Vì sao test không bắt được: fixture `bank-hub-client.test.ts` quanh dòng 342 tự dựng body có `data`.
- Vì sao thành 500: route `/link-token` không bắt `BankHubError` và server không có `app.onError`; đã được ghi nhận là H3 trong `plans/reports/code-reviewer-261006-1714-release-0015-pre-landing.md`.
- Shape giữa các endpoint của SePay không đồng nhất (`company/create` dùng envelope `data` và đã chạy được; `/v1/token` và `link-token/create` phẳng). Không được suy từ endpoint này sang endpoint khác.
- Người dùng chọn "chỉ tạo file handoff" thay vì sửa ngay trong session này.

## Work performed
- Đọc `routes/bank-link.ts`, `bank-hub-client.ts`, `bank-link-service.ts`, `bank-hub-types.ts`, `bank-hub-origins.ts`, `contracts.ts` (phần bank-link).
- Truy vấn read-only D1 local: bảng `org_bank_link` tồn tại; org `d454b7d9…` có `company_xid`, chưa có `bank_account_xid`, status `none`.
- Sửa `bank-hub-client.ts` trong `request()`: thông báo lỗi malformed nay kèm `issues` (path: code) và `keys` (tên khoá cấp cao nhất của JSON). Không log giá trị.
- Chạy `pnpm exec vitest run src/lib/bank-hub/bank-hub-client.test.ts` trong `apps/server`: 15/15 qua (hai lần).
- Bị hook chặn khi đọc `.env`; người dùng chọn dán log thay vì cấp quyền.
- 0 redactions applied.

## Verification
| Check | Command | Outcome | When |
| --- | --- | --- | --- |
| Test client Bank Hub | `cd apps/server && pnpm exec vitest run src/lib/bank-hub/bank-hub-client.test.ts` | 15 passed | sau thay đổi chẩn đoán, 08:38 |
| Tái hiện lỗi thật | bấm nút liên kết trên web local | log `malformed (data: invalid_type; keys=xid,hosted_link_url,link_token,expires_at)` | 08:40 |

Not run:
- `pnpm check`, `pnpm check-types`, `pnpm --filter server test` toàn bộ: chưa có thay đổi logic để kiểm.
- `apps/server/src/bank-link.test.ts`: chưa chạy.
- Xác nhận với sandbox thật sau khi sửa: chưa sửa.
- Fetch tài liệu SePay: chưa thực hiện.

## Open risks and blockers
- Type: risk. Owner: unknown. Impact: các endpoint `bank-account`, `bank-account/{xid}`, `transaction`, `company/edit` đang giả định envelope `data` mà chưa từng kiểm với sandbox; có thể lỗi tương tự ngay sau khi bước link-token qua.
- Type: question. Owner: người dùng. Impact: tài liệu SePay (https://developer.sepay.vn/vi/bankhub/tong-quan) có thể ghi shape khác với thực tế sandbox; nếu lệch, ưu tiên shape thật từ log và ghi chú chênh lệch.
- Type: risk. Owner: unknown. Impact: fake Bank Hub của E2E (nếu tồn tại ngoài repo hoặc trong `apps/e2e`) có thể cũng bọc `data`; grep `hosted_link_url` không thấy ngoài test client, cần xác nhận trong `apps/e2e`.
- Type: risk. Owner: người dùng. Impact: hai tiến trình `alchemy dev` song song có thể gây nhầm log hoặc xung đột cổng.
- Type: risk. Owner: unknown. Impact: `expires_at` của response thật chưa biết định dạng (chỉ biết là có khoá); schema hiện yêu cầu string.

## Exact next actions
1. **First safe step** — đọc tài liệu SePay Bank Hub (https://developer.sepay.vn/vi/bankhub/tong-quan, đi tới phần Link Token / các API), ghi lại shape response của `link-token/create` và các endpoint khác; so với `bank-hub-types.ts`.
2. Mục 1: trong `bank-hub-client.ts` bỏ `linkTokenEnvelope` cho `createLinkToken`, parse thẳng `bankHubLinkTokenRawSchema` và map `raw.xid`, `raw.hosted_link_url`, `raw.link_token`, `raw.expires_at`; sửa fixture trong `bank-hub-client.test.ts` thành body phẳng.
3. Mục 2: trong `routes/bank-link.ts`, bắt `BankHubError` ở `/link-token`, `/sync`, `/reconcile` (cân nhắc helper dùng chung, không lặp): 429 kèm header `Retry-After` và `code: "BANKHUB_RATE_LIMITED"`, các lỗi khác trả 502 với `code` rõ ràng (thêm hằng vào `BANK_LINK_ERROR_CODES` trong `packages/api/src/contracts.ts` nếu cần); không để lộ message thô của SePay cho client; vẫn `console.error` ở server.
4. Thêm test route cho nhánh `BankHubError` trong `apps/server/src/bank-link.test.ts`.
5. Giữ (hoặc đơn giản hoá) phần chẩn đoán đã thêm trong `request()`; không log giá trị.
6. Chạy `cd apps/server && pnpm exec vitest run src/lib/bank-hub src/bank-link.test.ts`, rồi `pnpm check` và `pnpm check-types` ở root.
7. Bấm lại nút liên kết trên web local, xem log; xử lý tiếp nếu `GET /v1/bank-account` hay endpoint khác lỗi shape.
8. Báo cáo kết quả cho người dùng bằng tiếng Việt; chỉ commit khi được yêu cầu.

## Source pointers
- `apps/server/src/routes/bank-link.ts` (route `/link-token` quanh dòng 116–207)
- `apps/server/src/lib/bank-hub/bank-hub-client.ts` (`request()`, `createLinkToken`, `linkTokenEnvelope`)
- `apps/server/src/lib/bank-hub/bank-hub-types.ts` (`bankHubEnvelope`, `bankHubLinkTokenRawSchema`)
- `apps/server/src/lib/bank-hub/bank-hub-client.test.ts` (fixture `link-token/create` quanh dòng 342)
- `apps/server/src/bank-link.test.ts`
- `packages/api/src/contracts.ts` (`BANK_LINK_ERROR_CODES`, `bankLinkTokenResponseSchema`)
- `plans/261005-0754-sepay-bank-hub-tuition-qr/research/bank-hub-research.md`
- `plans/reports/code-reviewer-261006-1714-release-0015-pre-landing.md` (mục H3)
- `docs/production-release-runbook.md` (mục SePay Bank Hub go-live)
- https://developer.sepay.vn/vi/bankhub/tong-quan (người dùng cung cấp; chưa fetch)
