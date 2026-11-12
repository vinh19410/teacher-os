# Gaps, OQ, Conflict, Inferred — feature credits

## 1. Open Questions (OQ)

| OQ | Nội dung | Vì sao code không trả lời được | Negative-search đã làm |
|---|---|---|---|
| OQ-1 | Luồng ghi `plan_kind`/`plan_status` (mua gói tháng/kích hoạt trial) nằm đâu? | Chỉ có reader `readOrgPlan` và default "none"; không writer | 🟡 grep `planKind|plan_kind|planStatus|plan_status|grace_period` toàn apps/server + packages/db (non-test): chỉ schema (packages/db/src/schema/credit-wallet.ts:25-27), reader (apps/server/src/lib/credits/wallet.ts:129-146), check (apps/server/src/lib/ai-grading/run-grading.ts:406-414). Migration 0055 chỉ ALTER thêm cột. "monthly" không xuất hiện ở bất kỳ UPDATE/INSERT nào ngoài test |
| OQ-2 | Thông số trần Credit cá nhân (US-010/TOS-49): ngưỡng, vai, hành vi? | Hook `assertStaffCap` là thân hàm rỗng | — (thân hàm rỗng tại apps/server/src/lib/credits/wallet.ts:352-355; test khẳng định no-op apps/server/src/lib/credits/wallet.test.ts:248-250) |
| OQ-3 | Kênh nạp Credit thật (gói 100 Credit 149.000đ / Top-up) — ngoài app hay chưa xây? | Mọi wording đều hướng user đi nạp nhưng không có route/API | 🟡 grep `topUpHref` apps/web: chỉ prop mặc định undefined của AiDraftPanel (apps/web/src/components/grading/ai-draft-panel.tsx:109, 119-120), không call-site production truyền giá trị (duy nhất test apps/web/src/components/grading/ai-draft-panel.test.tsx:156); grep `credit` apps/web/src trả 7 file (6 hiển thị + import.test.tsx), không có trang wallet/quản trị ví |
| OQ-4 | Căn cứ nghiệp vụ của 30 Credit dùng thử và 30 lượt Chấm nhanh/tháng | Chỉ là hằng số | — |
| OQ-5 | Ai tiêu dùng báo cáo theo `action_type`? | Chỉ writer, chưa có API đọc tổng hợp | 🟡 grep `actionType|action_type` non-test: chỉ wallet service, sweeps, schema, test |
| OQ-6 | SLA/UX mong muốn khi Credit đang "tạm giữ" (hiển thị held cho user?) | `held` chỉ hiện trong GET ví, UI chỉ hiển thị `balance` | 🟡 apps/web/src/components/exam-import/credit-cost-badge.tsx:19-28 chỉ render `wallet.balance` |
| OQ-7 | KPI/metric của feature ví | Không có instrumentation | 🟡 grep `metric|counter|analytics` trong 2 file lib/credits + routes/credits: không có |
| OQ-8 | Monitoring cho sweep (hiện chỉ console.error rải rác ở pipeline) | Sweep im lặng khi nuốt InsufficientCreditsError (cố ý) | — |
| OQ-9 | Ứng xử khi dữ liệu ví vi phạm bất biến (held > balance do can thiệp tay): GET sẽ 500 vì Zod `min(0)` fail | Không có nhánh tự vệ trong route | apps/server/src/routes/credits.ts:38-44 parse trực tiếp |
| OQ-10 | Wording E-001 nói "Credit AI trong kỳ" + "nâng cấp gói tháng" dù chưa có luồng gói tháng — có chủ ý không? | Wording cố định trong hằng | — |
| OQ-11 | Priority/Severity của từng FR/NFR | Code không mang thông tin này | — |
| OQ-12 | `planKind = "trial"` hợp lệ khi đọc nhưng không ai đặt — có phải phase tương lai? | Như OQ-1 | — |

## 2. Gaps (khoảng trống đặc tả so với code)

- GAP-1 (dead-path, R3): Nhánh "Chấm nhanh Writing" (BR-07/FR-16) và `readOrgPlan` phụ thuộc dữ liệu `plan_kind` không bao giờ được ghi ngoài test → trong runtime thật, mọi org có `plan_kind = "none"` nên luồng hạ cấp không bao giờ chạy; hệ quả: khi hết Credit, bài Writing chỉ nhận E-001 (không bao giờ E-002 qua claim). Pattern tìm: `planKind`/`plan_kind` writer — scope: apps/server/src, packages/db/src, apps/web/src, packages/api/src (kèm test). Kết quả: KHÔNG thấy writer sau khi tìm; test tự UPDATE trực tiếp (apps/server/src/lib/ai-grading/run-grading.test.ts, apps/server/src/lib/credits/wallet.test.ts:390-393). Level: 🔵 cho "không có writer" (2 điểm data: schema default + absence), 🟡 cho "cố ý hay còn thiếu".
- GAP-2: `assertStaffCap` no-op — trần cá nhân chưa cài (apps/server/src/lib/credits/wallet.ts:347-355). Negative-search: grep `assertStaffCap` non-test → 1 định nghĩa + 2 call-site (apps/server/src/routes/exam-imports.ts:278, 524).
- GAP-3: Không có màn hình/API quản trị ví (điều số dư, lịch sử) — negative-search grep `credit` apps/web/src: chỉ badge/dialog/panel/import page; GET duy nhất là /api/credits/wallet (không có GET lịch sử sổ cái).
- GAP-4: `available` hiển thị ở badge là `balance` (không trừ held) — apps/web/src/components/exam-import/credit-cost-badge.tsx:19-28; nếu user có held, badge có thể nói sai "khả dụng". Level 🟡 (Inferred gap UI) → xem OQ-6.
- GAP-5: E-002 chỉ đạt được qua đường Chấm nhanh bị chặn (claim false) — vì GAP-1, người dùng thực tế chỉ gặp E-001.
- GAP-6: Không có i18n catalog — wording hard-code tiếng Việt trong contracts (NFR-08). Repo không có thư viện i18n (negative-search `grep -rn "i18next|lingui" apps/web/package.json apps/web/src` → không kết quả).
- GAP-7 (name collision, đã loại): "credit" trong bank-hub (`transferType !== "credit"`, apps/server/src/lib/payments/ingest-transaction.ts:58) là loại giao dịch ngân hàng, KHÔNG liên quan Ví Credit; các test bank-hub-* không chạm credit_wallet/credit_usage_log (negative-search grep trong 5 file bank-hub test → 0 kết quả).
- GAP-8: `creditWalletSchema` yêu cầu `available ≥ 0` nhưng route chỉ kẹp `Math.max(0, ...)` ở nhánh 402 của exam-imports; GET ví lấy hiệu thô `balance − held` (apps/server/src/routes/credits.ts:42) — lệch dữ liệu tay sẽ 500. (đã liệt kê OQ-9)

## 3. Conflicts (mâu thuẫn nội bộ source)

- CONFLICT-1 (nhẹ, wording comment): apps/server/src/routes/credits.ts:15 nói ví "tạo lười lần đầu xem" trong khi apps/server/src/lib/credits/wallet.ts:84 nói "tạo lười ... lần đầu tiêu Credit". Thực tế `ensureWallet` được gọi ở CẢ hai chỗ (xem + trước reserve) nên hành vi thống nhất; chỉ câu chữ comment lệch. Không ảnh hưởng rule — ghi nhận để khỏi ngộ nhận.
- Không tìm thấy conflict logic khác giữa schema/migration/service/route (đối chiếu: cột và default khớp migration 0051/0055; guard khớp comment dấu delta).

## 4. Inferred (🟡 suy ra, không phải code nói)

- INF-1: "Mục tiêu sản phẩm của ví là đo/hạn chế chi phí AI theo tổ chức và bán gói" — suy từ wording lỗi (mua gói 100 Credit 149.000đ) và định hướng TOS-42/TOS-43 trong comment; không có tài liệu trong repo xác nhận.
- INF-2: "Held hiển thị cho teacher dưới dạng '(Tạm giữ)' ở badge giá dịch vụ" — badge nói giá sẽ tạm giữ, không phải hiển thị tổng held của org.
- INF-3: Actor "Chủ trung tâm" là người chịu trách nhiệm nạp Credit (từ hộp thoại hướng dẫn) — mô hình phân quyền kinh doanh không được code xác nhận.
- INF-4: Chọn 150s/60s làm ngưỡng stale là "timeout + biên an toàn" (comment kỹ thuật), không phải cam kết SLA.
- INF-5: Priority P0 của tính năng "không kẹt Credit" được thể hiện qua mật độ test (wallet 19 test, sweep 2 bộ test, e2e 2 spec) nhưng mức ưu tiên thật cần chủ sản phẩm xác nhận.
