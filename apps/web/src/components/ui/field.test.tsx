import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field, Input, Select, Textarea } from "./field";

describe("Field accessibility", () => {
	it("automatically sets required and aria-required when label contains *", () => {
		const html = renderToStaticMarkup(
			<Field label="Họ tên học viên *">
				<Input placeholder="Nguyễn Văn A" />
			</Field>,
		);

		expect(html).toContain("required");
		expect(html).toContain('aria-required="true"');
		expect(html).toContain('placeholder="Nguyễn Văn A"');
	});

	it("does not set required when label has no * and required is not specified", () => {
		const html = renderToStaticMarkup(
			<Field label="Phụ huynh (nếu có)">
				<Input placeholder="Tên phụ huynh" />
			</Field>,
		);

		expect(html).not.toContain("required");
		expect(html).not.toContain('aria-required="true"');
	});

	it("honors explicit required prop", () => {
		const html = renderToStaticMarkup(
			<Field label="Email" required>
				<Input placeholder="email@example.com" />
			</Field>,
		);

		expect(html).toContain("required");
		expect(html).toContain('aria-required="true"');
	});

	it("allows overriding label asterisk with required={false}", () => {
		const html = renderToStaticMarkup(
			<Field label="Ghi chú *" required={false}>
				<Input placeholder="Ghi chú" />
			</Field>,
		);

		expect(html).not.toContain("required");
		expect(html).not.toContain('aria-required="true"');
	});

	it("sets aria-invalid, aria-describedby and role=alert when error is present", () => {
		const html = renderToStaticMarkup(
			<Field label="Tên lớp *" error="Tên lớp không được để trống.">
				<Input placeholder="IELTS Band 6.5" />
			</Field>,
		);

		expect(html).toContain('aria-invalid="true"');
		expect(html).toContain('role="alert"');
		expect(html).toContain('aria-live="polite"');
		expect(html).toContain("Tên lớp không được để trống.");

		const idMatch = html.match(/id="([^"]+-error)"/);
		expect(idMatch).toBeTruthy();
		const errorId = idMatch?.[1];
		expect(html).toContain(`aria-describedby="${errorId}"`);
	});

	it("links help text via aria-describedby", () => {
		const html = renderToStaticMarkup(
			<Field label="SĐT" help="Chỉ số và khoảng trắng">
				<Input placeholder="0901234567" />
			</Field>,
		);

		const idMatch = html.match(/id="([^"]+-help)"/);
		expect(idMatch).toBeTruthy();
		const helpId = idMatch?.[1];
		expect(html).toContain(`aria-describedby="${helpId}"`);
		expect(html).toContain("Chỉ số và khoảng trắng");
	});

	it("links both error and help in aria-describedby", () => {
		const html = renderToStaticMarkup(
			<Field
				label="SĐT *"
				error="SĐT không hợp lệ."
				help="Chỉ số và khoảng trắng"
			>
				<Input placeholder="0901234567" />
			</Field>,
		);

		const errorIdMatch = html.match(/id="([^"]+-error)"/);
		const helpIdMatch = html.match(/id="([^"]+-help)"/);
		expect(errorIdMatch).toBeTruthy();
		expect(helpIdMatch).toBeTruthy();

		const errorId = errorIdMatch?.[1];
		const helpId = helpIdMatch?.[1];
		expect(html).toContain(`aria-describedby="${errorId} ${helpId}"`);
	});

	it("works with Select and Textarea controls", () => {
		const selectHtml = renderToStaticMarkup(
			<Field label="Hình thức *" error="Vui lòng chọn hình thức">
				<Select defaultValue="Online">
					<option value="Online">Online</option>
					<option value="Offline">Offline</option>
				</Select>
			</Field>,
		);

		expect(selectHtml).toContain("<select");
		expect(selectHtml).toContain("required");
		expect(selectHtml).toContain('aria-required="true"');
		expect(selectHtml).toContain('aria-invalid="true"');

		const textareaHtml = renderToStaticMarkup(
			<Field label="Mục tiêu *">
				<Textarea placeholder="Mục tiêu bài học" />
			</Field>,
		);

		expect(textareaHtml).toContain("<textarea");
		expect(textareaHtml).toContain("required");
		expect(textareaHtml).toContain('aria-required="true"');
	});
});
