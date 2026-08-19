---
type: reviewer
role: fact-checker + security-adversary
date: 2026-08-19
plan: 260818-1101-persist-class-centric-domain-kernel
phase: 6
---

# Wave 5 red-team — Security Adversary / Fact Checker

Review plan Phase 6, không review code. Chỉ giữ finding có evidence codebase. Không chạy lint/build/test.

## Finding 1: Router invoice riêng làm rơi Origin/CSRF + JSON-only guard

- **Severity:** High
- **Plan location:** `phase-06-wave-5-tuition-persist.md:34,38-40,45-47`
- **Flaw:** Phase yêu cầu tạo `apps/server/src/routes/invoices/` nhưng không định nghĩa router này mount ở đâu. Bootstrap session chạy app-level, còn Origin + content-type guard chỉ nằm trong `kernelRoutes`. Nếu mount invoice router cạnh `kernelRoutes`, `POST /api/invoices/:id/mark-paid` không kế thừa guard.
- **Concrete failure scenario:** Cookie Better-Auth đang active. Implementer mount `invoiceRoutes` trực tiếp dưới `/api`; request POST thiếu/giả `Origin` hoặc body form/text đến mark-paid. CORS không phải authorization gate; handler mới có thể chạy trước khi bị browser chặn đọc response, làm đổi trạng thái hóa đơn.
- **Evidence:**
  - `apps/server/src/app.ts:87-99` — CORS + bootstrap mount app-level, nhưng app chỉ mount `kernelRoutes` tại `/api`.
  - `apps/server/src/routes/kernel.ts:37-51` — reject Origin/content-type là `kernel.use("*")`, không phải middleware app-level.
  - `apps/server/src/kernel.test.ts:301-331` — handler-chain hiện khóa 403 khi thiếu/foreign Origin và 415 khi non-JSON.
- **Suggested fix:** Đặt GET/POST invoice trong `kernelRoutes`, hoặc hoist guard dùng chung lên `app.ts` trước mọi domain route. Phase phải khóa mount point và thêm test 403 no-Origin, 403 foreign-Origin, 415 non-JSON cho mark-paid.

## Finding 2: Bootstrap middleware không phải auth gate; phase không bắt handler fail-closed

- **Severity:** High
- **Plan location:** `phase-06-wave-5-tuition-persist.md:23-35,43-48,67-69`
- **Flaw:** Câu “org-scoped” không đủ. Khi session vắng, bootstrap cố ý `next()`; chính từng kernel handler mới trả 401 và lấy `ctx.orgId`. Phase không yêu cầu invoice router đọc `kernelCtx`, trả 401 khi thiếu ctx, hay dùng predicate `(id, orgId)` cho mark-paid/list.
- **Concrete failure scenario:** Handler GET mới dùng `select().from(invoice)` hoặc POST dùng `WHERE id = :id`, tin rằng `/api/*` middleware đã authorize. Unauthenticated caller đọc toàn bộ invoice; hoặc teacher org B đoán id invoice org A rồi mark-paid. Nếu trả 403 cho foreign id còn tạo oracle tenant.
- **Evidence:**
  - `apps/server/src/app.ts:44-50` — request unauthenticated đi tiếp; middleware không chặn.
  - `apps/server/src/app.ts:71-79` — `kernelCtx` chỉ được set sau khi membership tồn tại.
  - `apps/server/src/routes/kernel.ts:303-306` — handler hiện phải tự `unauthorized(c)` rồi mới query theo `ctx.orgId`.
  - `apps/server/src/kernel.test.ts:355-374` — pattern isolation hiện tại đòi cross-org id trả 404 và resource org A không đổi.
- **Suggested fix:** Spec rõ mọi invoice handler: `ctx = c.get("kernelCtx")`, thiếu → 401; GET `WHERE invoice.orgId = ctx.orgId`; mark-paid `WHERE invoice.id = :id AND invoice.orgId = ctx.orgId`; unknown/foreign cùng trả 404. Kiểm thử unauthenticated + hai org trên handler thật.

## Finding 3: `invoice.orgId` và `invoice.studentId` không bảo đảm cùng tenant

- **Severity:** Medium
- **Plan location:** `phase-06-wave-5-tuition-persist.md:28-34,45,67-69`
- **Flaw:** Schema draft chỉ liệt kê hai foreign key độc lập. Convention hiện tại chứng minh FK `studentId → student.id` không đồng thời chứng minh `student.orgId === invoice.orgId`; những binding chéo phải được handler/join kiểm tra riêng. Phase còn yêu cầu helper insert trực tiếp nhưng không khóa helper phải bind student cùng org.
- **Concrete failure scenario:** Helper/seed/import chèn invoice `orgId=A, studentId=B`. GET invoice org A join theo `studentId` thuần có thể kéo tên/PII student org B; hoặc snapshot A chứa khoản tiền gắn nhầm người, làm dashboard debt sai tenant.
- **Evidence:**
  - `packages/db/src/schema/enrollment.ts:20-29` — `orgId`, `classId`, `studentId` là các FK độc lập; schema không encode equality giữa org của các row.
  - `packages/db/src/schema/lesson.ts:19-28` — lesson cũng có các FK độc lập.
  - `apps/server/src/routes/kernel.ts:127-138` — runtime phải join lesson↔enrollment để lấy binding.
  - `apps/server/src/routes/kernel.ts:473-479` — handler chặn mismatch mà FK riêng không bắt được.
- **Suggested fix:** Invoice read/helper phải xác thực student cùng `ctx.orgId`; join bằng cả `student.id = invoice.studentId` và `student.orgId = invoice.orgId`, hoặc thêm composite unique/FK `(studentId, orgId)`. Test chèn row malformed trực tiếp và assert không API/snapshot nào expose nó.

## Finding 4: Mark-paid nhận `method: string` không giới hạn và không khóa semantics chuyển trạng thái

- **Severity:** High
- **Plan location:** `phase-06-wave-5-tuition-persist.md:30-35,43-46,57-69`
- **Flaw:** Phase chỉ ghi body `{ method }`; không Zod schema strict, enum/length, reject extra key, transition matrix, hay atomic conditional update. Hành vi mock hiện cho phép overwrite method của invoice đã paid và test đang pin hành vi đó. Với dữ liệu tài chính, phase phải nêu rõ đây là compatibility lock hay một rủi ro được user chấp nhận; không được để implementer tự chọn.
- **Concrete failure scenario:** Hai tab POST method khác nhau cùng lúc; last writer âm thầm đổi dấu vết thanh toán. Direct caller gửi method dài/deceptive hoặc body có `status`/`amount`; implementer spread body và sửa thêm cột. Một invoice đã paid có thể bị rewrite method không audit.
- **Evidence:**
  - `apps/web/src/lib/data-store-reducer.ts:15-18` — action nhận `method: string` không giới hạn.
  - `apps/web/src/lib/data-store-reducer.ts:163-171` — current reducer gán `paid` + method không kiểm tra trạng thái trước.
  - `apps/web/src/lib/data-store-reducer.test.ts:93-100` — test pin overwrite method trên invoice đã paid.
  - `packages/api/src/contracts.ts:67-73` — Wave 4 dùng Zod `.strict()` để cấm forged status/extra body.
  - `apps/server/src/routes/kernel.ts:484-500` — Wave 4 đặt status precondition ngay trong `UPDATE ... WHERE` để chặn race hai tab.
- **Suggested fix:** Thêm `invoiceMarkPaidSchema = z.object({ method: z.enum([...]) }).strict()`, không nhận amount/status. Chốt explicit policy: nếu giữ compatibility overwrite, ghi rõ và dùng atomic update có tenant predicate; nếu chuyển sang immutable paid→409 thì phải xin xác nhận vì test hiện pin overwrite. Test extra keys, method invalid/quá dài, paid replay và concurrent calls.

## Finding 5: Write path hiện vẫn local-only; plan không nối mark-paid vào transport persist

- **Severity:** High
- **Plan location:** `phase-06-wave-5-tuition-persist.md:34,38-47,50-60`
- **Flaw:** UI vẫn dispatch action reducer. Whitelist command bus không có `mark-invoice-paid`, và test xác nhận action này local-only. Phase chỉ nói tạo `repos/invoices.ts` + sửa `tuition.tsx`, không nói đổi dispatch thành call repo hay thêm action vào bus/refetch. Implement đúng file list có thể “trông đã paid” nhưng không bao giờ POST.
- **Concrete failure scenario:** Teacher bấm “Đã nhận”; reducer đổi row trong memory. D1 không đổi. Reload trả invoice unpaid/overdue, trong khi teacher đã tin rằng tiền được ghi nhận.
- **Evidence:**
  - `apps/web/src/routes/_auth/tuition.tsx:168-179` — nút mark-paid gọi `dispatch({ type: "mark-invoice-paid" ... })`.
  - `apps/web/src/lib/repos/kernel.ts:22-34` — whitelist persistent writes không có mark-paid.
  - `apps/web/src/lib/repos/kernel.test.ts:306-315` — test hiện xác nhận `isKernelWrite(mark-invoice-paid) === false`.
  - `apps/web/src/lib/data-provider.tsx:89-98` — action không thuộc kernel write chạy `localDispatch`, không POST.
- **Suggested fix:** Phase phải định danh một write path duy nhất: thêm action vào command bus với endpoint/body cụ thể và refresh shared snapshot, hoặc để `repos/invoices.ts` expose mutation async rồi `tuition.tsx` await + refresh. Rewrite test local-only thành contract POST/persist/reload; không giữ cả hai đường.

## Finding 6: Read path không có invoice; chỉ sửa Tuition làm debt biến mất ở hai màn khác

- **Severity:** High
- **Plan location:** `phase-06-wave-5-tuition-persist.md:25,34,36-48,57-61`
- **Flaw:** Snapshot contract, server loader, reducer hydration và `KernelSlice` hiện không có invoices. Phase không liệt kê bất kỳ tầng nào này, cũng không nói GET riêng hydrate `data.invoices`. Invoice đang được dùng ở Tuition, Dashboard và student detail; chỉ sửa `tuition.tsx` sẽ để hai màn còn lại đọc `[]` hoặc stale data.
- **Concrete failure scenario:** GET `/api/invoices` trên Tuition hiển thị đúng nợ, nhưng Dashboard tính debt từ `data.invoices=[]` và không đánh dấu student rủi ro; student detail tuition tab cũng trống. Teacher ra quyết định thu tiền trên hai nguồn mâu thuẫn.
- **Evidence:**
  - `packages/api/src/contracts.ts:174-181` — `KernelSnapshot` không có invoices.
  - `apps/web/src/lib/data-store-reducer.ts:21-23` — `kernel-loaded` payload không hydrate invoices.
  - `apps/web/src/lib/data-store-reducer.ts:128-138` — runtime khởi tạo `invoices: []`.
  - `apps/web/src/lib/repos/kernel.ts:17-20,135-141` — `KernelSlice`/mapper không chứa invoices.
  - `apps/web/src/routes/_auth/dashboard.tsx:160-166` — Dashboard tính debt từ shared `data.invoices`.
  - `apps/web/src/routes/_auth/students/$studentId.tsx:74-76,212-228` — student detail cũng đọc cùng collection.
- **Suggested fix:** Chốt canonical read surface. Nếu snapshot: thêm `KernelInvoiceRow`, `KernelSnapshot.invoices`, org-scoped loader, `KernelSlice`, `kernel-loaded` payload và mapper. Nếu GET riêng: provider vẫn phải hydrate shared `data.invoices` trước khi children render và refresh nó sau mutation. Related files/tests phải cover cả ba consumers.

## Finding 7: GET list không có DTO whitelist; schema draft khuyến khích trả raw `orgId`

- **Severity:** Medium
- **Plan location:** `phase-06-wave-5-tuition-persist.md:28-35,45-47`
- **Flaw:** Phase mô tả row gồm `orgId`, `studentId` rồi chỉ nói “GET list”, không định nghĩa response contract. Implementer dễ `select().from(invoice)` và trả thẳng row, lộ tenant id/internal timestamps hoặc future bookkeeping fields; status/method raw cũng có thể vượt union UI.
- **Concrete failure scenario:** Frontend nhận cả `orgId`; log/toast/error telemetry giữ tenant identifier. Khi bảng sau này thêm `paidBy`, reconciliation note hoặc provider reference, GET tự động expose vì API không có DTO boundary.
- **Evidence:**
  - `apps/server/src/routes/kernel.ts:237-300` — snapshot hiện map explicit field-by-field thay vì trả raw domain rows; `orgId` bị loại.
  - `packages/api/src/contracts.ts:77-84,105-128,161-181` — public snapshot dùng DTO types không chứa `orgId`.
  - `apps/web/src/lib/mock-data.ts:45-55` — UI chỉ cần `id`, `sid`, amount/status/date/type/method.
- **Suggested fix:** Định nghĩa `KernelInvoiceRow`/`InvoiceListItem` trong `packages/api`, whitelist đúng field UI cần, map `studentId → sid` ở adapter, không trả `orgId`. Parse status/method từ domain enum trước response hoặc fail closed với row invalid.

## Finding 8: Phase không có security verification matrix cho surface tài chính mới

- **Severity:** Medium
- **Plan location:** `phase-06-wave-5-tuition-persist.md:34,43-61,67-69`
- **Flaw:** Test duy nhất được nêu là helper insert + mark-paid/reload. Không có unauthenticated, CSRF/origin, invalid body, cross-org GET, cross-org mark-paid, non-disclosure 404, malformed relation hay replay/race. “Quality gate xanh” không chứng minh security boundary.
- **Concrete failure scenario:** Endpoint persist happy-path pass, nhưng org B vẫn update invoice org A hoặc foreign Origin vẫn mark-paid. Không test nào fail vì phase chỉ kiểm tra reload giữ `paid + method`.
- **Evidence:**
  - `apps/server/src/kernel.test.ts:1-7` — harness hiện chạy real handler chain, đủ khả năng kiểm tra boundary.
  - `apps/server/src/kernel.test.ts:301-340` — precedent guard/invalid-body tests.
  - `apps/server/src/kernel.test.ts:355-374` — precedent two-org read/write isolation.
  - `apps/server/src/kernel.test.ts:815-860` — Wave 4 có riêng snapshot isolation + cross-org mutation + unchanged-owner assertion.
- **Suggested fix:** Phase phải liệt kê test cases trên `apps/server/src/kernel.test.ts`: 401 unauth; 403 no/foreign Origin; 415 non-JSON; 400 invalid/extra method payload; GET org B không thấy invoice A; POST org B vào id A → 404 và A unchanged; malformed student relation không expose; replay/race theo policy đã chốt.

## Summary

- Findings: 8 — 5 High, 3 Medium.
- Điểm phá chính: router mới có thể mất guard, middleware không tự authorize, read/write path chưa nối vào shared kernel, và mutation tài chính chưa có contract/transition/race policy.
- Không sửa code hay plan; chỉ tạo report này.

## Unresolved questions

- Mark-paid trên invoice đã `paid`: giữ overwrite theo characterization hiện tại, hay đổi sang 409? Đây là decision đã được test pin, không nên tự đảo khi implement.
- Invoice canonical read qua `/api/kernel` hay GET riêng? Phase phải chọn một; hiện ba consumer cùng phụ thuộc `data.invoices`.
