# Red team Wave 7 — Assumption Destroyer / Fact Checker

Scope: chỉ GitHub issue #17 và `phase-08-wave-7-reports-notifs-comment-bank.md`. Không review style, không chạy lint/build/test.

## Findings

### 1. Critical — Ba GET list không có đường vào shared store, nên “reload giữ” có thể hoàn thành backend nhưng UI vẫn rỗng

- **Plan section:** `Architecture` (`phase-08...md:39`), `Related Code Files` (`:43-45`), `Implementation Steps` (`:51`).
- **Evidence:** `KernelSnapshot` chỉ có students/classes/syllabi/enrollments/packages/lessons/assignments/invoices (`packages/api/src/contracts.ts:226-235`); `loadSnapshot()` trả đúng các collection đó (`apps/server/src/routes/snapshot.ts:154-227`); web `KernelSlice` cũng chỉ pick 6 collection (`apps/web/src/lib/repos/kernel.ts:19-22`); payload `kernel-loaded` không có report/notif/comment bank (`apps/web/src/lib/data-store-reducer.ts:21-30`); provider chỉ fetch `/api/kernel` (`apps/web/src/lib/data-provider.tsx:67-69`).
- **Failure:** implement đúng “GET 3 list” nhưng không có consumer fetch/apply thì `emptyData.reports/notifs/commentBank` vẫn `[]` sau reload. Hai “read site” plan bảo sửa thực ra đã đọc shared store: assignment đọc `data.commentBank` (`apps/web/src/routes/_auth/assignments/$assignmentId.tsx:132-143`) và topbar đã truyền `data.notifs` (`apps/web/src/components/layout/topbar.tsx:112`).
- **Required correction:** khóa canonical read path. Nếu đi theo precedent hiện tại, thêm 3 collection vào API contract, `loadSnapshot`, adapter, `KernelSlice`, payload reducer và tests. Nếu dùng GET riêng, plan phải nêu provider aggregation/cache và refresh semantics tương đương; chỉ tạo `repos/reports.ts`/`repos/notifs.ts` là chưa đủ.

### 2. High — Không khóa thứ tự/atomicity giữa grade và append comment; mọi thứ tự đơn giản đều có trạng thái bán thành công

- **Plan section:** `Requirements` (`phase-08...md:28`), `Architecture` (`:39`), `Implementation Steps` (`:52`).
- **Evidence:** Grade modal hiện có một awaited command, chỉ close sau khi `grade-assignment` trả id (`apps/web/src/components/modals/grade-modal.tsx:60-78`). Command bus thực hiện POST rồi snapshot refresh, trả `undefined` nếu write hoặc refresh thất bại (`apps/web/src/lib/repos/kernel.ts:231-250`). Sau khi grade thành công, assignment có scores và nút mở grade modal biến mất (`apps/web/src/routes/_auth/assignments/$assignmentId.tsx:73-84`).
- **Failure:** append trước grade tạo orphan/duplicate comment khi grade fail/retry; append sau grade tạo grade-saved/comment-failed nhưng user không còn entry path bình thường để retry. Nếu append sau snapshot refresh mà không refresh lần nữa, item mới không hiện cho tới reload.
- **Required correction:** plan phải khóa transaction hoặc two-step state machine, thứ tự, partial-success UX, retry/idempotency và snapshot cuối cùng. Test bắt buộc cover grade fail, comment fail, refresh fail và retry; không được chỉ test happy path hai POST.

### 3. High — “Append” chưa định nghĩa duplicate semantics, trong khi UI hiện giả định `text` là identity

- **Plan section:** schema `comment_bank` (`phase-08...md:36`), POST append (`:39`), step 3 (`:52`).
- **Evidence:** DB shape dự kiến có `id`, nhưng `CommentBankItem` runtime chỉ có `{tag,text}` (`apps/web/src/lib/mock-data.ts:94-97`) và consumer dùng `key={c.text}` (`apps/web/src/routes/_auth/assignments/$assignmentId.tsx:132-136`). Command bus có retry refresh và báo failure sau khi server có thể đã ghi (`apps/web/src/lib/repos/kernel.ts:239-250`).
- **Failure:** cùng feedback có thể được append do double submit/retry hoặc hợp lệ ở hai lần chấm; UI sinh duplicate React keys và không có identity để reconcile. Ngược lại, tự thêm unique `(orgId,text)` sẽ âm thầm đổi nghĩa “append” thành dedupe.
- **Required correction:** khóa rõ duplicate được phép hay idempotent. Preserve server `id` tới UI và key theo id, hoặc định nghĩa unique/idempotency key + conflict response. Plan phải liệt kê thay đổi `mock-data.ts`/adapter thay vì để implementer tự chọn semantics.

### 4. High — Report row chưa có wire contract/mapping và chưa khóa quan hệ student cùng org

- **Plan section:** `Architecture` report fields (`phase-08...md:34`) và “GET 3 list” (`:39`).
- **Evidence:** UI contract dùng `sid`, `status` union `read|sent|draft`, còn `sent`/`read` là chuỗi hiển thị (`apps/web/src/lib/mock-data.ts:76-84`); reports page lookup student bằng `r.sid` và render trực tiếp `sent/read` (`apps/web/src/routes/_auth/reports.tsx:87-109`). Plan lại ghi DB field `studentId` và không nêu type/default/adapter. Precedent invoice phải inner join cả `studentId` và `orgId` trước khi trả row (`apps/server/src/routes/snapshot.ts:38-43`).
- **Failure:** trả raw DB row làm `r.sid` undefined; dùng boolean/timestamp cho các cột tên `sent/read` phá UI; chỉ filter `report.orgId` vẫn chấp nhận row org A trỏ student org B.
- **Required correction:** định nghĩa DTO chính xác, map `studentId -> sid`, status enum, `sessions` integer, format của `sent/read`, FK và same-org join/validation. Thêm report contract + adapter tests, kể cả malformed cross-org relation.

### 5. High — “Org mới = rỗng” không đúng trên các UI Wave 7 dù ba mảng thật sự rỗng

- **Plan section:** `Requirements` (`phase-08...md:28`), step 5 (`:54`), success criterion (`:67`), topbar touchpoint (`:45-46`).
- **Evidence:** Reports page luôn nói “4 báo cáo tuần này” (`apps/web/src/routes/_auth/reports.tsx:67-70`) và render 5 send-log demo hardcode (`:28-59`, `:121-137`). Topbar luôn render chấm đỏ dù `data.notifs=[]` (`apps/web/src/components/layout/topbar.tsx:92-112`); dòng `data.notifs` mà plan bảo “truyền” đã tồn tại ở `:112`.
- **Failure:** org trống vẫn hiển thị lịch sử gửi giả và tín hiệu có thông báo. Backend/isolation test có thể xanh trong khi acceptance visible behavior sai.
- **Required correction:** nêu chính xác empty-state cho report table/send log/lead và conditional bell dot. Điều này không yêu cầu đổi banner `topbar.tsx:66`, nên không xung đột scope lock.

### 6. Medium — Migration contract chỉ là “3 bảng + migrate”, thiếu các invariant đã thành convention trong repo

- **Plan section:** `Architecture` (`phase-08...md:33-37`), `Related Code Files` (`:43`), step 1 (`:50`).
- **Evidence:** Table gần nhất bắt buộc org/student FK cascade, `createdAt`, org/student indexes (`packages/db/src/schema/assignment.ts:19-43`; `packages/db/src/schema/invoice.ts:10-32`). Schema barrel hiện phải export từng table (`packages/db/src/schema/index.ts:1-11`). Drizzle generate quản lý SQL và journal; journal hiện kết thúc ở idx 4 (`packages/db/src/migrations/meta/_journal.json:25-39`).
- **Failure:** implementer có thể tạo ba file tối thiểu nhưng thiếu FK/index/order column, quên barrel hoặc hand-write migration mà không cập nhật meta. GET list sau đó không có deterministic order và isolation/backstop yếu hơn các wave trước.
- **Required correction:** ghi full DDL: types, not-null/default, FK cascade, indexes, `createdAt`/ordering; liệt kê `schema/index.ts`, generated SQL, snapshot/meta journal và yêu cầu generate trên journal đã merge.

### 7. Medium — No-op report chưa khóa cả hai action và hai entry path

- **Plan section:** `Implementation Steps` step 4 (`phase-08...md:53`), Todo (`:61`), success criterion (`:68`).
- **Evidence:** Trong shared modal, “Gửi báo cáo” submit chỉ close (`apps/web/src/components/modals/create-report-modal.tsx:33-37`, `:71-73`), còn “Lưu nháp” là handler close riêng (`:68-70`). Modal được mount từ reports page (`apps/web/src/routes/_auth/reports.tsx:139`) và student detail (`apps/web/src/routes/_auth/students/$studentId.tsx:271-276`).
- **Failure:** test một submit path hoặc chỉ kiểm tra không có POST route vẫn bỏ lọt regression: nút draft insert, hoặc một caller được rewired riêng. “Create” bao gồm cả lưu nháp, không chỉ send.
- **Required correction:** plan phải pin không POST/không insert cho cả Save Draft và Send, từ cả `/reports` và `/students/$studentId`; liệt kê shared modal và hai caller trong contract-test surface. Không thêm API report create/send.

### 8. Medium — Premise “comment bank không chứa PII nếu chỉ là template” không đúng với nguồn dữ liệu thực tế

- **Plan section:** `Security Considerations` (`phase-08...md:79`) và step append feedback (`:52`).
- **Evidence:** Dữ liệu được lấy từ textarea “Nhận xét” nhập tự do trong modal đang chấm một assignment cụ thể (`apps/web/src/components/modals/grade-modal.tsx:85-87`, `:130-135`), không phải từ template builder hay sanitizer. Assignment detail cũng dùng nhận xét theo bài/học viên cụ thể (`apps/web/src/routes/_auth/assignments/$assignmentId.tsx:52-59`).
- **Failure:** giáo viên có thể nhập tên, tình trạng hoặc chi tiết riêng của học viên; append với tag mặc định “chung” biến nội dung đó thành template org-wide cho mọi bài. Org scoping không làm premise “không PII” thành đúng.
- **Required correction:** threat model phải coi `text` là teacher-authored potentially sensitive data; khóa trim, max length, storage/display escaping và retention/deletion stance. Nếu sản phẩm vẫn muốn mọi feedback non-empty vào bank (user lock), ghi rõ đó là quyết định dữ liệu thay vì gọi nó “chỉ là template”.

### 9. Medium — Notif contract để mở làm dữ liệu persisted có thể phá render và thứ tự sau reload

- **Plan section:** `Architecture` notif fields (`phase-08...md:35`) và GET lists (`:39`).
- **Evidence:** UI chỉ chấp nhận `dot` thuộc `accent|danger|warn` (`apps/web/src/lib/mock-data.ts:86-92`) và index thẳng `dotColors[n.dot]` (`apps/web/src/components/layout/notif-panel.tsx:3-7`, `:20-26`). `time` là chuỗi display như `18/08 19:00` (`apps/web/src/lib/mock-data.ts:577-605`), không phải sort key ổn định. Precedent loader dùng `createdAt,id` cho deterministic order (`apps/server/src/routes/snapshot.ts:27-43`).
- **Failure:** text DB không validate có thể cho `dotColors[...] = undefined`; sort theo `time` localized sai qua năm/ngày; query không order làm panel đổi thứ tự sau reload.
- **Required correction:** khóa enum/default cho dot, giới hạn/string contract cho text/channel/time và order theo `createdAt,id` (DTO vẫn có thể trả display `time`). Thêm adapter test cho invalid/empty values và deterministic order.

## Unresolved questions

1. Comment bank append cho phép duplicate hay phải idempotent theo lần grade?
2. Grade + append là một transaction hay two-step workflow với partial-success recovery nào?
3. Send log trên reports page là projection của persisted notif/report hay phải ẩn/rỗng cho org mới?
