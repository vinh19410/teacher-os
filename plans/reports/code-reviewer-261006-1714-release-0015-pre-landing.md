# Review trước khi land: release 0.0.15 (develop → main)

## Phạm vi

- Diff: `git diff origin/main...HEAD` (HEAD = `32ed6bc`), bỏ `plans/**`, `*.png`.
- 157 file, +13.7k / -1.6k LOC (không tính drizzle snapshot json).
- PR gộp: #315, #318, #319 (chấm bài), #320/#327 (SePay Bank Hub), #321/#324 (gỡ /settings), #325, #326/#328.
- Gate chạy local: `pnpm --filter server test` → 41 file / 599 test PASS. `biome check apps packages` → 0 lỗi (5 info). `biome check .` ở root lỗi vì các `biome.json` lồng trong `.claude/worktrees/*`. Đây là artefact của máy local, không phải lỗi của diff.
- Working tree đang có thay đổi chưa commit (CHANGELOG, runbook, package.json 0.0.15). Runbook chưa commit đã mô tả việc CI thiếu env SePay (xem H5).

## Đánh giá tổng quan

Không có blocker Pass 1 cho việc land. Lý do: Bank Hub ship ở trạng thái tắt. `deploy.yml` không truyền `SEPAY_BANKHUB_*`, nên `getBankHub()` trả `undefined` và mọi route ngân hàng/IPN trả 503. Migration 0033/0034 chỉ additive. IPN auth, idempotency của ledger và scope org trên các endpoint mới đều đúng.

Trước khi **bật** SePay ở production, có 4 lỗi High phải sửa (H1–H4). Hai trong số đó là lỗi chức năng/tài chính đã xác nhận từ code.

## Pass 1 — CRITICAL (các hạng mục đã kiểm)

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Xác thực IPN `/webhooks/sepay/bankhub/ipn` | OK | `bank-hub-webhooks.ts:62-68`: `Authorization: Apikey`, so sánh `timingSafeEqual` (`safe-equal.ts`). Thiếu config thì 503 trước khi so khoá. |
| Xác thực webhook `/events` | OK | `bank-hub-webhooks.ts:33-36`: `X-Secret-Key` so sánh constant-time. Body giới hạn 64 KB. |
| Idempotency khi ghi nhận giao dịch | OK, cần lưu ý một giả định (H6) | `UNIQUE(provider, provider_txn_id)` + `onConflictDoNothing` + `paid_amount` tính lại từ ledger (không `+=`) trong cùng một `db.batch`. |
| Ghi có trùng do IPN đồng thời | OK | Batch D1 chạy tuần tự. CASE `invoice_paid` được tính trong chính câu INSERT. |
| Ghi có trùng do teacher assign đồng thời | **LỖI** | H2 |
| `/public/pay/<token>` | Chấp nhận được | Token 128-bit, 404 chung, `no-store`, bỏ `note`/`due`, log được redact (`log-redaction.ts`). Có lộ tên học viên, tên org, STK đầy đủ và tên chủ TK: đây là chủ đích thiết kế để chuyển khoản. Có route xoay token. |
| IDOR cross-org | OK | `payment-transactions.ts` (org predicate ở read, update ignore và target invoice); `bank-link.ts` (kernelCtx); `grading.ts:113-139` (mọi join có `orgId`); `student.ts` `/invoices*` (orgId + studentId); `kernel.ts` rotate-pay-token / payment (orgId). |
| Injection | OK | Mọi SQL dùng tham số drizzle. `emitBackfillSql` dùng `sqlString` và status nằm trong whitelist (`backfill-dump.ts:22-41`). |
| Migration D1 | OK | 0033: thêm 3 cột nullable hoặc có DEFAULT. 0034: 2 bảng mới, `invoice` thêm 2 cột nullable + `paid_amount DEFAULT 0 NOT NULL`. Unique index trên cột toàn NULL không xung đột. `/readyz` tự suy ra bảng/index từ schema nên đã phủ 0034. Alchemy chạy migration trước Worker (D1 resource là dependency). |
| Config deploy | **Thiếu** | H5 |

## High (sửa trước khi bật SePay ở prod)

### H1. Không huỷ liên kết ngân hàng được: modal tự đóng ngay khi mở. Đã xác nhận, độ tin cậy cao

- `apps/web/src/components/modals/bank-hub-link-modal.tsx:129-132`: `if (open && status?.status === "linked") void finish();`
- `apps/web/src/components/payments/bank-link-panel.tsx:42-66`: nút "Huỷ liên kết" chỉ hiện khi `status === "linked"`, và mở modal với `purpose="unlink"`.
- Kịch bản lỗi: query `["bank-link"]` dùng chung cache nên đã là `linked`. Effect chạy ngay khi mở modal, gọi `syncBankLink` rồi `onClose(true)`. Iframe hosted-link không bao giờ được dùng, đồng thời một link-token UNLINK vẫn bị tạo vô ích. Giáo viên không thể tự huỷ liên kết trong UI. Không có test nào phủ luồng unlink (grep `unlink` trong `apps/e2e/specs` và `apps/web/src` không có kết quả ngoài 2 file trên).
- Cách sửa: chỉ auto-finish khi `purpose !== "unlink"` và status *chuyển* sang `linked` (ghi lại status lúc mở modal). Với `unlink`, đóng khi status rời `linked`. Thêm test component cho cả 3 purpose.

### H2. Assign giao dịch có race TOCTOU, có thể ghi có hai hoá đơn bằng một khoản tiền. Đã xác nhận, độ tin cậy cao; xác suất thấp

- `apps/server/src/routes/payment-transactions.ts:83-126`: kiểm `matchStatus === "unmatched"` bằng một SELECT riêng, sau đó UPDATE `.where(eq(paymentTransaction.id, tx.id))` **không** có predicate `match_status = 'unmatched'`.
- Kịch bản: hai tab (hoặc double-submit) cùng assign tx X, một sang hoá đơn A, một sang B. Cả hai đọc thấy `unmatched`. Batch 1 gán X→A và recompute A (A có thể chuyển `paid`). Batch 2 gán X→B và chỉ recompute B. A vẫn giữ `paid_amount` cũ đã cộng X, và `status='paid'` không bao giờ quay lại (`recompute-invoice.ts:26-29`). Kết quả: cùng một khoản tiền được ghi có hai lần. Race tương tự cũng cho phép assign ghi đè một giao dịch vừa bị `ignore`.
- Cách sửa: thêm `eq(paymentTransaction.matchStatus, "unmatched")` và `eq(orgId)` vào UPDATE, rồi recompute **cả hoá đơn cũ (nếu có) và hoá đơn mới**. Hoặc dùng `.returning()` và trả 409 khi không có dòng nào được cập nhật (bỏ recompute khỏi batch hoặc giữ lại vì recompute idempotent).

### H3. `/events` và `link-token` để exception lọt ra thành 500; ensureCompany có thể khoá vĩnh viễn một org. Độ tin cậy cao (một phần PLAUSIBLE)

- `apps/server/src/routes/bank-hub-webhooks.ts:51`: `applyAccountEvent` gọi `hub.client.getBankAccount` (`bank-link-service.ts:171`) mà không có try/catch, và app không có `onError`. Bank Hub API lỗi hoặc 429 thì handler trả 500. SePay không retry 5xx, nên event `BANK_ACCOUNT_INACTIVED` mất hẳn. QR tiếp tục trỏ vào tài khoản đã bị vô hiệu, vì web không gọi đường bù `GET /bank-link?refresh=1` ở đâu cả. Comment "always-ack handler" ở `bank-link-service.ts:153` không đúng với code.
- `apps/server/src/routes/bank-link.ts:161-170`: nhánh `COMPANY_SETTLING` là dead code, vì `ensureCompany` không bao giờ trả row thiếu `companyXid`, nó sẽ throw `BankHubError(409)`. Lỗi này không được catch nên client nhận 500, và client mất luôn copy "Hệ thống đang thiết lập".
- `bank-link-service.ts:54-77` (PLAUSIBLE, tuỳ ngữ nghĩa duplicate `full_name` phía SePay): nếu `createCompany` thành công nhưng UPDATE D1 sau đó lỗi (lỗi D1 tạm thời, Worker bị kill), mọi lần thử lại đều gặp 400 duplicate, đọc lại row vẫn không có xid, rồi lại 409/500. Bank Hub không có API list company, nên org đó **vĩnh viễn** không liên kết được nếu operator không can thiệp tay. Docstring gọi đây là "one-click retry", nhưng thực tế là khoá cứng.
- Cách sửa: bọc `applyAccountEvent` trong try/catch, log và ack 200 (giống IPN). Map `BankHubError` ở route bank-link sang mã lỗi có cấu trúc. Lưu `company.xid` ngay (hoặc dùng `full_name` có thể tra lại được qua `getCompany`), và ghi runbook thủ tục khôi phục.

### H4. Đối soát với `past_bank_account_xids`: N+1 gọi Bank Hub API, mỗi giao dịch một lần. Đường đi code đã xác nhận; ảnh hưởng PLAUSIBLE

- `apps/server/src/routes/bank-link.ts:267-290` kết hợp `apps/server/src/lib/payments/ingest-transaction.ts:69-87`: org được resolve bằng `org_bank_link.bank_account_xid = ?`, tức chỉ xid **hiện tại**. Mọi giao dịch của xid cũ đều rơi vào `hub.client.getBankAccount()` (một fetch ra ngoài cho mỗi giao dịch), cộng 2 SELECT và 1 batch D1.
- Kịch bản: sau khi liên kết lại tài khoản, đối soát quét tới 5 trang × 100 giao dịch cho mỗi xid cũ, tức tối đa khoảng 500 lần gọi API cộng 1.500 truy vấn D1 trong một request. Có thể chạm giới hạn subrequest của Worker hoặc rate limit SePay (429 giữa chừng). Khi đó `lastReconciledAt` không được cập nhật (cooldown không áp dụng), và kết quả dở dang.
- Cách sửa: trong vòng đối soát, truyền sẵn `orgId` (đã biết từ `ctx.orgId`, vì xid lấy từ chính row của org) vào `ingestTransaction`. Hoặc resolve org theo `past_bank_account_xids` trong SQL. Chỉ fallback sang API cho đường IPN.

### H5. Thiếu config deploy: CI không truyền `SEPAY_BANKHUB_*`. Đã xác nhận

- `.github/workflows/deploy.yml:74-83` (và `deploy-staging.yml:92-97`) không có 4 secret và `SEPAY_BANKHUB_BASE_URL`. `packages/infra/alchemy.run.ts:132-152` dùng `withDefault("")`. Hệ quả là mọi lần deploy từ CI đều tắt tính năng. Giá trị đặt tay trên dashboard Cloudflare hoặc qua deploy local cũng **bị ghi đè** ở lần merge vào main kế tiếp. Base URL mặc định là sandbox.
- Mức độ: không chặn release này (cơ chế fail-safe là 503), nhưng chặn go-live. Runbook chưa commit đã mô tả gap này. Cần commit runbook, và trước khi bật thì mở rộng `env:` ở cả hai workflow (`secrets.*` cho 4 khoá, `vars.SEPAY_BANKHUB_BASE_URL`).
- Lưu ý thêm (PLAUSIBLE): binding dùng `Config.string` (plain-text binding, cùng pattern với `RESEND_API_KEY`), nên secret hiện rõ trong dashboard Worker.

### H6. Giả định `transaction_id` của IPN trùng với `transaction_id` của API list chưa được kiểm chứng. PLAUSIBLE, ảnh hưởng ghi có trùng

- Idempotency dựa hoàn toàn vào `(provider, provider_txn_id)`. IPN (`bank-hub-webhooks.ts:88`) và đối soát (`ingest-transaction.ts:154`) đều dùng `transaction_id` của nguồn tương ứng. Nếu SePay dùng hai định dạng ID khác nhau (ví dụ id số trong IPN và xid trong API), đối soát sẽ chèn dòng thứ hai, recompute cộng cả hai, và `paid_amount` bị nhân đôi.
- Checklist sandbox trong runbook (mục 4) chưa có bước kiểm này. Cần thêm: "IPN `transaction_id` === `GET /v1/transaction` `transaction_id` cho cùng một giao dịch".
- Liên quan (PLAUSIBLE, Medium): `bankHubIpnSchema.transaction_id` là `z.string()` (`bank-hub-types.ts:97`). Nếu SePay gửi JSON number thì handler trả 400, IPN mất hẳn với **mọi** giao dịch, và đối soát cũng fail (`bankHubTransactionRawSchema` tương tự, `:54`). Cân nhắc `z.union([z.string(), z.number()]).transform(String)`.

## Medium

- **M1. Đối soát kéo cả giao dịch cá nhân của giáo viên vào DB.** `bank-link.ts:283` dùng `saveNoCode: true`, nên mọi khoản credit không có mã trong 7 ngày (lương, chuyển khoản gia đình) đều được lưu `payment_transaction` với `raw` JSON đầy đủ. Điều này mâu thuẫn với chủ đích trong research ("giao dịch cá nhân của giáo viên không bao giờ tới server", nhờ whitelist "TOS"), và mở rộng phạm vi lưu PII. Nên cân nhắc chỉ lưu giao dịch có mã, hoặc không lưu `raw` cho `no_code`.
- **M2. Liên kết lại sau khi huỷ phụ thuộc hoàn toàn vào postMessage** (PLAUSIBLE). `applyAccountEvent` bỏ qua event LINKED của xid mới khi row còn giữ xid cũ (`bank-link-service.ts:180`). Modal chỉ poll `GET /bank-link` không kèm `refresh=1`, nên chỉ `FINISHED_*` mới kích hoạt `/sync`. Runbook tự thừa nhận việc sandbox có phát `FINISHED_*` hay không còn chưa chắc.
- **M3. Mốc thời gian của `last_event_at`** (PLAUSIBLE): `syncFromBankHub` ghi epoch **giây** (`bank-link-service.ts:107-108`). Đơn vị của `event.timestamp` từ SePay chưa được xác minh. Nếu là ms thì mọi event cũ đều thắng sync, và bộ chống replay vô hiệu.
- **M4. `payment_code` từ IPN được test bằng regex nhưng lưu nguyên chuỗi** (`ingest-transaction.ts:61-64`). `PAYMENT_CODE_RE.test()` khớp được cả chuỗi con, nhưng code lại lấy `input.paymentCode.toUpperCase()` toàn bộ. Nếu SePay điền ví dụ `"SEVQR TOSxxxxxxxx"`, giao dịch thành `unknown_code` thay vì khớp. Nên dùng `extractPaymentCode(input.paymentCode)`.
- **M5. Trang `/pay/$token`** (`apps/web/src/routes/pay.$token.tsx`):
  - `:54` hard-code `payable: true`, nên vẫn poll D1 mỗi 5 giây trong 15 phút kể cả khi phiếu đã thu xong (link chia sẻ rộng).
  - `:47-49`: một lỗi mạng thoáng qua là thay cả QR bằng "Link … đã bị thu hồi".
  - `:88-110`: hết thời hạn poll thì không có state nào đổi, không re-render, nên nút "Làm mới" gần như không bao giờ hiện.

## Low / Pass 2 — INFORMATIONAL

- Dead code:
  - `packages/api/src/lib/message-template.ts` (`fillMessageTemplate`) chỉ test dùng; docstring nhắc "settings store" đã gỡ ở #324.
  - Nhánh `COMPANY_SETTLING` (H3).
  - `GET /bank-link?refresh=1` (`bank-link.ts:110`): web không gọi.
  - `?status=unmatched` (`apps/web/src/lib/repos/payments.ts:64`): server bỏ qua.
- Tàn dư /settings:
  - `bank-link-panel.tsx:14` vẫn ghi "Cài đặt → Nhận học phí".
  - Runbook đặt tiêu đề "SePay Bank Hub go-live (migration 0033)" ở `docs/production-release-runbook.md:728` và `:771`, trong khi SePay là **0034** (0033 là chấm bài). Danh sách migration additive chưa có mục 0034.
  - Bảng `workspace_settings` giữ tombstone, có comment rõ ràng. Test 404 cho `/api/kernel/settings` có mặt.
- `bank-hub-client.ts`: fetch không có timeout. Một request treo tới Bank Hub sẽ giữ IPN/Worker tới giới hạn wall-time.
- `createBankHubContext` (`bank-hub-client.ts:429`) xác định `env` bằng so sánh chuỗi chính xác. Base URL có `/` cuối sẽ bị coi là "sandbox", và `isAllowedBankHubLinkOrigin` khi đó chấp nhận origin `http://localhost:` ở prod. Rủi ro thực tế rất thấp.
- Cooldown đối soát (`bank-link.ts:236`) là check-then-act và chỉ cập nhật khi thành công. Hai request song song đều được chạy. Số `matched/unmatched` trả về đếm cả dòng trùng đã có sẵn (insert no-op), nên dễ gây hiểu nhầm.
- Không có undo cho `ignore` và không có unassign. Trạng thái `paid` là một chiều, nên assign nhầm không sửa được qua UI.
- `ensurePaymentRefs` (`payment-instructions.ts:49-51`) nuốt mọi lỗi, không chỉ lỗi trùng mã unique. Nếu cả 3 lần đều lỗi, QR được dựng với memo rỗng (`:96-99`), nên tiền chuyển vào sẽ thành `no_code`. Nên trả lỗi khi `paymentCode` vẫn null.
- Hằng số magic: 7 ngày, 5 trang × 100, cooldown 60 giây, limit 50 (không phân trang hàng chờ), 15 phút poll. Đều có comment. Riêng limit 50 không có phân trang nên các dòng cũ hơn bị ẩn.
- Diff có xoá `.zcode/agent-memory/**`: là nhiễu tooling, vô hại.
- Phần #319, #325, #326/#328: chấm bài có org predicate trên mọi join, ghi CAS theo `status='submitted'`, media dùng chung `mediaObjectResponse` (nosniff + CSP sandbox). Guard check-in buổi tương lai kiểm cả ở pre-read lẫn trong WHERE (`kernel.ts:1057-1080`), và đường occurrence (`:1318`) cũng có. Backfill guard theo `status` và whitelist. Không thấy lỗi.

## Thiếu test

- Luồng unlink/reactivate của `BankHubLinkModal` (H1).
- Assign đồng thời, và assign đè lên giao dịch đã `ignored` (H2).
- `/events` khi `getBankAccount` throw. `ensureCompany` khi UPDATE lỗi sau `createCompany` (H3).
- Đối soát với xid cũ: đếm số lần gọi API (H4).
- IPN với `transaction_id` kiểu số, và `payment_code` có tiền tố (H6, M4).

## Đề xuất hành động (theo thứ tự)

1. Land release: được, với điều kiện SePay giữ trạng thái tắt. Commit phần runbook đang sửa, và sửa nhãn 0033→0034.
2. Trước khi bật SePay: sửa H1, H2, H3, H4. Thêm `SEPAY_BANKHUB_*` vào cả hai workflow (H5). Thêm bước kiểm `transaction_id` và đơn vị `timestamp` vào sandbox gate (H6, M3).
3. Sau đó xử lý M1 (phạm vi PII khi đối soát), M4, M5, và dọn dead code.

## Câu hỏi chưa giải quyết

- SePay có từ chối `full_name` trùng khi `createCompany` không? (quyết định mức độ của H3)
- `transaction_id` có giống nhau giữa IPN và `GET /v1/transaction` không? Kiểu dữ liệu là string hay number?
- Đơn vị của `timestamp` trong webhook lifecycle: giây hay ms?
- Có chủ đích lưu cả giao dịch không có mã của tài khoản cá nhân giáo viên khi đối soát không?
