---
title: "Rút gọn landing msmy.io.vn thành 8 khối, 1 CTA chính"
description: "Dựng lại apps/profile/public/index.html theo handoff nội dung mới: hero một CTA, 3 khóa có đầu ra, form 3 ô, hỏi đáp, chuyển phần tư vấn nội bộ ra khỏi trang chính."
status: pending
priority: P2
effort: 10h
issue: 600
branch: develop
tags: [profile, landing, content, api-contract]
blockedBy: []
blocks: []
created: 2026-11-04
---

# Rút gọn landing msmy.io.vn thành 8 khối

Nguồn nội dung: `.orca/drops/landing-msmy-noi-dung-moi.md` (bối cảnh: `.orca/drops/landing-msmy-rewrite-20261104-1947.md`).
Issue: #600.

## Outcome

Học viên vào trang thấy ngay một nút chính "Làm test xếp lớp miễn phí" và một link phụ Zalo. Trang còn 8 khối ngắn, form đăng ký chỉ 3 ô. Nội dung chỉ dành cho tư vấn viên không còn trên trang công khai.

## Hiện trạng (đã scout)

- `apps/profile/public/index.html` 3.9k dòng, một file, CSS và JS inline, không framework. Header đang có 3 nút CTA, hero có 3 CTA ngang hàng, 5 khối PDF, 6 bảo chứng, bảng CEFR, form 10 ô.
- Form gửi `POST /public/leads` qua `lead-api` meta. Server dùng `z.enum(LEAD_COURSES)` ở `packages/api/src/lead-contracts.ts:21`, nên mã khóa mới **bắt buộc** thêm vào enum, nếu không submit bị 400.
- Nhãn khóa hiển thị ở `apps/web/src/routes/_auth/leads/index.tsx` qua `LEAD_COURSE_LABELS`, và có test drift giữa enum với optgroup của profile.
- Luồng `?ketqua=&khoa=#dang-ky-tu-van` từ trang test đang chọn khóa bằng giá trị option, bộ đề placement cũng map band sang mã khóa cũ (`ielts-foundation`…).
- Test hiện có khóa cứng nhiều thứ: `consultForm` đúng 2 input required, honeypot, canonical, 1 `<h1>`, đúng 1 `#studentPortalLink` và 1 link kiểm tra đầu vào trong `.nav-actions`, các asset local phải tồn tại.

## Quyết định thiết kế

1. **Thêm mã khóa mới, không đổi nghĩa mã cũ.** Thêm `foundation-core`, `ielts-practical`, `workplace-interview` vào `LEAD_COURSES` (kèm nhãn và nhóm). 12 mã cũ giữ nguyên để lead cũ, bộ đề placement và trang `/leads` không vỡ. Cột `course` là text, không cần migration.
2. **Giá và chính sách là dữ liệu, không là văn bản gõ cứng.** Các chỗ `[ ... ]` render dạng "Nhắn Zalo để nhận báo giá" cho đến khi cô Mỹ điền, không hiển thị placeholder ra công khai và không bịa số.
3. **Trang nội bộ cho tư vấn viên** đặt ở `apps/profile/public/noi-bo/` với `noindex`, không link từ nav. Nội dung chỉ là kịch bản chat, không chứa dữ liệu nhạy cảm nên không cần auth.
4. **Hộp "05 suất miễn phí" bỏ hẳn** vì chưa có nguồn đếm thật.
5. Giữ nguyên các hợp đồng đã chốt ở #559, #560, #562: nút "Gốc học viên" trong header, một link kiểm tra đầu vào trong `.nav-actions`, bỏ khối examenglish.

## Phases

| # | Phase | Trạng thái | Phụ thuộc |
|---|---|---|---|
| 1 | [Hợp đồng khóa học](phase-01-course-contract.md) | pending | - |
| 2 | [Dựng lại landing 8 khối](phase-02-landing-rebuild.md) | pending | 1 |
| 3 | [Chuyển nội dung ra khỏi trang chính](phase-03-relocate-content.md) | pending | 2 |
| 4 | [Test, docs và cổng đăng prod](phase-04-verify-and-release-gate.md) | pending | 1-3 |

## Acceptance criteria

- Trang chủ có đúng 1 `<h1>`, 1 nút chính tới `kiem-tra-dau-vao/`, 1 link Zalo phụ ở hero; header không còn nút "Đăng Ký Khóa Học" riêng.
- 8 khối đúng thứ tự: Hero, Thanh tin cậy, Bạn đang ở đâu, Ba khóa, Học viên nói gì, Vì sao khác, Quy trình 4 bước, Cô Mỹ là ai, rồi Form + Hỏi đáp.
- Form chỉ có Họ tên, Số Zalo (đều required), Khóa quan tâm (có "Chưa rõ, cần cô tư vấn"), cộng honeypot. Submit thành công với cả 3 khóa mới.
- Không còn trên trang chính: khối copy kịch bản, khối 5 PDF (chỉ còn 1 link "Tải hồ sơ cô Mỹ" có nhóm Tiếng Việt/Tiếng Anh), bảng CEFR theo giờ, 6 thẻ bảo chứng, hộp 05 suất.
- Bảng CEFR xuất hiện ở trang kết quả sau bài test; kịch bản tư vấn xuất hiện ở trang nội bộ noindex.
- Thanh CTA dính chỉ hiện trên màn nhỏ, 1 nút.
- Kiểm tra ở 3 viewport (1440×900, 768×1024, 375×812) và bằng bàn phím theo `REVIEW.md`.
- `pnpm --filter profile test`, test package api và server liên quan, `pnpm check-types`, `pnpm exec biome check .` đều xanh; e2e `profile-lead-intake` và `profile-placement-test` chạy local xanh.

## Non-goals

- Không đổi thương hiệu, màu hay font (giữ token hiện có trong file).
- Không đổi luồng bài test hay chấm điểm, chỉ thêm khối CEFR ở trang kết quả.
- Không đổi hạ tầng deploy, domain, hay API lead ngoài enum khóa.
- Không đo A/B hay phân tích; chưa có baseline.

## Rủi ro

- **Nội dung chưa đủ để đăng**: học phí, chính sách bảo hành, điều kiện cam kết đầu ra, số liệu 500+ và 8+ năm. Phase 4 chặn việc đăng prod đến khi có xác nhận.
- **Test hiện tại khóa cấu trúc cũ**: sẽ phải sửa các test mô tả form 10 ô và nhóm optgroup, trong khi vẫn giữ các bất biến đã chốt ở #559, #560, #562.
- **Lead đang bay**: người dùng mở trang cũ rồi submit sau khi deploy vẫn gửi mã cũ, hợp lệ vì enum cũ được giữ.
- **File lớn một khối**: viết lại 3.9k dòng dễ lệch CSS, nên làm theo từng khối và chạy test sau mỗi khối.

## Quyết định đã chốt (2026-11-04)

1. Tên mã khóa mới `foundation-core`, `ielts-practical`, `workplace-interview` được giữ nguyên.
2. Trang nội bộ cho tư vấn viên là trang tĩnh trong `apps/profile/public/noi-bo/`, ai có link đều truy cập được, có `noindex`.
3. Không giữ bản lưu trữ của trang cũ; chỉ dựa vào lịch sử git.

## Câu hỏi còn mở

1. Học phí từng khóa (khoảng giá hay "từ X đồng") và thời điểm có số. Đến lúc đó trang hiển thị "Nhắn Zalo để nhận báo giá".
2. Chính sách khi chưa đạt mục tiêu và điều kiện của "cam kết đầu ra". Đến lúc đó câu hỏi đáp tương ứng không hiển thị nội dung bảo hành.

Hai câu này không chặn phase 1-3; chỉ chặn việc đăng prod ở phase 4.
## Validation & Red-Team Review Log (2026-11-04)

### Verification Results
- Claims checked: 14 (file paths, symbols, contracts, drift tests, anchors)
- Verified: 14 | Failed: 0 | Unverified: 0
- Lenses applied: Security Adversary, Contract Drift Analyst, Failure Mode Analyst.

### Kongming Advisory Synthesis & Resolutions
1. **Bổ sung `lead-gate.js` vào Phase 1:** Đồng bộ `PLACEMENT_COURSE_GROUPS` 15 khóa (thêm nhóm `target` chứa 3 mã mới) khớp 100% với `LEAD_COURSE_GROUPS` để bảo vệ test drift `lead-catalog-drift.test.ts`.
2. **Cập nhật drift test cho Landing Form 3 khóa:** Cập nhật assertion cho `select[name=course]` trên `index.html` nhận tập 4 mã (`foundation-core`, `ielts-practical`, `workplace-interview`, `undecided`) trong khi `lead-gate.js` giữ trọn vẹn 15 mã.
3. **Mapper tham số `?khoa=` cho kết quả test:** Thêm mapper ánh xạ mã cũ sang mã mới (`ielts-foundation`/`ielts-first-step` -> `foundation-core`, `ielts-pre`/`ielts-advanced` -> `ielts-practical`) để học viên hoàn thành test không bị mất khóa gợi ý.
4. **Bảo vệ trang `noi-bo`:** Meta `noindex, nofollow`, kiểm tra zero-link từ public surface, fallback cho clipboard copy, không đưa dữ liệu nhạy cảm vào kịch bản.
5. **Bảo vệ anchor:** Đảm bảo `#lam-test-mien-phi` và `#dang-ky-tu-van` còn tồn tại.
6. **Cổng release:** Test chống placeholder `[ ... ]` hoặc `TODO` trên trang chủ; hiển thị "Nhắn Zalo để nhận báo giá".

### Whole-Plan Consistency Sweep
- Toàn bộ 4 phase file và `plan.md` đã được đồng bộ hóa theo các quyết định trên.
- Không còn mâu thuẫn hoặc câu hỏi chặn implementation.
