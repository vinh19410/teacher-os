# 2026-10-22 — Plan: form trong Modal dính field (#416)

- Lỗi nằm ở cách Modal và form ghép với nhau, không phải ở Field. Thân Modal là `flex flex-col gap-4`, nhưng 11 modal truyền một `<form>` trần làm con duy nhất. Vì vậy `gap` không áp vào các field bên trong.
- Lỗi đã có từ trước #378. Label v1 là mono 11px nên khó thấy; label v2 `text-sm font-medium` làm lộ ra.
- Quyết định sửa ở primitive (`[&>form]:flex-col gap-4`, đã có tiền lệ `[&>tr]` trong data-table) thay vì vá 11 form. Lý do: modal viết sau sẽ không bị lại.
- Hệ quả cần dọn: wrapper lỗi/notice luôn render sẽ thành flex item rỗng (thêm `empty:hidden`), `mb-3` sẽ cộng dồn với gap, và selector arbitrary variant có specificity cao hơn class `gap-5` đặt trên chính form.
- Plan: `plans/261022-1436-modal-form-field-spacing/` · commit `a337b8bb`.
