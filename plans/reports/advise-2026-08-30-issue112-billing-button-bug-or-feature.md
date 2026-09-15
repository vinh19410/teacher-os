# Advise: Issue #112 — nút "Quản lý thanh toán" chết: bug hay feature chưa implement?

- Ngày: 2026-08-30
- Input: [issue #112](https://github.com/vinh19410/teacher-os/issues/112) `[QC][P1] Nút Quản lý thanh toán không chạy` + flag `--github`
- Quyết định user: close #112, tạo issue enhancement mới; interim disable nút + "Sắp ra mắt"

## Verdict

#112 **không phải bug** — là mock UI cho feature billing **chưa từng được implement**. Nút render thuần `<Button>Quản lý thanh toán</Button>` không handler nào, thêm từ commit `6a63efd` (15/08) khi build UI phase 7, chưa từng chạy được. Toàn repo 0 Stripe (env/SDK/route/webhook), scaffold `--payments none` (`bts.jsonc:13,22`), không schema plan/subscription; badge "Pro – Đang dùng" hardcode cho mọi user (`settings.tsx:85-88`). Plans đã ghi out-of-scope từ trước: production-readiness plan.md:43 ("payment gateway" not included), advise pilot-first (19/08): "không cần payment gateway ở pha này"; researcher report 18/08 đã note "'Quản lý thanh toán' không onClick" = mock UI.

Symptom QC báo là thật (nút chết), nhưng classification sai: không có gì "hỏng" vì chưa có gì tồn tại. Đúng nghĩa: **UI hiển thị sớm cho feature chưa build** — lỗi ở chỗ hiển thị, không ở logic.

## What you should do

1. Comment #112 dẫn chứng + close `not planned`, remove label `bug` — backlog QC phải phản ánh đúng bug vs placeholder.
2. Tạo 1 issue enhancement mới: scope = (a) disable nút + nhãn "Sắp ra mắt" ngay; (b) wire billing portal thật khi mở scope.
3. PR nhỏ 1-file: `settings.tsx` disable nút + "Sắp ra càng" label; cập nhật `profile.contract.test.ts:116` nếu text card đổi.
4. Khi mở lại scope monetization (post-pilot): quyết định provider (Stripe vs VN-local PayOS/MoMo), thiết kế data model plan/tier/subscription, rồi mới wire nút.

## What you shouldn't do

- Đừng implement Stripe ngay vì QC gắn P1 — P1 dựa giả định nút "từng chạy". Feature out-of-scope theo plan có chủ đích.
- Đừng để #112 mở với label bug — sẽ méo metrics QC, và có nguy cơ ai "fix" bằng cách xóa nút mà mất track feature.
- Đừng build gì trên badge "Pro – Đang dùng" (hardcode, mọi user đều thấy) — không phải trạng thái thật.
- Đừng sửa cùng lúc các dead UI khác trong file (Xuất CSV, Xuất JSON, Xóa tài khoản — `settings.tsx:222-239`, copy tự nhận "bản demo") — mỗi cái một issue riêng, tránh scope creep. Nên ghi chú trong comment #112 rằng còn các dead UI tương tự.

## Cheaper paths

- Rẻ nhất: comment + close + relabel, 0 dòng code. User chọn nhỉnh hơn một bước (disable + "Sắp ra mắt") — đáng giá cho pilot UX, nhưng đừng làm quá thế.

## My take

Comment #112 (bằng chứng, không đoán) → remove bug label, close not planned → issue enhancement mới với checklist disable-trước → PR 1 file + test text → issue đó thành epic Stripe/billing portal khi roadmap mở scope monetization. Không chặn gì phía sau: chưa có data model billing nào nên disable tạm không tạo migration nợ.

## Benefits

- Backlog đúng sự thật: bug = regression, không đếm placeholder.
- Pilot user hết nút chết; giảm false-positive QC ở UAT kế tiếp.
- Quyết định scope billing ghi tường minh trên GitHub, không chỉ nằm trong plans/.

## Trade-offs

- "Sắp ra mắt" là lời hứa; nếu billing hoãn vô hạn → label treo. Điều kiện bỏ recommendation: nếu pilot đòi thu tiền SaaS thật trước khi roadmap mở scope → khi đó phải implement billing, không disable.
- Contract test khóa text "Gói dịch vụ" — phải cập nhật khi đổi text (chi phí nhỏ).
- Close P1 QC issue dễ bị hiểu là bỏ qua — comment phải dẫn chứng file:line + commit + docs.
- Viết issue mới trung lập provider (đừng hardcode "Stripe") để sau này chọn PayOS/MoMo không phải sửa issue.

## Work checklist

- [ ] Comment #112: phân tích bug-vs-feature + bằng chứng (`settings.tsx:104-106`, commit `6a63efd`, `bts.jsonc` payments:none, plan out-of-scope) + link issue mới
- [ ] `gh issue edit 112 --remove-label bug` rồi `gh issue close 112 --reason "not planned"`
- [ ] Tạo issue enhancement mới (scope: disable tạm "Sắp ra mắt" + wire billing khi mở scope; trung lập provider)
- [ ] PR: disable nút "Quản lý thanh toán" + nhãn "Sắp ra mắt" trong `settings.tsx`
- [ ] Cập nhật `profile.contract.test.ts:116` nếu text hiển thị đổi
- [ ] (Khi mở scope) quyết định provider + data model plan/subscription trước khi wire nút

## Success metrics

- `gh issue view 112 --json state,labels` → `state=closed`, không còn label `bug`
- Issue enhancement mới tồn tại với label `enhancement`, body chứa checklist trên
- Trên app: click vùng nút → disabled, hiện "Sắp ra mắt", không modal/navigation/tab mới
- CI/test xanh sau PR (kể cả contract test)
- 0 issue QC mới về nút này ở vòng UAT kế tiếp
