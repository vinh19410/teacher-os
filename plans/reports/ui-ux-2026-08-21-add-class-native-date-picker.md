---
type: ui-ux-review
date: 2026-08-21
scope: add-class-native-date-picker
cwd: /Users/vinhtran/Documents/project/personal/teacher-os
---

# UX/UI review: popup “Tạo lớp mới”

## Kết luận

Đổi sang native date picker là thay đổi phù hợp với UI product hiện tại: giữ nguyên `Field`, border, radius, padding và grid 2 cột; chỉ đổi control sang `type="date"`. Không cần thư viện hoặc wrapper date picker mới.

## Đề xuất

### 1. Giữ style hiện tại

- Sửa control tại [add-class-modal.tsx:210-215](../../apps/web/src/components/modals/add-class-modal.tsx:210), giữ nguyên `Input` cục bộ và `controlClasses` trong [field.tsx:14-15](../../apps/web/src/components/ui/field.tsx:14).
- `packages/ui/src/components/input.tsx` không điều khiển popup này; không cần sửa shared primitive.
- Giữ native calendar affordance, không ẩn icon hoặc dựng popover riêng.
- Native input hiển thị format theo locale của browser. Không nên cố ép `dd/mm` bằng placeholder; nếu cần hint, dùng helper text “Chọn ngày từ hôm nay”.
- `text-sm` hiện là 14px. Nếu cần tránh auto-zoom trên iOS, cân nhắc chỉ nâng date input lên 16px ở mobile, không đổi bố cục.

### 2. Label và lỗi accessibility

- Label hiện đã được nối đúng với input đơn: `Field` tự inject `id` và dùng `htmlFor` ([field.tsx:30-45](../../apps/web/src/components/ui/field.tsx:30)). Giữ `label="Ngày bắt đầu *"` nếu ngày bắt đầu là bắt buộc.
- Không nên đưa lỗi ngày bắt đầu vào `error` chung đang gắn ở field “Tên lớp” ([add-class-modal.tsx:124](../../apps/web/src/components/modals/add-class-modal.tsx:124)); cách đó dễ khiến screen reader đọc lỗi sai field.
- Nên có lỗi riêng ngay dưới date input, với `aria-invalid="true"` và `aria-describedby` trỏ tới phần tử lỗi. Có thể bổ sung wiring này trong `Field` cho single native control, chỉ thay đổi attribute, không đổi layout.
- Giữ một `role="alert"` cho summary lỗi chung ([add-class-modal.tsx:218-221](../../apps/web/src/components/modals/add-class-modal.tsx:218)); tránh render cùng một thông báo hai lần.
- Khi submit lỗi, focus vào date input nếu đó là lỗi đầu tiên đang hiển thị. Modal hiện chỉ focus control đầu tiên lúc mở ([modal.tsx:42-59](../../apps/web/src/components/ui/modal.tsx:42)).

### 3. `min` và format dữ liệu

- Native date input yêu cầu value dạng `YYYY-MM-DD`; giá trị hiện tại `"19/08"` ([add-class-modal.tsx:49](../../apps/web/src/components/modals/add-class-modal.tsx:49) sẽ không phải value hợp lệ của `type="date"`.
- Nếu rule sản phẩm là lớp mới không được bắt đầu trong quá khứ, đặt `min` bằng ngày hiện tại theo **local timezone**, không dùng `new Date().toISOString().slice(0, 10)` vì có thể lệch ngày quanh mốc UTC.
- Giá trị mặc định hiện tại phải được thay thế bằng ngày local hôm nay hoặc để trống để người dùng chọn. Không để mặc định `19/08` khi `min` đã là hôm nay.
- Để không phá contract đang lưu raw string và các dữ liệu hiển thị `DD/MM` ([contracts.ts:58](../../packages/api/src/contracts.ts:58), [kernel.ts:253](../../apps/server/src/routes/kernel.ts:253)), nên giữ state/input ở ISO và convert khi submit sang format hiện tại. Đổi storage sang ISO đầy đủ là một migration riêng, ngoài scope này.

### 4. Thông báo validation tiếng Việt

Khuyến nghị validate thủ công trước `run`, đồng thời vẫn truyền `min` để native picker chặn lựa chọn không hợp lệ:

- Trống: `Vui lòng chọn ngày bắt đầu.`
- Nhỏ hơn hôm nay: `Ngày bắt đầu không được trước hôm nay.`
- Giá trị không hợp lệ: `Ngày bắt đầu không hợp lệ. Vui lòng chọn lại.`

Không nên chỉ dựa vào thông báo constraint mặc định của browser vì ngôn ngữ phụ thuộc locale máy người dùng. Nếu giữ native constraint validation, cần nối `onInvalid`/`setCustomValidity`; nếu muốn toàn bộ message hiển thị thống nhất trong popup, dùng guard thủ công và liên kết lỗi với input như trên.

## Checklist QA ngắn

- Chọn ngày bằng chuột, bàn phím và mobile native picker.
- Ngày trước hôm nay không chọn được; ngày hôm nay chọn được.
- Submit khi trống/lỗi: lỗi tiếng Việt nằm ngay dưới field, focus không mất khỏi context.
- Kiểm tra 375px: input không bị cắt, calendar affordance vẫn dùng được.
- Kiểm tra API payload sau submit vẫn đúng format đang được màn class detail hiển thị.

## Unresolved Questions

- Product có thực sự cấm ngày bắt đầu trong quá khứ không? Nếu cần nhập lớp đã bắt đầu, không nên áp `min=today` trên mọi trường hợp.

Status: DONE_WITH_CONCERNS
Summary: Có thể đổi native date picker trong cùng control/style; cần quyết định rule ngày quá khứ và xử lý tương thích ISO input với format lưu hiện tại.
Concerns/Blockers: Endpoint guideline online trả 404 trong phiên review; đánh giá dựa trên UI Pro Max checklist và source code hiện tại.
