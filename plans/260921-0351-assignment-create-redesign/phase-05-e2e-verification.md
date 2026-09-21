---
phase: 5
title: "E2E & verification sweep"
status: todo
priority: P1
effort: "3h"
dependencies: ["4"]
---

# Phase 5: E2E & verification sweep

## Goal

Khóa hành vi thật bằng Playwright: 2 test Writing hiện tại phải xanh nguyên vẹn (không sửa), thêm luồng Reading ready (đáp án đầy đủ → chấm tự động → sống qua reload → hiện ở bank) và Listening draft (không file/đáp án vẫn lưu draft; ready bị chặn thiếu file). Kết thúc bằng verification sweep toàn repo (`pnpm check && pnpm check-types && pnpm test`).

## Context Links

- Spec: [../research/design-spec.md](../research/design-spec.md) (§5 state machine — nguồn assertion chặn ready; §6 success card)
- Spec E2E hiện tại: `apps/e2e/specs/assignment-prompt-create.spec.ts` (2 test: ready + draft, assert survive-reload; helper `signUpViaUi` ở `apps/e2e/specs/helpers.ts:9`)
- Cấu hình Playwright: workers 1, chromium, TZ Asia/Ho_Chi_Minh, boot API :8000 + vite :8001, `reuseExistingServer: false` (port strictPort — port bận là fail)
- Mock tham chiếu template reading/listening: `assignment-create-5.html` dòng 466–560 (reading p1 tfng: 8 câu có sẵn answer; listening s1 form: 6 câu)

## Key Insights

- **Template autofill giúp E2E nhanh**: chọn Reading → Passage 1 → type True/False/NG, form tự fill passage + 8 câu kèm đáp án (dirtyMain=false) → chỉ cần đổi title rồi submit ready. Listening tương tự (6 câu có đáp án, nhưng chưa có audio).
- **Assertion "chấm tự động" là hợp đồng mới quan trọng nhất**: success card phải hiện "Tự động · 8/8 đáp án đã khóa"; bank list phải hiện đề sau reload (persist thật qua kernel).
- **Chặn ready phải thấy được**: chọn listening + status "Sẵn sàng giao" khi chưa có file → nút submit disabled + action copy "Thiếu file nghe" (§5 bậc 2); bấm "Dùng file mẫu Cambridge 10" mới mở khóa.
- Test cũ khóa label: giữ nguyên mọi label đã liệt kê ở phase 3 Key Insights — nếu test cũ đỏ, đó là regression của phase 3, sửa code chứ không sửa test.

## Requirements

### Functional

- Sửa `apps/e2e/specs/assignment-prompt-create.spec.ts`: giữ nguyên 2 test hiện tại; thêm:
  1. **"create a ready reading prompt with answer key, survive reload"**: signUpViaUi → `/assignments/new` → chip "Reading" → passage + 8 câu + đáp án tự fill (template) → fill Tiêu đề "QC-218 Reading TFNG" → submit "Lưu vào ngân hàng" → success heading "Đã thêm vào ngân hàng" + meta "Tự động · 8/8 đáp án đã khóa" → reload `/assignments/new` → bank card (heading "Đề Reading đã có") chứa title → vào `/assignments/bank` → filter Kỹ năng "Reading" → thấy đề. **Assert không lộ đáp án bằng sentinel an toàn (finding R5)**: KHÔNG dùng chuỗi "NOT GIVEN"/"TRUE"/"FALSE" (xuất hiện hợp lệ trong intro template mà preview vẫn phải hiện theo §4) — thay vào đó assert preview không chứa label "Đáp án đúng" và không chứa chuỗi key-scan dạng `"1 FALSE"` (số thứ tự + đáp án chỉ tồn tại ở composer); test Listening có thể dùng đáp án text "Clarke" làm sentinel tuyệt đối.
  2. **"create a listening draft without audio; ready is blocked"**: chip "Listening" → 6 câu + đáp án tự fill (template) → chip "Sẵn sàng giao" → expect nút submit disabled + action copy "Thiếu file nghe" (§5 bậc 2) → bấm "Dùng file mẫu Cambridge 10" → expect submit enabled (đủ file + đủ đáp án) → xóa nội dung input đáp án câu 1 → expect disabled + "Thiếu đáp án chấm tự động" (§5 bậc 3) → điền lại đáp án → "Gỡ file" → chọn "Bản nháp" → submit "Lưu bản nháp" → heading "Đã lưu bản nháp" + meta Chi tiết "Chưa đính file" + meta Chấm điểm "Tự động · 6/6 đáp án đã khóa" (draft đủ đáp án vẫn hiện khóa đủ — §6) → preview KHÔNG chứa "Clarke" (đáp án câu 1 — sentinel text) → reload → đề còn trong bank card "Đề Listening đã có".
- Mỗi test dùng title duy nhất prefix `QC-218` (tránh đụng data test khác khi chạy lại — signUpViaUi tạo org mới mỗi lần nên không cần cleanup).
- Verification sweep: chạy đủ 3 lớp + root scripts (xem Verification); ghi kết quả vào Validation Log của plan.

### Non-functional

- workers:1, không reuse server (cấu hình sẵn — không đổi); không thêm dependency mới.
- Không dùng `page.evaluate` để bypass UI — mọi thao tác qua UI thật (pattern helper hiện tại).

## Architecture (data flow)

```
UI create (template autofill) → POST /api/assignments/prompts (v2, superRefine pass)
  → 201 → snapshot refetch → success card + bank card (filter skill)
reload → GET /api/kernel → row persist → bank list /assignments/bank (filter Reading)
blocked path: canSave false → submit disabled + action copy bậc 2/3 → không POST
```

## Related Code Files

- Modify: `apps/e2e/specs/assignment-prompt-create.spec.ts` (thêm 2 test, giữ 2 cũ)
- Create/Delete: không

## Implementation Steps

1. Chạy 2 test cũ: `cd apps/e2e && npx playwright test assignment-prompt-create` — phải xanh trước khi thêm (nếu đỏ → quay sửa phase 3, không sửa test).
2. Thêm test Reading ready theo Requirements (dùng getByRole/getByLabel theo pattern file hiện tại; label cụ thể: chip "Reading", "Passage 1" tự chọn theo part đầu, input "Tiêu đề", nút "Lưu vào ngân hàng").
3. Thêm test Listening draft + các assertion chặn (disabled + action copy "Thiếu file nghe"/"Thiếu đáp án chấm tự động", nút "Dùng file mẫu Cambridge 10", "Gỡ file").
4. Chạy riêng spec: `npx playwright test assignment-prompt-create` (4 test xanh).
5. Verification sweep toàn repo theo lệnh dưới; cập nhật `## Validation Log` trong `plan.md` (kết quả từng lệnh + ngày).

## Todo

- [ ] 2 test Writing cũ chạy xanh (không sửa)
- [ ] Test Reading ready: autofill + success meta + survive reload + bank filter + preview không lộ đáp án
- [ ] Test Listening draft: chặn ready thiếu file/thiếu đáp án + draft lưu + survive reload
- [ ] Spec đầy 4 test xanh; port 8000/8001 free trước khi chạy
- [ ] Verification sweep 3 lớp + root scripts; ghi Validation Log

## Success Criteria

- 4 test E2E xanh (`assignment-prompt-create.spec.ts`), trong đó 2 test mới assert được: persist qua reload, meta chấm tự động, action copy chặn, bank filter skill.
- `pnpm check && pnpm check-types && pnpm test` xanh ở root.
- Validation Log trong plan.md có kết quả thực.

## Verification

```bash
cd apps/e2e && npx playwright test assignment-prompt-create
cd apps/server && npx vitest run
cd apps/web && npx vitest run
pnpm check && pnpm check-types && pnpm test
```

## Risk Assessment

- **R1: Port 8000/8001 bận** (strictPort) — kiểm `lsof -i :8000 -i :8001` trước khi chạy; tắt process dev cũ.
- **R2: Template autofill không kich hoạt vì dirty-flag dính** (test cũ cùng page object đã fill) — mỗi test là context mới (Playwright mặc định) + signUpViaUi tạo org mới; nếu vẫn lỗi, assert rõ giá trị pre-fill trước khi submit.
- **R3: Flaky do reload race snapshot** — dùng `await expect(...).toBeVisible()` retry-ready của Playwright (pattern test cũ); không `waitForTimeout`.
- **R4: Test Listening phụ thuộc copy "Thiếu đáp án chấm tự động"** — copy thuộc spec thiết kế §5; nếu đổi copy phải đổi cả design-spec (không đổi một mình).

## Security Considerations

- E2E tạo org thật qua UI — không seed trực tiếp DB, không bypass auth (signUpViaUi).
- Không hardcode credential; Org mới mỗi run (hậu quả: data tích luỹ ở local dev DB — chấp nhận như các spec hiện tại).

## Next Steps

- Đóng plan (status), rồi tạo GitHub issue (nếu chưa — đã tạo **#218**, xem plan.md Assumptions) + branch `vinh19410/issue-218-assignment-create-redesign` để implement.
