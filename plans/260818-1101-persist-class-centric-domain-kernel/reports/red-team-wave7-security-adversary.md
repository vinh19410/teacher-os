---
type: reviewer
role: security-adversary + fact-checker
date: 2026-08-19
scope: GitHub issue #17 / Phase 8 Wave 7 only
---

# Red-team Wave 7 — Security Adversary

Plan review, không review code quality. Không chạy lint/build/test. Chỉ ghi các lỗ hổng Critical/High/Medium có đối chiếu code hiện tại.

## 1. Role `teacher` là invariant trên giấy, runtime không enforce trước khi mở ba collection

- **Severity:** High — Broken Access Control / Elevation of Privilege.
- **Plan location:** `plan.md` §7 invariant, dòng 36; Phase 8 §Security Considerations, dòng 77–79.
- **Flaw:** Plan khóa “Role bắt buộc = `teacher`” nhưng Phase 8 chỉ yêu cầu filter `orgId`. `KernelCtx` hiện không mang role (`apps/server/src/app.ts:13-16`); middleware đọc membership chỉ theo `userId`, không lọc/check role (`apps/server/src/app.ts:53-58`), rồi cấp `orgId` thẳng vào context (`apps/server/src/app.ts:74-79`). Schema lại cho phép mọi chuỗi role, chỉ default `teacher` (`packages/db/src/schema/membership.ts:19-24`). Vì vậy membership `viewer`, role lỗi hoặc role tương lai vẫn đọc report/notif và POST comment bank nếu handler chỉ làm đúng câu “filter orgId”.
- **Attack:** tài khoản nội bộ quyền thấp/role sai dùng session hợp lệ để đọc thông báo có tên, học phí, bài trễ và ghi template dùng chung trong org.
- **Required plan correction:** khóa fail-closed `membership.role === "teacher"` trước khi tạo `kernelCtx` hoặc tại mọi handler Wave 7; test role khác `teacher` nhận 403 và không đọc/ghi.

## 2. Khẳng định comment bank “không chứa PII” trái trực tiếp với nguồn dữ liệu đã chốt

- **Severity:** High — Information Disclosure / Privacy.
- **Plan location:** Phase 8 §Requirements dòng 28, §Implementation Steps dòng 52, §Security Considerations dòng 79.
- **Flaw:** Write source là feedback tự do trong grade modal, không phải template đã khử định danh. UI nhận mọi nội dung người dùng nhập qua `Textarea` (`apps/web/src/components/modals/grade-modal.tsx:130-135`). Bank sau đó được hiển thị nguyên văn trên mọi assignment của org (`apps/web/src/routes/_auth/assignments/$assignmentId.tsx:129-144`). Dữ liệu notif hiện tại cũng chứng minh collection này chứa tên HV, trạng thái nợ và bài trễ (`apps/web/src/lib/mock-data.ts:577-605`). Câu “không chứa PII HV nếu chỉ là template” vì vậy không mô tả threat model thật.
- **Attack:** GV nhập “Minh Anh…, mẹ hay gọi…” khi chấm; text được append vào bank dùng chung và lộ cho mọi membership có quyền đọc collection, không có delete/retention trong scope.
- **Required plan correction:** vẫn giữ user-lock persist, nhưng phân loại `comment_bank.text`, `notif.text`, report linkage là dữ liệu giáo dục có thể chứa PII; cấm log/raw error echo, xác định visibility/retention, và thêm test rằng response không vượt org. Không được dựa vào tag `"chung"` để coi nội dung đã vô danh.

## 3. POST comment từ modal tạo dual-write không nguyên tử và không idempotent

- **Severity:** High — Tampering / Data Integrity.
- **Plan location:** Phase 8 §Architecture dòng 39; §Implementation Steps dòng 52; §Risk Assessment dòng 73.
- **Flaw:** Submit hiện là một command `grade-assignment`, await kết quả rồi xóa feedback/đóng modal (`apps/web/src/components/modals/grade-modal.tsx:44-79`). Command bus serialize POST + snapshot refresh và có failure semantics riêng (`apps/web/src/lib/repos/kernel.ts:216-250`). Nhưng Action/KERNEL write hiện chỉ có grade, không có append comment (`apps/web/src/lib/data-store-reducer.ts:15-30`; `apps/web/src/lib/repos/kernel.ts:24-38`), còn Phase 8 chỉ bảo thêm một POST trực tiếp từ modal. Không có thứ tự commit, rollback, idempotency key hay retry contract.
- **Attack/failure:** grade lưu thành công nhưng comment fail; hoặc comment lưu rồi refresh/grade báo lỗi khiến user submit lại và tạo bản sao. Attacker/replay client có thể POST cùng feedback vô hạn vì mỗi request tạo ID server mới.
- **Required plan correction:** định nghĩa một canonical write path: comment append phải đi qua command bus (hoặc một server transaction gộp với grade nếu atomicity là contract), response `{id}`, thứ tự/error UI rõ ràng, và idempotency/replay behavior được pin bằng handler + bus tests. Không direct-fetch song song từ modal.

## 4. `report.orgId` và `report.studentId` không được khóa là cùng tenant

- **Severity:** Medium — Broken Access Control / Cross-tenant integrity.
- **Plan location:** Phase 8 §Architecture dòng 33–37; §Security Considerations dòng 79.
- **Flaw:** DDL phác thảo chỉ liệt kê hai ID và generic “filter orgId”; không yêu cầu FK/cùng-org join. Schema invoice hiện cho thấy FK `orgId` và `studentId` độc lập không thể tự bảo đảm cùng tenant (`packages/db/src/schema/invoice.ts:13-19`). Vì vậy read path invoice phải inner-join trên cả `student.id` và `student.orgId = invoice.orgId`, đồng thời explicit-project DTO (`apps/server/src/routes/snapshot.ts:27-43`). Phase 8 không áp dụng backstop tương đương cho report.
- **Attack/failure:** row lỗi/import tương lai có `report.orgId=A`, `studentId` của B vẫn pass `WHERE report.orgId=A`; GET có thể lộ ID HV B hoặc ghép sai danh tính. Đây là loại malformed relation đã có regression test cho invoice (`apps/server/src/kernel.test.ts:482-490`).
- **Required plan correction:** schema đầy đủ `NOT NULL` + FK cascade/index; canonical report loader join student bằng `(student.id = report.studentId AND student.orgId = report.orgId)`, explicit DTO không trả `orgId`; test chèn relation cross-org và assert cả GET riêng lẫn kernel snapshot đều giấu row.

## 5. Input feedback và collection read đều không có bound

- **Severity:** Medium — Denial of Service / Storage Abuse.
- **Plan location:** Phase 8 §Requirements dòng 28; §Architecture dòng 39; §Implementation Steps dòng 51–52.
- **Flaw:** Điều kiện duy nhất là `trim() !== ""`; plan không có Zod contract strict, max length, server-owned tag, body-size cap, rate limit, pagination/limit hoặc thứ tự ổn định. Textarea client cũng không có `maxLength` (`apps/web/src/components/modals/grade-modal.tsx:130-135`), và consumer render toàn bộ bank bằng `.map()` (`apps/web/src/routes/_auth/assignments/$assignmentId.tsx:129-144`). Code hiện có precedent strict/bounded cho input nhỏ: `invoiceMarkPaidSchema` trim + min/max + `.strict()` (`packages/api/src/contracts.ts:95-99`).
- **Attack:** một tài khoản hợp lệ gửi nhiều body lớn; D1 phình, mỗi GET trả toàn bộ rows và UI render hết, biến một write endpoint rẻ thành storage/read amplification cho cả org.
- **Required plan correction:** contract `z.object({ text: z.string().trim().min(1).max(N) }).strict()`, tag do server gán/enum; request-size/rate bound; index `(orgId, createdAt/id)` và list có hard limit/cursor. Test body rỗng/quá dài/extra key, burst/replay policy và giới hạn response.

## Unresolved questions

- Atomicity mong muốn giữa grade và append bank là “cùng thành công” hay chấp nhận partial success? Plan hiện không quyết định, nhưng lựa chọn này đổi API/transaction design.
- Ai được đọc comment bank khi sau này có nhiều role trong một org? Invariant chỉ nói `teacher`, code hiện chấp nhận mọi role.

Status: DONE
Summary: 5 finding — 3 High, 2 Medium. Wave 7 hiện có role bypass so với invariant, phân loại PII sai, dual-write dễ partial/replay, quan hệ report–student không khóa cùng-org, và bề mặt append/list không giới hạn.
Concerns/Blockers: Cần khóa role, dữ liệu PII, canonical write/idempotency và same-org report join trong plan trước implementation; nếu không security tests chỉ có thể kiểm tra một contract chưa được định nghĩa.
