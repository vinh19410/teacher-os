# Use case index — feature credits

## 1. Bảng UC

| UC | Tên | Actor chính | File |
|---|---|---|---|
| UC-01 | Xem số dư ví Credit của tổ chức | Thành viên org | usecases/uc-01-view-credit-wallet.md |
| UC-02 | Nhập đề bằng AI (tiêu 5 Credit) | Teacher/Owner | usecases/uc-02-import-exam-with-ai.md |
| UC-03 | Bị chặn khi tổ chức thiếu Credit (nhập đề) | Teacher/Owner | usecases/uc-03-insufficient-credit-block.md |
| UC-04 | Thử bóc tách lại AI (retry nhập đề) | Teacher/Owner | usecases/uc-04-retry-exam-import.md |
| UC-05 | Chấm nháp AI tự động tiêu Credit | Học viên (trigger) / Org | usecases/uc-05-ai-grading-consume.md |
| UC-06 | Hạ cấp Chấm nhanh Writing khi hết Credit | Hệ thống (org gói tháng) | usecases/uc-06-quick-grade-downgrade.md |
| UC-07 | Thử chấm lại AI (tiêu Credit lượt r(n)) | Teacher/Owner/Admin/Class teacher | usecases/uc-07-ai-retry.md |
| UC-08 | Giải tỏa Credit kẹt tự động (sweep) | Hệ thống | usecases/uc-08-stale-credit-sweep.md |
| UC-09 | Xử lý trùng đề không mất Credit | Teacher/Owner | usecases/uc-09-duplicate-import-no-charge.md |

## 2. Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR | BR | Error chính |
|---|---|---|---|
| UC-01 | FR-01, FR-02, FR-03 | BR-01, BR-02, BR-03 | 401 unauthorized |
| UC-02 | FR-04, FR-05, FR-06, FR-07, FR-08, FR-10, FR-12, FR-21 | BR-04, BR-05, BR-06, BR-09, BR-11 | 402 E-001; 502 E-004; 502 EXAM_IMPORT_FAILED; 403; 400 E-003 |
| UC-03 | FR-11, FR-03 | BR-02, BR-03 | 402 E-001 |
| UC-04 | FR-10, FR-12, FR-14 | BR-05, BR-09 | 409 not_retryable; 410 file_missing; 402 E-001 |
| UC-05 | FR-04, FR-05, FR-06, FR-07, FR-08, FR-15, FR-19 | BR-04, BR-06, BR-08 | E-001/E-002 (draft); AI_GRADING_* |
| UC-06 | FR-16, FR-17 | BR-07 | E-002 |
| UC-07 | FR-08, FR-19, FR-20 | BR-09, BR-08 | 403 AI_RETRY_FORBIDDEN; 409 E-011; 409 DRAFT_NOT_RETRYABLE |
| UC-08 | FR-02, FR-18, FR-19 | BR-08, BR-11 | (nền — không bề mặt lỗi user) |
| UC-09 | FR-13 | BR-10 | (không có — 200 duplicateOf) |

> Note: ma trận trên là **superset** — mục `h.` (truy vết) của từng UC liệt kê đúng phần UC đó dùng; khi đối chiếu từng UC với bảng này, các dòng FR/BR là tập cha bao phủ mọi nhánh (kể cả nhánh lỗi) của UC.
