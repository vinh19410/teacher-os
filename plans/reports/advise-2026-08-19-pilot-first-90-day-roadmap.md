# Advise: pilot-first 90-day roadmap

- Type: advise
- Date: 2026-08-19
- Status: confirmed with user
- Scope: advisory only. Không implement.

## Reframing (đã xác nhận)

**Vấn đề.** Teacher OS đã có class-centric kernel, org scope và các module persist, nhưng chưa có bằng chứng deploy/UAT thật. Một số CTA lõi vẫn stub; dashboard không phản ánh data thật. Nếu tiếp tục mở feature theo màn hình, app sẽ có bề rộng UI nhưng không vận hành lớp thật một cách đáng tin.

**Exact requirements.**

1. Trong 90 ngày, một người full-time đưa bản production qua UAT và pilot.
2. Pilot: một giáo viên, 2–3 lớp, data thật.
3. Luồng vận hành phải xuyên suốt: học viên/lớp → tạo buổi lịch → điểm danh/cập nhật buổi → theo dõi tiến độ → một luồng ghi nhận thu phí.
4. Có E2E cho luồng lõi và log/triage phản hồi pilot.
5. Không mất data sau reload; các CTA trong luồng lõi không còn no-op/stub.

**Goals.** Giáo viên pilot có thể dùng app hằng ngày để điều hành lớp; nhóm có bằng chứng đủ mạnh để quyết định mở rộng sau ngày 90.

**Non-goals.** Parent login; Zalo/GCal; invite/org administration; dark mode; hoàn thiện reports/assignments; KPI dashboard đầy đủ, trừ khi pilot chứng minh là blocker.

**Constraints.** 1 người full-time; giữ React/TanStack, Hono, D1/Drizzle, Better Auth và org-scoped class-centric contract. Có thời gian pilot nhỏ trước khi cần mở rộng.

## Verdict

Nên đi theo **pilot-first**. Kernel persistence đã hoàn tất; rủi ro lớn nhất hiện tại không phải schema mà là khoảng cách giữa test local và hành vi production/giáo viên thật. Đừng hoàn thiện đồng thời mọi CTA. Hãy làm một vertical slice vận hành lớp đáng tin, đo nó trên pilot, rồi chỉ mở rộng phần thực sự chặn usage.

## Evidence đã xác minh

- Core persistence và command bus đã tồn tại: `docs/project-overview-pdr.md`, `apps/web/src/lib/data-provider.tsx`, `apps/server/src/routes/kernel.ts`.
- Luồng schedule/tuition/report vẫn có CTA hoặc phần hiển thị hard-code/stub: `apps/web/src/routes/_auth/schedule.tsx`, `apps/web/src/components/modals/add-invoice-modal.tsx`, `apps/web/src/components/modals/create-report-modal.tsx`.
- CI có lint/test/typecheck/build, nhưng chưa có browser E2E; deploy D1 live chưa được xác nhận: `.github/workflows/ci.yml`, `README.md`.

## Roadmap 90 ngày

| Mốc | Tuần | Outcome / gate | Phạm vi cụ thể |
| --- | --- | --- | --- |
| 0. Production readiness | 1–2 | Có staging/production và UAT có thể lặp lại | Verify migration D1/Alchemy trên môi trường live; kiểm tra Google OAuth/CORS; smoke test sign-in → org trống → CRUD kernel; ghi runbook rollback/support; sửa blocker deploy |
| 1. Pilot-ready class operations | 3–5 | Một giáo viên tạo và vận hành 2–3 lớp mà không gặp CTA lõi no-op | Hoàn thiện create/edit/cancel buổi lịch với ngày thực; attendance/completed/cancelled và progress derive; hiển thị lịch theo data thật thay weekly/static chrome; tạo E2E cho đăng nhập, student/class/enrollment, schedule, check-in/reload |
| 2. Money loop | 6–7 | Giáo viên ghi nhận khoản thu cho một enrollment và xem trạng thái đúng sau reload | Expose create invoice; giữ idempotent mark-paid; validation amount/due/status; Tuition đọc totals từ data thật trong phạm vi pilot; E2E tạo invoice → mark paid → reload |
| 3. Pilot | 8–10 | Giáo viên dùng app hằng ngày ít nhất 2 tuần | Onboard 1 giáo viên/2–3 lớp; weekly check-in; issue log gồm severity, frequency, workflow impact; SLA triage: blocker trong 1 ngày làm việc, major trong sprint |
| 4. Stabilize & decision | 11–12 | Có quyết định mở rộng dựa trên dữ liệu, không cảm tính | Fix toàn bộ pilot blockers; harden E2E regression suite; review support burden, completion rate, critical errors; chốt one-page next-quarter roadmap theo top blocker thực tế |

## What you should do

1. **Đặt production/UAT làm gate, không phải một task phụ.** Persistence được test local không đồng nghĩa migration, OAuth, CORS và D1 bindings chạy ở stage thật.
2. **Đổi schedule thành vertical slice đầu tiên.** Nó là trung tâm của vận hành lớp và mới làm progress/package metrics có ý nghĩa.
3. **Đưa invoice creation vào sau lịch, nhưng trước pilot mở rộng.** Một luồng thu tiền đơn giản có giá trị cao, không cần payment gateway/reconciliation ở pha này.
4. **Viết E2E theo workflow, không theo component.** Các test phải thực hiện thao tác giáo viên làm và xác nhận reload/refetch giữ đúng data.
5. **Pilot có kỷ luật.** Một giáo viên, 2–3 lớp, lịch check-in cố định, log issue có owner/severity. Đây là kênh quyết định scope, không phải một demo thân thiện.

## What you should not do

- Không mở parent login, Zalo/GCal, org invite hay đa giáo viên trong 90 ngày này.
- Không biến dashboard KPI đầy đủ thành điều kiện pilot. Chỉ thay số liệu nào chặn quyết định hằng ngày.
- Không “làm đủ” reports/assignments vì CTA đang có. Chúng chưa nằm trong vertical slice đã xác nhận.
- Không gọi pilot trước khi deploy/UAT và E2E của luồng lõi qua gate.
- Không thay kernel contract class-centric hay thêm state local mới để đi nhanh.

## Alternatives, ranked

| Option | Đánh giá | Trade-off |
| --- | --- | --- |
| Pilot-first: readiness → schedule → tuition → pilot | Khuyến nghị | Ít bề rộng feature lúc đầu, nhưng học nhanh và giảm rủi ro production |
| Hoàn thiện mọi CTA rồi pilot | Không chọn | UI rộng hơn nhưng feedback đến muộn; rủi ro scope vượt 90 ngày |
| Chỉ production/E2E, không mở workflow | Không đủ | Kỹ thuật chắc hơn nhưng chưa tạo giá trị vận hành mới cho giáo viên |

## My take and route

Đường tối ưu là 2 tuần để chứng minh deploy, 5 tuần để đóng vertical slice lịch + học phí, 3 tuần pilot có hỗ trợ sát, 2 tuần để xử lý bằng chứng thực tế và ra quyết định quý sau. Nếu pilot cho thấy invoice không phải pain lớn, không mở rộng tài chính; chuyển phần thời gian còn lại vào blocker có dữ liệu. Nếu người dùng không thể dùng vì thiếu đa giáo viên, parent hoặc messaging, đó là tín hiệu đổi hướng roadmap sau ngày 90, không phải thêm lén vào sprint hiện tại.

## Benefits

- Có bằng chứng production và hành vi dùng thật trước khi đầu tư mở rộng.
- Dồn năng lực vào luồng giáo viên lặp lại hằng ngày.
- E2E bảo vệ regressions ở nơi thiệt hại cao nhất.
- Pilot hẹp giúp support burden có thể kiểm soát.
- Giữ nguyên kernel đã verified, tránh rewrite schema/API.

## Trade-offs

- Reports, assignments và integrations vẫn chưa hoàn chỉnh sau 90 ngày.
- Một giáo viên pilot không chứng minh đầy đủ nhu cầu multi-tenant/multi-teacher.
- Ngày thực, attendance semantics và invoice UX có thể lộ ra thay đổi schema/UX nhỏ trong pilot.
- Recommendation này không còn đúng khi mục tiêu đổi sang bán cho trung tâm hoặc cần nhiều giáo viên cùng org; khi đó chi phí chuyển hướng là bổ sung invitation/role/admin UX, có thể làm sau vì org/membership schema đã tồn tại.

## Work checklist

- [ ] Tạo staging/production checklist: D1 migration, OAuth callback, CORS, env bindings, rollback.
- [ ] Chạy và ghi nhận UAT live: sign-in → org trống → student/class/enrollment/syllabus → hard reload.
- [ ] Define date-based lesson contract và implement create/edit/cancel schedule flow.
- [ ] Implement/verify attendance states và derived progress ở UI.
- [ ] Thay các phần lịch static liên quan trực tiếp pilot bằng data thật.
- [ ] Viết E2E cho class operations và reload persistence.
- [ ] Expose create invoice, validation và real tuition totals cho pilot scope.
- [ ] Viết E2E invoice creation → payment state → reload.
- [ ] Onboard một giáo viên pilot với 2–3 lớp và lịch weekly check-in.
- [ ] Thiết lập pilot issue log, severity, owner và SLA triage.
- [ ] Fix pilot blockers, run regression, tổng hợp metrics và quyết định roadmap quý sau.

## Success metrics

- [ ] UAT live pass: 100% các bước sign-in, bootstrap org, create student/class/enrollment/syllabus và reload data hoàn thành trên D1 stage thật.
- [ ] Critical E2E: ít nhất 2 workflow xanh trên CI: class operations và invoice/payment/reload.
- [ ] CTA integrity: 0 CTA no-op trong luồng đã chọn (tạo lịch, edit/cancel/check-in, tạo invoice, mark paid).
- [ ] Pilot activation: 1 giáo viên tạo/vận hành tối thiểu 2 lớp trong app.
- [ ] Retention pilot: giáo viên có hoạt động vận hành ở ít nhất 8 trong 10 ngày làm việc pilot.
- [ ] Reliability: 0 blocker mở quá 1 ngày làm việc; 0 mất dữ liệu được xác nhận sau reload trong pilot.
- [ ] Expansion decision: cuối tuần 12 có quyết định viết rõ “mở rộng / lặp pilot / đổi hướng”, kèm top 3 blockers theo frequency và workflow impact.

## Unresolved questions

None.
