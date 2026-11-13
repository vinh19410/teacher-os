---
feature: student-practice
type: reverse-gaps
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-gaps — student-practice

## OQ (câu hỏi mở — kèm 🟡 trong spec)

- **OQ-01. (ĐÃ CHỐT — không còn mở).** Phạm vi feature gồm CẢ HAI domain: SRS từ vựng
  (phân hệ A) và catalog luyện đề IELTS #378 (phân hệ B, S57..S69) — quyết định điều phối
  sau audit draft; không feature nào khác trong plan phủ catalog luyện đề. Phân tách ghi ở
  Mục 1 spec; vòng đời attempt đầy đủ vẫn thuộc feature student-quiz (chỉ cross-ref).
- **OQ-02.** `docs/srs-spec.md` bị dẫn chiếu trong code (comment hợp đồng `gradeGood`,
  comment overview "per spec §5", vectors README) nhưng file không tồn tại trong repo.
  Negative-search: `ls docs/srs-spec.md` → không có; grep "srs-spec" trỏ về comment + dist.
  Tài liệu gốc nằm ở đâu (repo khác, wiki, đã xóa)?
- **OQ-03.** `VOCAB_WORD_NOT_FOUND`: grep toàn src → chỉ xuất hiện trong contracts.ts
  (khai báo) và vocab-teacher.ts (API giáo viên). API học viên không bao giờ trả mã này.
  Nghiêng về: mã dùng chung nhóm vocab cho phía giáo viên. Cần xác nhận không còn route
  học viên nào định dùng.
- **OQ-04.** BR-04 ôn sớm: server trả card nhưng không ghi log/không đổi lịch
  (vocab.ts:962-977 — guard theo dueAt). Là thiết kế "luyện tự do không tính điểm"?
- **OQ-05.** `UPCOMING_WINDOW_MS = 3_600_000` (vocab.ts:58): nguồn con số 1 giờ?
- **OQ-06.** `LIBRARY_DECK_BASE_MS = 1_700_000_000_000` (vocab-provision.ts:24): mốc epoch
  cố định làm fallback neo lịch thẻ thư viện. Fallback an toàn hay chủ ý đồng bộ cả khóa?
- **OQ-07.** `selectNewCards` lấy toàn bộ thẻ mới sắp theo hạn, không cap
  (learn-session.ts:119-128). Bộ từ lớn → phiên dài. Có cần cap?
- **OQ-08.** Nhãn stat "Thành thạo (L5) · Nhớ" (vocabulary/index.tsx:161-227): chữ "Nhớ"
  có ý nghĩa nghiệp vụ riêng?
- **OQ-09.** Retention = % lượt không "again" trên toàn bộ lịch sử (vocab.ts:688-691).
  Nghiệp vụ có cần cửa sổ thời gian? Ngưỡng mục tiêu?
- **OQ-10.** Fallback ôn sớm khi pool đến hạn rỗng (review-session.ts:96-119): khuyến khích
  ôn sớm hay chỉ lấp thời gian? (cặp với OQ-04)
- **OQ-11.** typingHint giữ chữ cái đầu chỉ ở mức ≤2 (quiz-rules.ts:37-52): ngưỡng từ đâu?
- **OQ-12.** Self-check hạng C (quiz-generator.ts:244-271): tin học viên tự chấm — có cần
  cơ chế đối chiếu sau?
- **OQ-13.** Phân hệ B: chỉ có catalog tĩnh + làm đề; không có gợi ý đề theo band/lịch sử
  trong repo. Mục tiêu nghiệp vụ gốc của "tự luyện" cần xác nhận.
- **OQ-14.** Gợi ý GV chỉ xuất hiện ở tổng quan; chưa thấy kênh nhắc khác trong repo.
- **OQ-15.** Nút phát âm chỉ trong prompt phiên; trang bộ từ không có nghe thử.

## GAP (khoảng trống chứng minh)

- **GAP-1.** Không có i18n catalog: grep toàn apps/student không thấy hàm dịch/tệp locale;
  mọi wording là literal trong TSX. Hệ quả: đổi wording phải sửa code (R2 chỉ có 1 nguồn
  mỗi câu chữ).
- **GAP-2.** Không có test cho wording UI ngoài e2e assert chuỗi tại chỗ (S45/S46);
  unit test component không assert câu chữ tổng quan.
- **GAP-3.** Không test trực tiếp cho E-14 (503 media storage unavailable) trong S43 —
  hành vi đọc từ code (vocab.ts:1183-1190), chưa có assert.
- **GAP-4.** Không test cho nhánh `upcomingCount` khi nextDueAt null (vocab.ts:624-630) —
  suy từ mã, e2e chỉ phủ có countdown.
- **GAP-5.** Không có test cho redirect legacy từ `/vocab/<đường con>` ở tầng unit
  (chỉ e2e S46:232-237 phủ 1 trường hợp).
- **GAP-6 (R1).** Quét skip/todo/only/fails trong các test của feature
  (S43, S44, S45-S55): không có test nào bị bỏ — mục này rỗng.

## INF (suy luận nhiều bằng chứng — 🔵)

- **INF-1.** Server giữ không trạng thái phiên: bằng chứng (a) answer/learn-commit nhận
  từng lượt độc lập với clientLogId do client sinh; (b) hàng đợi/pool do client engine
  dựng từ session-data; (c) LearnSession/ReviewSession là object thuần trong packages/api
  không đụng DB.
- **INF-2.** Thứ tự ưu tiên nguồn bộ từ Lớp > Gợi ý > Thư viện: vòng gán lần lượt
  (vocab-provision.ts:201-239) + nhãn hiển thị client "Gợi ý"/"Khóa"/"Lớp".
- **INF-3.** Mã lỗi đồng nhất AUDIO_NOT_FOUND cho mọi thất bại upstream là chủ ý chống dò
  (SSRF/enumeration): mọi nhánh lỗi trong proxyRemoteAudio đều về cùng một helper notFound.
- **INF-4.** Vectors là "hợp đồng kép" server+client: scheduler.test và quiz-rules.test cùng
  đọc level-vectors.json; script verify:vectors chạy --check để chống drift.

## CF (xung đột dữ liệu)

- Không phát hiện xung đột giữa mã ↔ test ↔ migration trong phạm vi này.
