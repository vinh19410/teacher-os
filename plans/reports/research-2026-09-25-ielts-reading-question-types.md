# Research: Tổng số dạng bài IELTS Reading ngoài 2 dạng đang có (TFNG, Sentence completion)

- **Ngày nghiên cứu:** 2026-09-25
- **Phạm vi:** IELTS Reading (Academic & General Training), định dạng hiện hành (không đổi từ trước đến nay; nguồn chính thức là PDF sample tasks 2023 của ielts.org)
- **Câu hỏi:** Ngoài `true/false/not given` và `sentence completion`, IELTS Reading còn bao nhiêu dạng bài?

## Kết luận (TL;DR)

IELTS Reading chính thức có **11 dạng câu hỏi (task types)** theo cách phân loại gộp của ielts.org — hoặc **14 dạng** nếu tách nhỏ nhóm "summary/note/table/flow-chart completion" thành 4 dạng riêng (cách đếm phổ biến trong tài liệu luyện thi, ví dụ IELTS Liz, IDP).

→ Ngoài 2 dạng đang được nhắc (`true/false/not given` và `sentence completion`), còn lại **9 dạng** (đếm gộp chính thức) hoặc **12 dạng** (đếm tách nhỏ).

→ Lưu ý: dự án thực chất đã định nghĩa sẵn **6/14 dạng** trong `packages/api/src/contracts.ts` (không chỉ 2 dạng Passage 1), nên chỉ còn **thiếu 8 dạng** chưa có trong contracts.

## Danh sách 11 dạng chính thức (Academic & GT giống nhau)

Nguồn: [IELTS.org — Academic Reading sample tasks 2023](https://ielts.org/cdn/Sample-tests/ielts-academic-reading-sample-tasks-2023.pdf)

| # | Dạng chính thức | Tách nhỏ (14) | Có trong dự án? |
|---|---|---|---|
| 1 | Multiple-choice questions | 1 dạng | ✅ `mcq` (p3) |
| 2 | Identifying information (True/False/Not Given) | 1 dạng | ✅ `tfng` (p1) |
| 3 | Identifying writer's views/claims (Yes/No/Not Given) | 1 dạng | ✅ `ynng` (p3) |
| 4 | Matching information (đoạn nào chứa thông tin) | 1 dạng | ✅ `info` (p2) |
| 5 | Matching headings | 1 dạng | ✅ `headings` (p2) |
| 6 | Matching features | 1 dạng | ❌ |
| 7 | Matching sentence endings | 1 dạng | ❌ |
| 8 | Sentence completion | 1 dạng | ✅ `sent` (p1) |
| 9 | Summary / note / table / flow-chart completion | 4 dạng (9–12) | ❌ |
| 10 | Diagram label completion | 1 dạng | ❌ |
| 11 | Short-answer questions | 1 dạng | ❌ |

- Nếu tách nhỏ nhóm 9 → tổng cộng **14 dạng**; ngoài 2 dạng user nêu còn **12 dạng**.
- Dự án đã phủ 6 dạng (`tfng`, `sent`, `headings`, `info`, `ynng`, `mcq` — xem `ASSIGNMENT_PART_TYPES` tại `packages/api/src/contracts.ts:282-289`) → còn **thiếu 8 dạng**: matching features, matching sentence endings, summary completion, note completion, table completion, flow-chart completion, diagram label completion, short-answer questions.

## Ghi chú kỹ thuật cho việc mở rộng dự án

- Cấu trúc contracts là plain arrays, không phải enum đóng: thêm id vào `ASSIGNMENT_PART_TYPES` là server tự chấp nhận (validate động tại `contracts.ts:365`).
- Khi thêm dạng mới cần sửa đồng bộ: `ASSIGNMENT_PART_TYPES` (contracts.ts), catalog UI `apps/web/src/components/assignments/assignment-presets.ts` (`SKILLS`, `KIND`), và `answerKindByType` + `ASSIGNMENT_ANSWER_CHOICES` nếu dạng mới có bộ choices cố định.
- Một số dạng mới có thể tái dùng answer kind sẵn có: matching features / sentence endings → `letter`; short-answer → `text`; matching headings → `roman`.

## Độ tin cậy & chưa rõ

- Số 11 và 14 đều "chính thức": 11 là cách liệt kê của ielts.org (gộp summary/note/table/flow-chart), 14 là cách tách nhỏ được ielts.org dùng trong phần liệt kê chi tiết của chính PDF sample tasks và các nguồn luyện thi (IDP, IELTS Liz) cũng dùng. Không có mâu thuẫn thực chất, chỉ khác granularity.
- Academic và General Training dùng chung 11 dạng task types (GT cũng có diagram label completion theo định dạng chính thức).
- Không có câu hỏi nào chưa giải quyết.

## Nguồn

- [IELTS.org — IELTS Academic Reading sample tasks (PDF 2023)](https://ielts.org/cdn/Sample-tests/ielts-academic-reading-sample-tasks-2023.pdf)
- [IELTS Liz — IELTS Reading Question Types](https://ieltsliz.com)
- [British Council — Take IELTS, free practice tests](https://takeielts.britishcouncil.org)
