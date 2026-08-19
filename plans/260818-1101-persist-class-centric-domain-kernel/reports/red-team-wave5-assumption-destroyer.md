# Red Team Wave 5 — Assumption Destroyer

Phạm vi: Fact Checker, chỉ đối chiếu Phase 6 với tree sau Wave 4. Không lint/build/test. Kết luận: kế hoạch hiện chưa đủ để tạo một đường đọc/ghi invoice hoạt động; triển khai đúng nguyên văn vẫn có thể qua quality gate nhưng UI rỗng hoặc mark-paid chỉ đổi bộ nhớ.

## 1. Read path invoice thiếu toàn bộ chuỗi hydrate

- **Severity:** Critical
- **Plan location:** `phase-06-wave-5-tuition-persist.md:14,25,39-47`
- **Flaw:** Kế hoạch giả định thêm `GET list`, `repos/invoices.ts` và sửa riêng `tuition.tsx` là đủ. Runtime hiện chỉ hydrate bốn collection từ `/api/kernel`; `invoices` khởi tạo `[]`, không nằm trong `kernel-loaded`, `KernelSnapshot` hay `KernelSlice`. Hơn nữa invoice có ba route consumer thật, không chỉ Tuition.
- **Concrete failure scenario:** D1 có invoice và `GET /api/invoices` trả đúng. Nếu chỉ Tuition dùng fetch/repo riêng, tab Học phí của student và số nợ Dashboard vẫn đọc `data.invoices=[]`; nếu repo vẫn dựa store như các wave peel trước, ngay cả Tuition cũng rỗng sau reload.
- **Evidence:** `apps/web/src/lib/data-store-reducer.ts:21-23,128-137`; `packages/api/src/contracts.ts:174-181`; `apps/web/src/lib/repos/kernel.ts:17-20,135-141`; `apps/web/src/lib/data-provider.tsx:57-69`; consumer thật tại `apps/web/src/routes/_auth/tuition.tsx:140-141`, `apps/web/src/routes/_auth/students/$studentId.tsx:74-76`, `apps/web/src/routes/_auth/dashboard.tsx:160-166`.
- **Suggested fix:** Chọn và khóa một read architecture. Khớp precedent Wave 4 nhất: thêm `KernelInvoiceRow` + `KernelSnapshot.invoices`, SELECT org-scoped trong `loadSnapshot`, mở `KernelSlice`/`kernel-loaded`, map `studentId -> Invoice.sid` trong `repos/invoices.ts`, rồi để cả ba consumer dùng cùng store cache. Nếu cố ý dùng fetch riêng, kế hoạch phải nêu owner cache/provider và chuyển cả ba consumer, không chỉ Tuition.

## 2. `mark-invoice-paid` hiện chắc chắn local-only, không đi command bus

- **Severity:** Critical
- **Plan location:** `phase-06-wave-5-tuition-persist.md:34,39,46,53,59`
- **Flaw:** Kế hoạch có endpoint nhưng không liệt kê hay mô tả thay đổi `KERNEL_WRITE_TYPES`, `kernelCommand`, provider refresh hoặc action payload. Hiện action này bị `isKernelWrite` trả false, nên provider gọi reducer local thay vì POST.
- **Concrete failure scenario:** Người dùng bấm “Đã nhận”; UI có thể đổi trong phiên nếu collection đã được nạp, nhưng không request `/api/invoices/:id/mark-paid`; reload trả status cũ. Với trạng thái hiện tại `invoices=[]`, thao tác còn là no-op hoàn toàn.
- **Evidence:** action được dispatch tại `apps/web/src/routes/_auth/tuition.tsx:168-179`; whitelist không có `mark-invoice-paid` tại `apps/web/src/lib/repos/kernel.ts:22-34`; nhánh non-kernel gọi local reducer tại `apps/web/src/lib/data-provider.tsx:89-98`; test hiện pin rõ action là non-kernel tại `apps/web/src/lib/repos/kernel.test.ts:306-315`; local reducer chỉ map bộ nhớ tại `apps/web/src/lib/data-store-reducer.ts:163-171`.
- **Suggested fix:** Bổ sung đầy đủ write path như Wave 4: đưa action vào whitelist, map path/body trong `kernelCommand`, POST qua serialized bus, rồi refetch/apply snapshot có invoices. Ghi rõ Tuition `await dispatch` hoặc xử lý Promise/error; thêm contract test `isKernelWrite=true`, path và body.

## 3. Router invoice được đề xuất không được mount và không kế thừa CSRF guard

- **Severity:** Critical
- **Plan location:** `phase-06-wave-5-tuition-persist.md:34,39,46,67-69`
- **Flaw:** `Create/Modify apps/server/src/routes/invoices/` không khớp server hiện tại. `app.ts` chỉ import/mount `kernelRoutes`; Origin + JSON guard lại nằm bên trong riêng router đó. Phase không liệt kê sửa `app.ts`, cũng không yêu cầu guard tương đương cho router mới.
- **Concrete failure scenario:** Tạo `routes/invoices/*` theo file list nhưng không mount thì GET/POST trả 404. Nếu implementer tự mount router mới trong `app.ts`, mark-paid có thể nhận POST cross-site/no-Origin hoặc form body vì guard không tự lan từ `kernelRoutes`.
- **Evidence:** chỉ `kernelRoutes` được import/mount tại `apps/server/src/app.ts:8,83-100`; guard POST là middleware cục bộ `kernel.use("*")` tại `apps/server/src/routes/kernel.ts:34-51`; Wave 4 endpoints sống trực tiếp trong router được guard tại `apps/server/src/routes/kernel.ts:504-509`.
- **Suggested fix:** Khóa endpoint invoice bên trong `kernelRoutes` và sửa file list thành `apps/server/src/routes/kernel.ts`, hoặc thiết kế shared guarded API router và liệt kê thay đổi/mount cụ thể. Bắt buộc test Origin 403, content-type 415 và body validation trên mark-paid.

## 4. Schema một dòng bỏ qua tenant/FK/index/order và mismatch `studentId`/`sid`

- **Severity:** High
- **Plan location:** `phase-06-wave-5-tuition-persist.md:30-32,38,45`
- **Flaw:** Sơ đồ chỉ liệt kê tên cột, không khóa NOT NULL, FK cascade, index, integer amount, `createdAt`/thứ tự list, hay adapter đổi `studentId` của DB thành `sid` của UI. Đây không phải chi tiết trang trí: mọi consumer join/filter theo `sid`.
- **Concrete failure scenario:** API trả row `{studentId}` thẳng vào `MockData.Invoice`; Tuition không tìm được tên học viên, student detail không thấy hóa đơn. Thiếu FK/index cho phép invoice mồ côi hoặc làm list/debt scan toàn bảng theo org; thiếu order khiến hóa đơn nhảy thứ tự giữa reload.
- **Evidence:** UI contract thật là `Invoice.sid` tại `apps/web/src/lib/mock-data.ts:45-55`; Tuition join qua `i.sid` tại `apps/web/src/routes/_auth/tuition.tsx:140-148`; student detail filter qua `i.sid` tại `apps/web/src/routes/_auth/students/$studentId.tsx:74-76`. Convention hiện hữu khóa org FK cascade + timestamp + org index tại `packages/db/src/schema/student.ts:9-25`, và enrollment thêm student FK/index tại `packages/db/src/schema/enrollment.ts:17-41`; mọi schema được export qua `packages/db/src/schema/index.ts:1-9`.
- **Suggested fix:** Viết schema contract đầy đủ: `orgId` FK organization cascade, `studentId` FK student cascade, amount integer nonnegative ở input/helper, status/method/date/type NOT NULL, `createdAt`, `invoice_org_idx` và `invoice_student_idx`; export schema, generate migration. Định danh adapter `KernelInvoiceRow.studentId -> Invoice.sid` và thứ tự list (ví dụ `createdAt`, `id`).

## 5. “Remaining đã thật” vẫn sai cho student không có package

- **Severity:** High
- **Plan location:** `phase-06-wave-5-tuition-persist.md:14,47,65`
- **Flaw:** Wave 4 có derive thật cho package được hiển thị, nhưng student không có enrollment/package được map thành package số 0. Tuition lại render mọi student dưới tiêu đề “Gói học đang hoạt động”, chia `done/total`, và coi `remaining <= 2` là sắp hết. Kế hoạch đã nâng một quy tắc adapter thành giả định UI đúng cho mọi row.
- **Concrete failure scenario:** Tạo student không chọn class (flow hợp lệ). Tuition hiển thị `0/0`, progress nhận `NaN`, và gắn badge đỏ “Sắp hết” dù student không có gói nào.
- **Evidence:** flow tạo student cho phép bỏ `classId` tại `packages/api/src/contracts.ts:9-17`; zero-package có `total=done=remaining=0` tại `apps/web/src/lib/repos/students.ts:13-21` và được dùng khi không tìm thấy package tại `apps/web/src/lib/repos/students.ts:50-72`; Tuition map toàn bộ `data.students` tại `apps/web/src/routes/_auth/tuition.tsx:53-65`, tính tỷ lệ tại `apps/web/src/routes/_auth/tuition.tsx:89-98`, và gắn “Sắp hết” theo remaining tại `apps/web/src/routes/_auth/tuition.tsx:103-110`. `Progress` công bố input phải là `0..100` tại `apps/web/src/components/ui/progress.tsx:5-12`.
- **Suggested fix:** Phase phải định nghĩa tập “active packages” thay vì suy từ mọi `Student`: expose package presence/id trong tuition read model hoặc lọc từ snapshot packages, loại student không package; guard `total===0` trước phép chia. Thêm test classless student không xuất hiện trong bảng active-package và không tạo `NaN`.

## 6. Ngữ nghĩa status/method chưa khóa, dễ đảo hành vi đã được verify

- **Severity:** High
- **Plan location:** `phase-06-wave-5-tuition-persist.md:31,34,59,69`
- **Flaw:** Phase không định nghĩa domain/default của `status`, vocabulary/bound của `method`, strict body, transition cho invoice đã paid, hay 404/409. Hành vi hiện tại đã pin: mark-paid trên invoice đã paid vẫn ghi đè method. UI cũng không hỏi phương thức khi bấm; nó gửi method cũ, riêng `"—"` tự đổi thành `"CK"`.
- **Concrete failure scenario:** Implementer áp transition “chỉ unpaid/overdue -> paid” và trả 409 cho paid; characterization hiện tại bị đảo. Hoặc API chấp nhận body thừa/status do client gửi, hay lưu chuỗi method tùy ý cực dài; reload không còn contract ổn định.
- **Evidence:** status domain hiện tại là `paid|overdue|unpaid` và method là string tại `apps/web/src/lib/mock-data.ts:45-55`; overwrite invoice đã paid được pin tại `apps/web/src/lib/data-store-reducer.test.ts:93-100`; payload thực tế được dựng tại `apps/web/src/routes/_auth/tuition.tsx:168-178`. Precedent action body strict nằm tại `packages/api/src/contracts.ts:67-73` và server parse qua Zod tại `apps/server/src/routes/kernel.ts:57-73`.
- **Suggested fix:** Ghi contract Zod và semantics cụ thể, giữ quyết định đã verify: invoice tồn tại ở cùng org được set `status="paid"` và method bị overwrite kể cả đã paid; missing/cross-org trả 404. Body chỉ cho `method`, strict, nonempty và bounded; khóa status enum ba giá trị + defaults/schema. Nếu muốn đổi semantics paid->409, phải xin lại quyết định thay vì đổi ngầm.

## 7. “AddInvoiceModal vẫn no-op” chỉ là lời hứa, chưa có regression lock

- **Severity:** Medium
- **Plan location:** `phase-06-wave-5-tuition-persist.md:14,26,34,41,54,60`
- **Flaw:** Phase cấm POST create nhưng chỉ nói test mark-paid dùng helper. Không có test nào bảo vệ submit modal chỉ close hoặc bảo vệ server không expose create endpoint. Việc thêm invoice repo/action gần modal làm regression này rất dễ xảy ra.
- **Concrete failure scenario:** Implementer thấy form đã có student/type/amount/method và nối submit vào repo mới. Hóa đơn được insert dù đây là non-goal; helper-only server test vẫn xanh vì không render modal.
- **Evidence:** submit hiện chỉ `preventDefault()` + `onClose()` tại `apps/web/src/components/modals/add-invoice-modal.tsx:20-25`; modal đã thu đủ field để vô tình nối create tại `apps/web/src/components/modals/add-invoice-modal.tsx:30-60`; danh sách modal write được contract-test không chứa `add-invoice-modal.tsx` tại `apps/web/src/lib/kernel-runtime.contract.test.ts:16-25,51-57`.
- **Suggested fix:** Thêm contract/interaction test riêng pin submit không gọi dispatch/fetch và chỉ close; server test xác nhận `POST /api/invoices` không tồn tại (hoặc không đăng ký route). Liệt kê test trong Steps/Success Criteria, không chỉ ghi “do not modify”.

## 8. Test plan không chứng minh org scope, guard hay migration thật

- **Severity:** Medium
- **Plan location:** `phase-06-wave-5-tuition-persist.md:34,45,48,55-61,67-69`
- **Flaw:** “Test mark-paid dùng helper insert invoice” không chỉ ra harness/file/matrix. Một happy-path helper test không chứng minh org B không đọc/ghi org A, new-org snapshot rỗng, POST guard, unknown id, hay migration được apply. “Quality gate xanh” không tự bao phủ các contract này.
- **Concrete failure scenario:** Handler update theo `id` mà quên `orgId`; happy path + reload đều pass, nhưng teacher B mark-paid invoice của A. Hoặc schema file tồn tại nhưng migration/export thiếu; unit repo test xanh, deploy hỏng.
- **Evidence:** harness thật migrate toàn bộ generated migrations vào libSQL memory và chạy handler chain tại `apps/server/src/kernel.test.ts:1-42,61-66`; helper/call đã hỗ trợ Origin + JSON tại `apps/server/src/kernel.test.ts:84-104`; precedent cross-org kiểm snapshot rỗng, write 404 và row A không đổi tại `apps/server/src/kernel.test.ts:815-861`. Migration source được cấu hình `schema -> src/migrations` tại `packages/db/drizzle.config.ts:8-13` và deploy dùng cùng thư mục tại `packages/infra/alchemy.run.ts:11-13`.
- **Suggested fix:** Ghi rõ sửa `apps/server/src/kernel.test.ts`, thêm `insertInvoice` trong `createTestApp`, và test: new org zero invoices; GET org-scoped; paid+method survive snapshot/reload; unknown/cross-org POST 404 và row A unchanged; Origin 403/content-type 415/invalid body 400; no package mutation; generated migration + schema index export. Không cần mở modal.

## Kết luận

Phase 6 cần rewrite tương tự bản sửa Wave 4: khóa đủ read path, write bus, guarded server route, adapter shape và test matrix. Chỉ thêm bảng + GET/POST + sửa `tuition.tsx` là đường triển khai lỗi im, không phải kế hoạch persist hoàn chỉnh.
