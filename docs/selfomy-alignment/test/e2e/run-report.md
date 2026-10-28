# Kết quả chạy Playwright — selfomy-alignment

> Chạy: 2026-10-28 · Môi trường: `http://localhost:8001`
>
> ✅ 39 đậu · 🔴 5 nghi app bug · 🟡 0 nghi data · 🟠 0 nghi data outdate · ⏳ 0 chờ

Report này KHÔNG tự sửa gì. Đọc mục "Data cần bổ sung", cấp data thật vào `e2e/testdata.json` (secret để `e2e/.env`), rồi chạy lại phần chưa đậu:

```
node .claude/scripts/playwright-gen.mjs run --dir docs/selfomy-alignment --retry-failed
```

## Kết quả từng case

| CHK-ID | Kết quả | Ghi chú |
|---|---|---|
| CHK-selfomy-alignment-001 | ✅ Đậu |  |
| CHK-selfomy-alignment-003 | ✅ Đậu |  |
| CHK-selfomy-alignment-008 | ✅ Đậu |  |
| CHK-selfomy-alignment-011 | 🔴 Nghi app bug | fail ở assertion nghiệp vụ — nghi app bug, cần dev xem |
| CHK-selfomy-alignment-012 | ✅ Đậu |  |
| CHK-selfomy-alignment-013 | ✅ Đậu |  |
| CHK-selfomy-alignment-015 | ✅ Đậu |  |
| CHK-selfomy-alignment-016 | ✅ Đậu |  |
| CHK-selfomy-alignment-017 | ✅ Đậu |  |
| CHK-selfomy-alignment-020 | ✅ Đậu |  |
| CHK-selfomy-alignment-021 | ✅ Đậu |  |
| CHK-selfomy-alignment-022 | ✅ Đậu |  |
| CHK-selfomy-alignment-023 | ✅ Đậu |  |
| CHK-selfomy-alignment-029 | ✅ Đậu |  |
| CHK-selfomy-alignment-031 | ✅ Đậu |  |
| CHK-selfomy-alignment-032 | ✅ Đậu |  |
| CHK-selfomy-alignment-033 | ✅ Đậu |  |
| CHK-selfomy-alignment-034 | ✅ Đậu |  |
| CHK-selfomy-alignment-035 | ✅ Đậu |  |
| CHK-selfomy-alignment-036 | ✅ Đậu |  |
| CHK-selfomy-alignment-038 | ✅ Đậu |  |
| CHK-selfomy-alignment-040 | ✅ Đậu |  |
| CHK-selfomy-alignment-042 | ✅ Đậu |  |
| CHK-selfomy-alignment-043 | ✅ Đậu |  |
| CHK-selfomy-alignment-044 | ✅ Đậu |  |
| CHK-selfomy-alignment-045 | ✅ Đậu |  |
| CHK-selfomy-alignment-046 | ✅ Đậu |  |
| CHK-selfomy-alignment-048 | ✅ Đậu |  |
| CHK-selfomy-alignment-049 | 🔴 Nghi app bug | fail ở assertion nghiệp vụ — nghi app bug, cần dev xem |
| CHK-selfomy-alignment-051 | ✅ Đậu |  |
| CHK-selfomy-alignment-053 | 🔴 Nghi app bug | fail ở assertion nghiệp vụ — nghi app bug, cần dev xem |
| CHK-selfomy-alignment-055 | 🔴 Nghi app bug | fail ở assertion nghiệp vụ — nghi app bug, cần dev xem |
| CHK-selfomy-alignment-056 | 🔴 Nghi app bug | fail ở assertion nghiệp vụ — nghi app bug, cần dev xem |
| CHK-selfomy-alignment-058 | ✅ Đậu |  |
| CHK-selfomy-alignment-059 | ✅ Đậu |  |
| CHK-selfomy-alignment-066 | ✅ Đậu |  |
| CHK-selfomy-alignment-067 | ✅ Đậu |  |
| CHK-selfomy-alignment-069 | ✅ Đậu |  |
| CHK-selfomy-alignment-070 | ✅ Đậu |  |
| CHK-selfomy-alignment-072 | ✅ Đậu |  |
| CHK-selfomy-alignment-075 | ✅ Đậu |  |
| CHK-selfomy-alignment-076 | ✅ Đậu |  |
| CHK-selfomy-alignment-077 | ✅ Đậu |  |
| CHK-selfomy-alignment-080 | ✅ Đậu |  |

## Data cần bổ sung / kiểm lại

| Key data | Giá trị hiện tại | Vấn đề | Cấp vào đâu |
|---|---|---|---|
| `chk-selfomy-alignment-016.2.chon-ngay-iem-danh` | `2026-10-27` | còn giá-trị-giả (mẫu từ test-case) | `e2e/testdata.json` |
| `chk-selfomy-alignment-034.5.ghi-chu-hoc-vu-cua-tran-hoang-nam` | `Xin nghỉ ốm` | còn giá-trị-giả (mẫu từ test-case) | `e2e/testdata.json` |
| `chk-selfomy-alignment-080.5.chon-ngay-iem-danh` | `2026-10-27` | còn giá-trị-giả (mẫu từ test-case) | `e2e/testdata.json` |
| `chk-selfomy-alignment-080.6.chon-ngay-iem-danh` | `2026-10-26` | còn giá-trị-giả (mẫu từ test-case) | `e2e/testdata.json` |

> Secret (mật khẩu/token) KHÔNG điền vào testdata.json — khai `ENV: VAR` ở test-case, value để `e2e/.env`. Nếu data thật khác data giả và muốn ghi ngược vào test-case, chạy lại `/playwright-gen` sẽ hỏi.
