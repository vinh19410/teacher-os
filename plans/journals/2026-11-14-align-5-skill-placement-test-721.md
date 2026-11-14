# Nhật ký kỹ thuật — Đồng bộ Entry Test 5 kỹ năng & Kokoro TTS (#721)

- **Ngày:** 2026-11-14
- **Issue:** [#721](https://github.com/vinh19410/teacher-os/issues/721)
- **Mục tiêu:** Đồng bộ đề kiểm tra đầu vào Communication English 5 kỹ năng (`Listening`, `Grammar & Vocabulary`, `Reading`, `Writing`, `Speaking`) kèm 6 audio MP3 tổng hợp từ Kokoro TTS (`af_heart` cho hội thoại/lời nữ, `am_michael` cho hội thoại/lời nam), hỗ trợ nộp bài từ `apps/profile`, lưu R2/D1 và chấm rubric trên `/leads`.

## Quyết định kiến trúc chính

1. **Contract & Snapshot 5 kỹ năng (`packages/api/src/placement-test-contracts.ts`):**
   - Hợp nhất 5 phần cố định (`listening`, `vocab-grammar`, `reading`, `writing`, `speaking`), hỗ trợ câu điền từ chuẩn hóa (`normalizePlacementGapAnswer`) trong Listening bên cạnh MCQ 3–4 lựa chọn, 4 loại bài Reading (`sign`, `message`, `passage`, `cloze`), Writing đếm từ (`minWords`/`maxWords`) và Speaking (`prepSeconds`/`answerSeconds`).
   - Bổ sung `normalizePublishedPlacementSnapshot` dùng chung logic chuyển ngưỡng theo số câu sang `%` (`buildUpgradedLegacyBands`) để `GET /public/placement-test` và `POST /public/placement-test/submissions` không bị crash trên snapshot `published` v1 đang lưu sẵn trong D1; `gradePlacementObjective` tra phần thi theo `id` thay vì chỉ số mảng cố định.
   - Quy tắc tổng hợp điểm 5 kỹ năng (`computePlacementFinal`): trung bình `%` các kỹ năng có điểm, áp dụng phạt hạ tối đa 1 bậc CEFR khi Speaking thấp hơn tổng thể từ 2 bậc trở lên, hoặc gợi ý cân nhắc lớp cao hơn khi Speaking vượt >= 2 bậc.

2. **Database & API công khai (`0070_giant_shinobi_shaw.sql`, `public-placement-test.ts`, `leads.ts`):**
   - Lưu snapshot đề tại thời điểm nộp (`snapshot_json`), đáp án 3 phần tự động, bài Writing, metadata + object key R2 Speaking (`upload_token` hash dùng 1 lần, kiểm định magic bytes qua `peekStream`), và điểm rubric giáo viên chấm.
   - `POST /submissions` kiểm soát giới hạn IP (5 lần / 15 phút) và trần ngày (50 bài / ngày) bằng câu `INSERT ... SELECT ... WHERE ... RETURNING id` nguyên tử với mốc `timestamp_ms` (epoch ms), đồng thời **chỉ gộp Lead trong 24h khi Lead chưa có bài chấm chính thức (`status = 'graded'`)** để không bao giờ ghi đè kết quả Cô Mỹ đã chốt.
   - `PUT /submissions/:id/speaking-media` dọn object R2 (`discardObject`) cả khi gặp conflict token lẫn khi cập nhật D1 ném lỗi.

3. **Frontend học viên & Giáo viên (`apps/profile`, `apps/web`):**
   - `/kiem-tra-dau-vao/`: cổng Lead gate, đồng hồ gợi ý 40 phút, khóa giới hạn phát âm thanh không trừ oan lượt khi `AbortError`/lỗi tải, `CEFR Explorer` đồng bộ trực tiếp theo `snapshot.bands`, `MediaRecorder` quay Camera+Mic / Audio-only / Bỏ qua, hỗ trợ `prepSeconds === 0` và kết quả **Tạm tính** kèm deep link sang biểu mẫu tư vấn trang chủ.
   - `/placement-test` & `/leads`: sửa bug mất dấu phẩy ở ô `acceptDraft`, dùng `BoundedNumberInput` cho tham số số từ/giây, giữ state chấm rubric khi query nền refetch (`hydratedKey = submission.id + gradedAt`), phát lại R2 media qua Blob URL có cookie phiên, và layout responsive 3 viewport (1440×900, 768×1024, 375×812) + dark mode.

## Kiểm thử & Review đã hoàn tất

- `pnpm exec biome check .`: 0 lỗi (1430 file).
- `pnpm check-types`: 12/12 package PASS.
- `pnpm test`: toàn bộ package test + root script tests PASS (0 lỗi).
- Playwright E2E cục bộ (cổng `8100..8105`): `specs/placement-test-editor.spec.ts` + `specs/profile-placement-test.spec.ts` (4/4 test PASS), đã kiểm tra 15 ảnh chụp màn hình 3 viewport & dark mode trong `plans/reports/721-*.png`.
- Code review độc lập đã xử lý trọn vẹn 2 phát hiện Critical và 6 phát hiện Important trước khi gộp nhánh.
