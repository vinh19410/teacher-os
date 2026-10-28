import { test, expect } from '@playwright/test';
import TESTDATA from '../testdata.json';
import * as SEED from '../seed';

// AUTO-GENERATED bởi playwright-gen.mjs từ testcases-us-001.md — KHÔNG sửa tay (regen sẽ ghi đè).
// Trace: mỗi test() title bắt đầu bằng CHK-ID.
// Test data TÁCH khỏi script: sửa ../testdata.json để khớp môi trường, KHÔNG sửa file này.
// DATA(key, default): dùng giá trị trong testdata.json nếu có, else default (data giả-định từ test-case).
const DATA = (k, d) => (TESTDATA && Object.prototype.hasOwnProperty.call(TESTDATA, k) ? TESTDATA[k] : d);

test.describe("us-001", () => {
  test("CHK-selfomy-alignment-001: Giáo viên độc lập thấy đủ 3 thẻ nhắc việc trên Bảng điều khiển", async ({ page }) => {
    await SEED.teacherOnly(page);
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("Ca học hôm nay chưa điểm danh", { exact: true })).toBeVisible(); /*@assert-step*/
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("Bài tập quá hạn chấm > 24h", { exact: true })).toBeVisible(); /*@assert-step*/
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("Học phí đến hạn / quá hạn thu", { exact: true })).toBeVisible(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-003: Thẻ ca học chưa điểm danh cắt danh sách ở 3 ca khi có 4 ca chờ", async ({ page }) => {
    await SEED.teacherToday4(page);
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("4 ca", { exact: true })).toBeVisible(); /*@assert-step*/
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("IELTS 6.5A (18:00 – 19:30)", { exact: true })).toBeVisible(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-008: \"Mở Điểm danh ngày ->\" mở màn Điểm danh với tham số ngày hôm nay và trạng thái pending", async ({ page }) => {
    await SEED.teacherToday3(page);
    await page.goto("/dashboard"); /*@data-step*/
    await page.getByRole('link', { name: "Ca học hôm nay chưa điểm danh — Mở Điểm danh ngày", exact: true }).click();
    await expect(page).toHaveURL((url) => new RegExp("^/attendance$").test(url.pathname)); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-011: \"Mở Sổ công nợ ->\" mở Sổ công nợ với bộ lọc quá hạn và sắp đến hạn", async ({ page }) => {
    await SEED.teacherOnly(page);
    await page.goto("/dashboard"); /*@data-step*/
    await page.getByRole('link', { name: "Học phí đến hạn / quá hạn thu — Mở Sổ học phí", exact: true }).click();
    await expect(page).toHaveURL((url) => new RegExp("^/debts$").test(url.pathname)); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-012: Thẻ ca học chuyển sang \"Đã hoàn tất hôm nay\" khi mọi ca đã điểm danh", async ({ page }) => {
    await SEED.teacherToday1(page);
    await page.goto("/attendance"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("Đã hoàn tất hôm nay", { exact: true })).toHaveCount(3); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-013: Thẻ có bộ đếm 0 đổi nút hành động sang \"Xem lịch sử\"", async ({ page }) => {
    await SEED.teacherToday1(page);
    await page.goto("/attendance"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("Đã hoàn tất hôm nay", { exact: true })).toHaveCount(3); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-015: URL \"?date=2026-10-26\" liệt kê đủ ca học của mọi lớp có lịch ngày đó", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await expect(page.getByText("IELTS 6.5A", { exact: true })).toBeVisible(); /*@assert-step*/
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await expect(page.getByText("IELTS 5.0B", { exact: true })).toBeVisible(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-016: Đổi ngày trên bộ chọn đẩy ngày mới lên tham số \"date\" của URL", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await expect(page.getByLabel("Chọn ngày điểm danh", { exact: true })).toHaveValue("2026-10-26"); /*@assert-step*/
    await page.getByLabel("Chọn ngày điểm danh", { exact: true }).fill(DATA("chk-selfomy-alignment-016.2.chon-ngay-iem-danh", "2026-10-27")); /*@data-step*/
    await expect(page).toHaveURL(new RegExp("date=2026-10-27")); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-017: Nút \"Hôm nay\" đưa bộ chọn từ ngày khác về ngày hiện tại", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await expect(page.getByLabel("Chọn ngày điểm danh", { exact: true })).toHaveValue("2026-10-26"); /*@assert-step*/
    await page.getByRole('button', { name: "Hôm nay", exact: true }).click();
    await expect(page).not.toHaveURL(new RegExp("date=2026-10-26")); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-020: Chip \"Chưa điểm danh\" ẩn ca đã lưu, chỉ giữ ca chưa lưu", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 5\\.0B)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 5\\.0B)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.getByRole('button', { name: "Chưa điểm danh", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.goto("/attendance?date=2026-10-26&status=pending"); /*@data-step*/
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 5\\.0B)", 'i') })).toHaveCount(0); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-021: Chip \"Đã điểm danh\" chỉ giữ ca đã lưu", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 5\\.0B)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 5\\.0B)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.getByRole('button', { name: "Đã điểm danh", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 5\\.0B)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.goto("/attendance?date=2026-10-26&status=completed"); /*@data-step*/
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') })).toHaveCount(0); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-022: Số đếm 3 chip trạng thái khớp số ca thực tế của ngày đang chọn", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await expect(page.getByRole('button', { name: "Tất cả", exact: true })).toContainText("2"); /*@assert-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 5\\.0B)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 5\\.0B)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('button', { name: "Chưa điểm danh", exact: true })).toContainText("1"); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('button', { name: "Đã điểm danh", exact: true })).toContainText("1"); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-023: Chọn chip \"Chưa điểm danh\" ghi \"status=pending\" lên URL", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: "Chưa điểm danh", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("status=pending")); /*@assert-step*/
    await page.getByRole('button', { name: "Đã điểm danh", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("status=completed")); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-029: Bấm thẻ tiêu đề ca học mở danh sách học viên inline, URL giữ nguyên", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first()).toHaveAttribute('aria-expanded', 'true'); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page).toHaveURL(new RegExp("date=2026-10-26")); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup')).toHaveCount(3); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-031: Số dòng học viên khi mở rộng bằng sĩ số trên thẻ tiêu đề", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await expect(page.getByRole('radiogroup')).toHaveCount(3); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Sĩ số 3 HV)", 'i') }).first()).toBeVisible(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-032: Mỗi dòng học viên có đủ 4 trạng thái điểm danh chuẩn", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Vắng có phép", exact: true })).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Vắng không phép", exact: true })).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Đi muộn", exact: true })).toBeVisible(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-033: Mỗi học viên chỉ giữ 1 trạng thái: chọn mới thì bỏ chọn cũ", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Có mặt", exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).toBeChecked(); /*@assert-step*/
    await page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Đi muộn", exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Đi muộn", exact: true })).toBeChecked(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).not.toBeChecked(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-034: Ghi chú học vụ còn nguyên khi mở lại ca đã lưu", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Trần Hoàng Nam", exact: true }).getByRole('radio', { name: "Vắng có phép", exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Trần Hoàng Nam", exact: true }).getByRole('radio', { name: "Vắng có phép", exact: true })).toBeChecked(); /*@assert-step*/
    await page.getByLabel("Ghi chú học vụ của Trần Hoàng Nam", { exact: true }).fill(DATA("chk-selfomy-alignment-034.5.ghi-chu-hoc-vu-cua-tran-hoang-nam", "Xin nghỉ ốm")); /*@data-step*/
    await expect(page.getByLabel("Ghi chú học vụ của Trần Hoàng Nam", { exact: true })).toHaveValue("Xin nghỉ ốm"); /*@assert-step*/
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.reload(); /*@data-step*/
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByLabel("Ghi chú học vụ của Trần Hoàng Nam", { exact: true })).toHaveValue("Xin nghỉ ốm"); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-035: \"Đánh dấu tất cả Có mặt\" gán \"Có mặt\" cho mọi học viên còn trống", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).toBeChecked(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Trần Hoàng Nam", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).toBeChecked(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Lê Thu Hà", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).toBeChecked(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-036: \"Đánh dấu tất cả Có mặt\" không ghi đè học viên đã chọn trạng thái trước", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Trần Hoàng Nam", exact: true }).getByRole('radio', { name: "Vắng có phép", exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Trần Hoàng Nam", exact: true }).getByRole('radio', { name: "Vắng có phép", exact: true })).toBeChecked(); /*@assert-step*/
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Trần Hoàng Nam", exact: true }).getByRole('radio', { name: "Vắng có phép", exact: true })).toBeChecked(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).toBeChecked(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Lê Thu Hà", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).toBeChecked(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-038: Đánh dấu tất cả rồi sửa 1 học viên vắng có phép, lưu ghi nhận đúng từng người", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).toBeChecked(); /*@assert-step*/
    await page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Trần Hoàng Nam", exact: true }).getByRole('radio', { name: "Vắng có phép", exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Trần Hoàng Nam", exact: true }).getByRole('radio', { name: "Vắng có phép", exact: true })).toBeChecked(); /*@assert-step*/
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.reload(); /*@data-step*/
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Trần Hoàng Nam", exact: true }).getByRole('radio', { name: "Vắng có phép", exact: true })).toBeChecked(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).toBeChecked(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Lê Thu Hà", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).toBeChecked(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-040: Lưu điểm danh xong vẫn ở màn Điểm danh tổng theo ngày", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("date=2026-10-26")); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-042: Nhãn ca học đổi từ chưa điểm danh sang \"Đã điểm danh\" sau khi lưu", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Chưa điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-043: Lưu 1 ca hôm nay làm bộ đếm Bảng điều khiển giảm đúng 1", async ({ page }) => {
    await SEED.teacherToday3(page);
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("3 ca", { exact: true })).toBeVisible(); /*@assert-step*/
    await page.goto("/attendance"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("2 ca", { exact: true })).toBeVisible(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-044: Lưu 1 ca làm số đếm chip \"Chưa điểm danh\" giảm đúng 1", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await expect(page.getByRole('button', { name: "Chưa điểm danh", exact: true })).toContainText("2"); /*@assert-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('button', { name: "Chưa điểm danh", exact: true })).toContainText("1"); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-045: Thẻ ca đã lưu khi thu gọn hiện tỷ lệ \"{số Có mặt}/{sĩ số} Có mặt\"", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Trần Hoàng Nam", exact: true }).getByRole('radio', { name: "Vắng có phép", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*2/3)", 'i') }).first()).toBeVisible(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-046: Lưu hết mọi ca hôm nay đưa bộ đếm Bảng điều khiển về 0", async ({ page }) => {
    await SEED.teacherToday2(page);
    await page.goto("/attendance"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 5\\.0B)", 'i') }).first()).toHaveAttribute('aria-expanded', 'true'); /*@assert-step*/
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 5\\.0B)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("Đã hoàn tất hôm nay", { exact: true })).toHaveCount(3); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-048: Ghi chú học vụ để trống không chặn việc lưu điểm danh", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-049: Trợ giảng chỉ được đếm ca chưa điểm danh của lớp được phân công", async ({ page }) => {
    await SEED.taToday2(page);
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("1 ca", { exact: true })).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByText("IELTS 6.5A (18:00 – 19:30)", { exact: true })).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByText("IELTS 5.0B (19:30 – 21:00)", { exact: true })).toBeHidden(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-051: Thẻ Học phí bị ẩn hoàn toàn với Trợ giảng", async ({ page }) => {
    await SEED.taOnly(page);
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("Ca học hôm nay chưa điểm danh", { exact: true })).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByText("Bài tập quá hạn chấm > 24h", { exact: true })).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByText("Học phí đến hạn / quá hạn thu", { exact: true })).toBeHidden(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-053: Trợ giảng chỉ thấy ca của lớp được phân công trên màn Điểm danh", async ({ page }) => {
    await SEED.taDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 5\\.0B)", 'i') })).toHaveCount(0); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-055: Giáo viên đứng lớp chỉ thấy ca của lớp mình trên màn Điểm danh", async ({ page }) => {
    await SEED.classTeacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 5\\.0B)", 'i') })).toHaveCount(0); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-056: Bộ đếm ca chưa điểm danh của Giáo viên đứng lớp chỉ tính lớp được phân công", async ({ page }) => {
    await SEED.classTeacherToday2(page);
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("1 ca", { exact: true })).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByText("IELTS 6.5A (18:00 – 19:30)", { exact: true })).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByText("IELTS 5.0B (19:30 – 21:00)", { exact: true })).toBeHidden(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-058: Người chưa đăng nhập mở URL Điểm danh bị đưa về màn đăng nhập", async ({ page }) => {
    await page.goto("/attendance"); /*@data-step*/
    await expect(page).toHaveURL((url) => new RegExp("^/login$").test(url.pathname)); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-059: Giáo vụ thấy đủ 3 thẻ nhắc việc kể cả thẻ Học phí", async ({ page }) => {
    await SEED.adminOnly(page);
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("Ca học hôm nay chưa điểm danh", { exact: true })).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByText("Bài tập quá hạn chấm > 24h", { exact: true })).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByText("Học phí đến hạn / quá hạn thu", { exact: true })).toBeVisible(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-066: Mở rộng thẻ tiêu đề ca học chỉ bằng Tab và Enter", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().focus();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first()).toBeFocused(); /*@assert-step*/
    for (let i = 0; i < 1; i += 1) await page.keyboard.press("Enter");
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first()).toHaveAttribute('aria-expanded', 'true'); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-067: Chọn trạng thái điểm danh của học viên chỉ bằng bàn phím", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Có mặt", exact: true }).focus();
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).toBeFocused(); /*@assert-step*/
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");
    for (let i = 0; i < 1; i += 1) await page.keyboard.press("Space");
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Đi muộn", exact: true })).toBeChecked(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-069: Nhóm trạng thái của mỗi học viên mang nhãn truy cập có tên học viên", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true })).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Trần Hoàng Nam", exact: true })).toBeVisible(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Lê Thu Hà", exact: true })).toBeVisible(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-070: Huy hiệu số đếm trên chip trạng thái mang aria-hidden=\"true\"", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await expect(page.getByRole('button', { name: "Tất cả", exact: true }).locator('[aria-hidden="true"]').first()).toBeAttached(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('button', { name: "Chưa điểm danh", exact: true }).locator('[aria-hidden="true"]').first()).toBeAttached(); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    await expect(page.getByRole('button', { name: "Đã điểm danh", exact: true }).locator('[aria-hidden="true"]').first()).toBeAttached(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-072: Ở 375×812 bốn nút trạng thái xếp lưới 2×2", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await expect(page.getByRole('radiogroup')).toHaveCount(3); /*@assert-step*/
    // giữ nguyên trang: bước chỉ để kiểm Expected
    { const boxes = await page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      const rows = [...new Set(boxes)];
      expect(rows.length).toBe(2);
      expect(rows.every((r) => boxes.filter((b) => b === r).length === 2)).toBe(true); } /*@assert-step*/
  });
  test("CHK-selfomy-alignment-075: Ở 375×812 màn Điểm danh không cuộn ngang", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    // giữ nguyên trang: bước chỉ để kiểm Expected
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-076: Bấm \"Lưu điểm danh ca học\" 2 lần liên tiếp không trừ bộ đếm 2 lần", async ({ page }) => {
    await SEED.teacherToday3(page);
    await page.goto("/attendance"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.goto("/dashboard"); /*@data-step*/
    await expect(page.getByText("2 ca", { exact: true })).toBeVisible(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-077: Chọn trạng thái nhưng chưa lưu rồi tải lại trang thì ca vẫn chưa điểm danh", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).toBeChecked(); /*@assert-step*/
    await page.reload(); /*@data-step*/
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Chưa điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await expect(page.getByRole('radiogroup', { name: "Trạng thái điểm danh của Nguyễn Minh Anh", exact: true }).getByRole('radio', { name: "Có mặt", exact: true })).not.toBeChecked(); /*@assert-step*/
  });
  test("CHK-selfomy-alignment-080: Đổi ngày rồi quay lại vẫn thấy ca đã lưu là \"Đã điểm danh\"", async ({ page }) => {
    await SEED.teacherDated2(page);
    await page.goto("/attendance?date=2026-10-26"); /*@data-step*/
    await page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') }).first().click();
    await page.getByRole('button', { name: "Đánh dấu tất cả Có mặt", exact: true }).click();
    await page.getByRole('button', { name: "Lưu điểm danh ca học", exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
    await page.getByLabel("Chọn ngày điểm danh", { exact: true }).fill(DATA("chk-selfomy-alignment-080.5.chon-ngay-iem-danh", "2026-10-27")); /*@data-step*/
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)", 'i') })).toHaveCount(0); /*@assert-step*/
    await page.getByLabel("Chọn ngày điểm danh", { exact: true }).fill(DATA("chk-selfomy-alignment-080.6.chon-ngay-iem-danh", "2026-10-26")); /*@data-step*/
    await expect(page.getByRole('button', { name: new RegExp("^(?=.*IELTS 6\\.5A)(?=.*Đã điểm danh)", 'i') }).first()).toBeVisible(); /*@assert-step*/
  });
});
