# Test Report — 2026-09-14 — QC re-test #115 (student package min validation)

**Scope:** UI re-test cho issue #115 «[QC][P1] Số buổi 0 / giá âm lọt client, server chỉ lỗi chung» sau khi PR #143 merge vào develop.
**Môi trường live:** beta/staging `https://app.staging.teacheros.io.vn` — Deploy Staging **success trên chính commit fix `92a7153`** (2026-08-31 04:47Z, chạy cùng CI + E2E cùng lúc đều success).
**Tài khoản test:** không có password cho `usertest1@mail.com` (như retest #104/#121) — dùng throwaway signup trên cùng môi trường: `qc115-retest-1789369735@test.local`, `qc115-enroll-1789372318556@test.local`, `qc115-shot-…@test.local`.
**Fix under test:** `packages/api/src/contracts.ts` `total: min(1)` + client `parsePackageField` (`Number()` + `Number.isInteger`, thay `parseInt || 10 / || 400000`) trong `add-student-modal.tsx`.

## Test Results Overview

| Nhóm | Kết quả |
|------|---------|
| Live UI retest (staging, 6 case) | **6/6 PASS** — 0 bug mới liên quan #115 |
| AC client-side của #115 (trên staging) | Đủ bằng chứng PASS |
| AC API-side (total=0 → 400, defaults pin) | Đã được kernel tests + e2e CI cover, **xanh trên chính commit `92a7153`** (workflow E2E + CI + Deploy Staging cùng commit đều success) — không tái chạy ở tầng này theo nguyên tắc lowest reliable layer |

**Screenshots:** `plans/reports/screenshots-2026-09-14-issue-115/` — `tc1-repro-0-sessions-negative-price.png`, `tc6-enroll-zero-sessions-blocked.png` (TC2–TC4 dùng accessibility-snapshot text evidence — xem ghi chú tooling).

## Kết quả từng case (đúng steps trong issue + AC)

| TC | Case | Kết quả | Bằng chứng |
|----|------|---------|-----------|
| TC1 | **Repro gốc:** tên + SĐT hợp lệ, buổi `0`, giá `-500` → Lưu | ✅ PASS | Lỗi field **"Số buổi gói phải là số nguyên từ 1 trở lên."** + **"Đơn giá không được âm."** ngay dưới từng field; modal vẫn mở; banner chung "Không lưu được…" **không** xuất hiện; **0 POST `/api/students`** (network counter trước/sau). Screenshot `tc1-…png` (vision-verified: input 0/-500 + đúng 2 lỗi). Chạy 2 lần độc lập (agent-browser + Playwright) — kết quả giống hệt |
| TC2 | Buổi rỗng (clear field) | ✅ PASS | "Số buổi gói phải là số nguyên từ 1 trở lên." — input value `''` xác nhận; 0 POST |
| TC3 | Buổi `10.5` (không nguyên) | ✅ PASS | Lỗi per-field; input **giữ nguyên "10.5", không bị truncate thành 10** (pattern `parseInt` cũ đã chết); 0 POST |
| TC4 | Giá rỗng (clear bằng keyboard) | ✅ PASS | **"Đơn giá không được để trống."** dưới field; 0 POST |
| TC5 | Affirmative: buổi `1` + giá `0` (miễn phí) | ✅ PASS | POST `/api/students` → **201**, modal đóng, row hiện `QC-115-FREE-RETRY … 0đ` (xem Observations #1 về 1 lần chạy bị kẹt do glitch mạng) |
| TC6 | **Enroll mode** (class detail, "Học viên có sẵn" #122): chọn học viên, buổi `0` → Lưu | ✅ PASS | Lỗi "Số buổi gói phải là số nguyên từ 1 trở lên." trong modal enroll; dialog vẫn mở; **0 POST `/enroll`**. Screenshot `tc6-…png` |

## Critical Issues

1. **Không có** — bug gốc #115 đã xác nhận hết trên beta. Đủ điều kiện close issue sau khi QC gốc xác nhận (account gốc không tái sử dụng được, repro đã tái lập 1:1 steps: `/students` → thêm học viên → 0 buổi + -500).

## Observations (không chặn #115, đề xuất follow-up)

1. **[Medium] Modal kẹt vĩnh viễn khi response của POST bị mất trên đường mạng.** Trong lúc retest TC5, một lần POST `/api/students` (total=1/price=0) không bao giờ nhận được response: **server đã ghi row thành công** (row `QC-115-EMPTY-PRICE · 0đ` xuất hiện sau reload) nhưng browser chờ mãi → `useKernelFormSubmit` giữ `saving=true`, **Lưu/Hủy disabled, cả Esc lẫn nút Đóng đều không đóng được modal**; chỉ reload mới thoát. Chạy lại cùng giá trị ngay sau đó → 201 tức thì (xác nhận glitch mạng, không phải bug logic price=0). Cause: `run()` trong `use-kernel-form-submit.ts` không có fetch timeout — nếu promise không settle, nhánh notice `unknown` (có sẵn để xử lý "response lost") không bao giờ được set. Nguy cơ thật cho user: mạng chập chờn → kẹt form → reload → submit lại → **duplicate student**. Đề xuất: AbortController/timeout cho kernel dispatch + cho phép thoát modal khi outcome unknown.
2. **[Info] Prod chưa có fix:** `main` @ `235275c` chưa chứa `92a7153` — repro gốc trên `https://app.teacheros.io.vn` sẽ **vẫn thấy bug** cho đến lần promote develop → main kế tiếp. Khuyến nghị giữ nguyên từ report #104: promote rồi re-test nhanh trên prod.
3. **[Low] Tooling agent-browser hỏng giữa phiên:** daemon rơi vào trạng thái không đáp ứng (EAGAIN `os error 35`) sau ~20 phút chạy — kill daemon / doctor / restart đều không phục hồi; ảnh hưởng cả lệnh screenshot. Phần còn lại của retest chuyển sang **Playwright project-native** (chạy thẳng vào staging với counter idiom của e2e spec) — kết quả không đổi. Screenshot TC2–TC4 không thu được; text evidence (accessibility snapshot + network log) đã đính trong bảng trên.
4. **[Low] Junk data staging D1:** 3 account throwaway + học viên `QC-115-RETEST`, `QC-115-EMPTY-PRICE`, `QC-115-FREE-RETRY`, `QC-115-ENROLLABLE` + lớp `QC-115 Enroll Class` (junk row được chấp nhận theo design, giống các retest trước).

## Unresolved Questions

- Không có câu hỏi chặn. AC "API trực tiếp total=0 → 400" không tái chạy trực tiếp trên staging theo nguyên tắc chọn tầng test thấp đủ tin cậy: cùng logic contract đã được `kernel.test.ts:3209-3237` khoá đỏ→xanh và e2e CI xanh trên chính commit deploy (`92a7153`).

## Verdict

**PASS — close #115 được sau khi promote.** Mọi AC client-side xác nhận trên beta (staging @ `92a7153`): chặn min theo field cho cả 2 mode (create + enroll), không request thoát ra server khi invalid, giá 0 (miễn phí) hợp lệ, "10.5" không bị truncate. Cần promote develop → main để prod nhận fix.
