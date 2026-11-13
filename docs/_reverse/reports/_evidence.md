---
feature: reports
type: reverse-evidence
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# _evidence — reports

Bằng chứng thô phục vụ spec + gaps. Trích nguyên văn chỉ gồm đoạn đọc trực tiếp
trong phiên điều tra; phần còn lại ghi cite + mô tả, không bịa nguyên văn.
Đếm dòng mọi tệp bằng `awk 'END{print NR}'`, không dùng wc -l.

## EV-1 — Luật tiền một nguồn (S8)

apps/web/src/lib/tuition-from-kernel.ts:21-48, trích nguyên văn:

```
/**
 * Tiền đã thu của MỘT hóa đơn (#347) — cùng rule `tuitionTotals` (#320):
 * `status = "paid"` tính đủ `amount` (mark-paid thủ công giữ `paidAmount` 0,
 * status chứ không phải ledger quyết định), còn lại → `min(paidAmount, amount)`
 * với clamp đề phòng ledger vượt số tiền. Single source cho tuitionTotals,
 * revenueByPeriod và trang chi tiết hóa đơn.
 */
export function invoiceReceived(
	invoice: Pick<Invoice, "amount" | "paidAmount" | "status">,
): number {
	if (invoice.status === "paid") return invoice.amount;
	return Math.min(invoice.paidAmount, invoice.amount);
}
```

Tổng hai chiều (:35-48): `collected += invoiceReceived(...)`; chỉ khi
`status !== "paid"` mới cộng `amount - received` vào `outstanding` — trạng thái
lạ (coerced legacy) err vào phía còn phải thu.

## EV-2 — Múi giờ Việt Nam + cửa sổ cố định (S8)

apps/web/src/lib/tuition-from-kernel.ts:73-97, trích nguyên văn phần then chốt:

```
const vnStampFormatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Ho_Chi_Minh",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});
```

```
const MONTHS_IN_WINDOW = 12;
const QUARTERS_IN_WINDOW = 8;
const YEARS_IN_WINDOW = 5;
```

Chú thích :80-83: "the UTC clock lags Vietnam by 7h, so bucketing must never run
on device-local or UTC wall time".

## EV-3 — Hợp đồng xếp kỳ + dropped (S8)

apps/web/src/lib/tuition-from-kernel.ts:102-111 (docblock revenueByPeriod),
trích nguyên văn:

```
/**
 * Doanh thu theo kỳ phát hành hóa đơn (#343): bucket mỗi hóa đơn vào kỳ
 * `createdAt` (Asia/Ho_Chi_Minh) trong cửa sổ cố định — 12 tháng / 8 quý /
 * 5 năm gần nhất tính cả kỳ hiện tại; kỳ rỗng vẫn trả bucket 0/0, sort tăng
 * dần. Tiền đã thu đi đúng rule `tuitionTotals` từng hóa đơn: `status =
 * "paid"` → full `amount` (mark-paid thủ công giữ `paidAmount` = 0), còn
 * lại → `min(paidAmount, amount)`. Hóa đơn `createdAt` 0/NaN (snapshot cũ
 * deploy skew) bị LOẠI và đếm trong `dropped` — không bao giờ im lặng với
 * chỉ số tài chính; hóa đơn thật ngoài cửa sổ (quá cũ) không tính dropped.
 */
```

Kiểu dữ liệu :50-71: `RevenuePeriod = "month" | "quarter" | "year"`;
`RevenueBucket { key; label; issued; collected }`; `RevenueSeries { buckets;
dropped }` — "oldest first; empty periods stay at 0/0".

## EV-4 — Máy chủ serialize mốc ISO + cổng vai (S13)

apps/server/src/routes/snapshot.ts:87-91, trích nguyên văn:

```
	// #343 — `timestamp_ms` lands as a JS Date; the wire convention is an
	// explicit ISO string (same as the other createdAt projections below).
	return rows.map((row) => ({
		...row,
		createdAt: row.createdAt.toISOString(),
	}));
```

Cổng vai ẩn dữ liệu (:348): `financeAllowed ? loadInvoices(db, orgId) :
Promise.resolve([])` — vai thiếu quyền nhận mảng hóa đơn RỖNG trong bản chụp,
các mảng khác (reports/notifs/comment-bank :349-351) vẫn như thường.
Nạp hóa đơn join student cùng org, sort `createdAt, id` (:61-86).

## EV-5 — Danh sách vai tài chính (S18)

packages/auth/src/role.ts:70-87, trích nguyên văn phần then chốt:

```
export const FINANCE_ROLES = ["teacher", "owner", "admin"] as const;
```

Docblock :72-74: "Allowlist nghiêm ngặt (least privilege): mọi giá trị khác
(rỗng, null, lạ) đều bị chặn truy cập Sổ công nợ / Doanh thu / API tài chính."
Hàm kiểm `canAccessFinance` :85-87 tra bản đồ cứng :79-83.

## EV-6 — CF-1: chú thích polling tại trang (S6)

apps/web/src/routes/_auth/tuition/index.tsx:66-82, trích nguyên văn:

```
	// Issues #62/#135 — every number on this page derives from the kernel
	// store; nothing is hardcoded. The command bus refetches after mark-paid,
	// so totals track the server without local arithmetic.
	const { collected, outstanding } = tuitionTotals(data.invoices);
	// Stat "Chưa khớp" = số hóa đơn chưa thu đủ (cùng nguồn với queue
	// "Giao dịch chưa khớp" bên dưới).
	const unmatchedCount = data.invoices.filter(
		(i) => i.status !== "paid" || i.paidAmount < i.amount,
	).length;
	// "Hôm nay" một lần cho cả bảng (#322) — badge "Quá hạn" suy ra từ `due`.
	const today = todayISOVietnam();
	// #343 — bucket doanh thu theo múi giờ đã xử lý trong helper
	// (Asia/Ho_Chi_Minh); kỳ hiện tại tự cập nhật khi polling snapshot.
	const revenue = useMemo(
		() => revenueByPeriod(data.invoices, period, new Date()),
		[data.invoices, period],
	);
```

Đối chứng: apps/web/src/lib/query-client.ts:9-24 — `staleTime: Infinity`,
`refetchOnWindowFocus: false`, `refetchOnReconnect: false`.

## EV-7 — Poll duy nhất của cụm nhắm lịch sử giao dịch, không phải bản chụp (S6)

apps/web/src/routes/_auth/tuition/$invoiceId.tsx:125-137, trích nguyên văn:

```
	// Poll lịch sử giao dịch độc lập với payment timer (tránh race lệch pha):
	// dừng khi payment lỗi, đã kết luận payable=false, hoặc hết cap 15 phút
	// (cùng mốc với payment — vốn tự reset khi tab visible lại). Lần fetch
	// cuối khi tiền về đảm bảo bởi paidAmount-watch invalidate.
	const transactions = useQuery({
		...invoiceTransactionsQueryOptions(inv.id),
		refetchInterval: () => {
			if (payment.isError) return false;
			if (payment.data && !payment.data.payable) return false;
			if (Date.now() - openedAt >= POLL_CAP_MS) return false;
			return POLL_INTERVAL_MS;
		},
	});
```

## EV-8 — Biểu đồ: dropped, aria, nhóm nút, trạng thái rỗng (S7)

apps/web/src/components/tuition/revenue-chart.tsx, trích nguyên văn:

:132-138 (console.warn):

```
	useEffect(() => {
		if (dropped > 0) {
			console.warn(
				`[revenue] bỏ qua ${dropped} hóa đơn không đọc được ngày phát hành — không nằm trong biểu đồ doanh thu.`,
			);
		}
	}, [dropped]);
```

:140-142 (nhãn ảnh):

```
	const ariaLabel =
		`Biểu đồ doanh thu ${PERIOD_WINDOW_TEXT[period]}, đã thu tổng ${fmtVND(collectedTotal)}` +
		(dropped > 0 ? `, bỏ qua ${dropped} hóa đơn không đọc được ngày` : "");
```

:150-157 (nhóm nút kỳ, chú thích biome tại :150 giữ role="group"):

```
	<div role="group" aria-label="Kỳ doanh thu" className="flex gap-1">
		{PERIODS.map((p) => (
			<button
				type="button"
				key={p.value}
				aria-pressed={p.value === period}
				data-testid={`revenue-period-${p.value}`}
```

:173-184 (trạng thái rỗng, testid :176):

```
	<div
		className="flex min-h-[200px] items-center justify-center rounded-md border border-border bg-muted"
		data-testid="revenue-chart-empty"
	>
		<p className="text-center text-muted-foreground text-sm">
			Chưa có hóa đơn nào trong {PERIOD_WINDOW_TEXT[period]}.
			{dropped > 0
				? ` ${dropped} hóa đơn không đọc được ngày phát hành nên không thể xếp kỳ.`
				: ""}
		</p>
	</div>
```

Điều kiện rỗng :129-130: `isEmpty = buckets.every((b) => b.issued === 0 &&
b.collected === 0)`; tiêu đề khối "Doanh thu" :147-149.

## EV-9 — Bảng báo cáo tuần: 11 cột, không tiền — BIÊN GIỚI (b) (S3)

packages/db/src/schema/report.ts:9-29, liệt kê cột từ khai báo: id (PK),
org_id (cascade), student_id (cascade), period (default ""), sessions
(default 0), status ("read"|"sent"|"draft", default "draft"), sent (default
""), read (default ""), content (default ""), channel (default ""), created_at
(timestamp_ms, default unixepoch*1000). Docblock :8 nguyên văn: "Org-scoped
parent report projection; created via POST /api/reports (#173). Real delivery
is not wired — channel is metadata." Hai index :31-34
(report_org_created_idx, report_student_idx).

## EV-10 — Bảng hóa đơn: 4 cột báo cáo đọc (S14)

packages/db/src/schema/invoice.ts:28-48: id, org_id, student_id, enrollment_id,
amount (integer notNull), status (default "unpaid"), due, note, date, type,
method, payment_code, pay_token, paid_amount (integer notNull default 0),
created_at (timestamp_ms). Bốn cột feature này đọc: amount :36, status :37,
paid_amount :45, created_at :46-48. Cột thanh toán payment_code/pay_token :43-44
thuộc luồng thu tiền (tuition-invoicing).

## EV-11 — Negative-search: outputs gốc (ngày chạy 2026-11-12)

- NS1 `grep -rni "revenue" apps/server/src --exclude-dir=node_modules
  --exclude-dir=dist | grep -v '\.test\.'` → rỗng (0 dòng).
- NS2 `find apps/web/src \( -path '*i18n*' -o -name '*.json' \) | grep -v
  node_modules` → rỗng.
- NS3 `grep -rni "csv\|xlsx\|excel" apps/web/src/routes/_auth/tuition
  apps/web/src/components/tuition --exclude-dir=node_modules` → rỗng.
- NS4 (ky) — chỉ 2 tệp: index.tsx:47,48,49,64,87,278 và
  $invoiceId.tsx:39,40,41,140.
- NS5 (RevenueChart) — 9 dòng, chỉ index.tsx + revenue-chart.tsx (mục B bảng
  #6 trong reverse-gaps.md).
- NS6 `grep -ni "amount\|paid\|money\|vnd" packages/db/src/schema/report.ts`
  → rỗng.
- NS7 `grep -rni "report" apps/web/src/lib/tuition-from-kernel.ts` → rỗng.
- NS8 (PARENT_REPORTS_ENABLED) — định nghĩa
  apps/web/src/lib/features.ts:7 `export const PARENT_REPORTS_ENABLED = false;`
  (nguyên văn); dùng tại reports.tsx:13,17; students/$studentId.tsx:28,218,382;
  sidebar.tsx:24,121 (`enabled: PARENT_REPORTS_ENABLED,` :121); 2 tệp test.
- NS9 (refetchInterval) — 6 dòng ở 4 tệp, không có index.tsx của trang Doanh
  thu (mục B bảng #4).
- NS10 `grep -rn "doanh\|revenue" apps/server/src/routes
  --exclude-dir=node_modules` → chỉ vocab-teacher.test.ts:485-486 (d6c0f6b5; HEAD = 489-490).
- NS11 `grep -rni "doanh thu\|revenue" apps/student/src apps/landing/src
  apps/profile/src --exclude-dir=node_modules | grep -v '\.test\.'` → rỗng (landing/profile là app tĩnh không có src/ — quét thật chỉ apps/student/src; rà toàn apps/landing + apps/profile vẫn 0 match).
- NS12 (cron/scheduler/mailer) — không dòng nào chạm hóa đơn (mục B bảng #6).

## EV-12 — R1: outputs đếm kiểm thử (ngày chạy 2026-11-12)

```
apps/web/src/lib/tuition-from-kernel.test.ts | test/it=64 | describe=10 | skip/only/todo=0
apps/web/src/routes/_auth/tuition/index.test.tsx | test/it=5 | describe=3 | skip/only/todo=0
apps/web/src/components/layout/sidebar.test.tsx | test/it=17 | describe=7 | skip/only/todo=0
apps/e2e/specs/tuition-revenue-chart.spec.ts | test/it=2 | describe=0 | skip/only/todo=0
apps/e2e/specs/student-tuition-summary.spec.ts | test/it=2 | describe=0 | skip/only/todo=0
```

Nhóm kiểm định doanh thu trong tuition-from-kernel.test.ts: describe tại dòng
63, 91, 108, 127, 168, 433, 477 (revenueByPeriod #343), 679, 707, 1015; các
test luật tiền: mark-paid đủ tiền :483-502, partial :505-522, overpaid
:524-541, cửa sổ :562-585, biên múi giờ :610-644, dropped :666-676.

## EV-13 — e2e feature (S5) — mô tả + cite, không trích nguyên văn

- apps/e2e/specs/tuition-revenue-chart.spec.ts:16-18 — tuyên bố KHÔNG assert
  hình học SVG, chỉ chữ/nhãn/địa chỉ.
- :31-43 — helper mốc giữa tháng (lastMonthMs/thisMonthMs); câu SQL INSERT tạo hóa đơn với `created_at` ISO nằm ở :63-77.
- :117-165 — test 1: mở /tuition, thấy KPI (1.500.000đ với hóa đơn mark-paid),
  biểu đồ 2 tháng; :125-135 — seed trực tiếp bằng SQL hóa đơn mark-paid shape (status "paid", paid_amount 0); spec không mở modal "Thu học phí" nào (luồng modal nằm ở index.test.tsx:102-151).
- :158-177 — assert KPI + nhãn trục + legend; :167-177 — nhãn T…/Q….
- :179-195 — test toggle Quý → `?ky=quarter`, nhãn trục Q…, nhãn tháng biến mất.
- :198-209 — test 2: `?ky=` lạ → trang sống, ô rỗng testid revenue-chart-empty.
- :150-153 — ghi nhận dữ liệu gieo sau login cần tải lại trang mới thấy.

## EV-14 — Bảng đếm dòng nguồn (awk END NR, ngày chạy 2026-11-12)

| Tệp | Số dòng |
|---|---|
| apps/server/src/routes/reporting/index.ts | 153 |
| apps/server/src/routes/reporting/loaders.ts | 62 |
| packages/db/src/schema/report.ts | 35 |
| apps/web/src/routes/_auth/reports.tsx | 191 |
| apps/e2e/specs/tuition-revenue-chart.spec.ts | 209 |
| apps/web/src/routes/_auth/tuition/index.tsx | 376 |
| apps/web/src/components/tuition/revenue-chart.tsx | 258 |
| apps/web/src/lib/tuition-from-kernel.ts | 710 |
| apps/web/src/lib/tuition-from-kernel.test.ts | 1470 |
| apps/web/src/routes/_auth/tuition/index.test.tsx | 178 |
| apps/web/src/lib/repos/invoices.ts | 35 |
| apps/web/src/lib/mock-data.ts | 352 |
| apps/server/src/routes/snapshot.ts | 873 |
| packages/db/src/schema/invoice.ts | 61 |
| packages/api/src/contracts.ts | 4801 (HEAD; d6c0f6b5 = 4799, chênh +2 tại ~1968 — mã lỗi #675, không đụng range trích <1968) |
| apps/web/src/lib/format-invoice.ts | 56 |
| apps/web/src/lib/use-finance-route-guard.ts | 31 |
| packages/auth/src/role.ts | 177 |
| apps/web/src/components/layout/sidebar.tsx | 214 |
| apps/web/src/components/command-search/search-index.ts | 239 |
| apps/web/src/lib/query-client.ts | 49 |
| apps/web/src/lib/repos/kernel.ts | 834 |
| apps/web/src/lib/week-grid.ts | 210 |
| apps/web/src/lib/data-provider.tsx | 190 |
| apps/e2e/specs/student-tuition-summary.spec.ts | 218 |
| plans/261007-1628-tuition-revenue-stats/plan.md | 123 |
| plans/journals/2026-10-08-plan-doanh-thu-issue-343-red-team-bt-3-critical-cng-thc-reve.md | 33 |
| plans/journals/2026-10-08-cook-261007-1628-doanh-thu-chart-issue-343.md | 23 |
| apps/web/src/lib/features.ts | 15 |

## EV-15 — Bằng chứng đã xác minh bằng cite (không trích lại)

- Câu chặn quyền — nguyên văn dòng 6
  apps/web/src/lib/use-finance-route-guard.ts:6:
  `FINANCE_FORBIDDEN_TOAST = "Bạn không có quyền xem Sổ công nợ"`;
  docblock :9-14 giải thích cổng dùng chung tài chính; hàm :16-29 điều hướng
  về /dashboard.
- Mục "Doanh thu" trên điều hướng: apps/web/src/components/layout/sidebar.tsx:109
  (nhóm Kinh doanh); lọc vai :128-145; mục "Báo cáo" cụm khác gắn cờ :117-121
  (NS8: `enabled: PARENT_REPORTS_ENABLED,` tại :121).
- Bảng chọn lệnh: apps/web/src/components/command-search/search-index.ts:179-193
  — dùng chung danh sách nav + lọc mục tắt.
- Ánh xạ mốc: apps/web/src/lib/repos/invoices.ts:30-33 —
  `Date.parse(row.createdAt) || 0` kèm chú thích an toàn hỏng; bản ghi :33.
- Hợp đồng đường truyền: packages/api/src/contracts.ts:1768-1796
  (KernelInvoiceRow, docblock mốc ISO :1786-1795); bản chụp khai báo
  invoices/reports :1939-1940.
- Kiểu client: apps/web/src/lib/mock-data.ts:134-155 (Invoice.createdAt ms
  :151-154), định dạng tiền fmtVND :330.
- Làm mới sau ghi: apps/web/src/lib/data-provider.tsx:101-108 (bus refetch);
  cổng nạp + lỗi :78-88, :175; khóa truy vấn
  apps/web/src/lib/repos/kernel.ts:669-679; nạp bản chụp :622-667.
- "Hôm nay" Việt Nam dùng chung: apps/web/src/lib/week-grid.ts:21-36.
- Giữ kỳ qua chi tiết: apps/web/src/routes/_auth/tuition/$invoiceId.tsx:33-43
  (validateSearch cùng luật, chú thích #345 :33-34), :140 (backSearch),
  :145-155 (nút "← Doanh thu").
- Plan #343: plans/261007-1628-tuition-revenue-stats/plan.md — quyết định
  28-34, mục tiêu 46-52, phi mục tiêu 54-58, hệ số 18-20, nghiệm thu 68-79.
- Nhật red-team: plans/journals/2026-10-08-plan-doanh-thu-issue-343-red-team-bt-3-critical-cng-thc-reve.md:15-21
  (3 lỗi nghiêm trọng: công thức tiền, serialize mốc, e2e sai app).
- Nhật cook: plans/journals/2026-10-08-cook-261007-1628-doanh-thu-chart-issue-343.md:16
  (store nạp bản chụp MỘT LẦN lúc login), :19 (toggle trùng nhãn Q),
  :23 (tuyên bố bản ghi lịch sử).
- Mount route cụm tuần: apps/server/src/routes/kernel.ts:3496-3498.
- Trang bị ẩn cụm (c): apps/web/src/routes/_auth/reports.tsx:15-22.
