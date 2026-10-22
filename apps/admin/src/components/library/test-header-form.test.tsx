// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
	areTestHeadersEqual,
	buildCreatePayload,
	buildUpdatePayload,
	emptyTestHeader,
	formatTimeLimit,
	parseTimeLimit,
	reconcileHeaderOnSaveSuccess,
	TestHeaderForm,
} from "./test-header-form";

describe("parseTimeLimit / formatTimeLimit", () => {
	it("MM:SS và HH:MM:SS → giây", () => {
		expect(parseTimeLimit("60:00")).toBe(3600);
		expect(parseTimeLimit("01:00:00")).toBe(3600);
		expect(parseTimeLimit("0:45")).toBe(45);
	});

	it("sai dạng → null", () => {
		expect(parseTimeLimit("60")).toBeNull();
		expect(parseTimeLimit("a:b")).toBeNull();
		expect(parseTimeLimit("60:75")).toBeNull();
		expect(parseTimeLimit("1:60:00")).toBeNull();
		expect(parseTimeLimit("")).toBeNull();
	});

	it("format 3600 → 60:00", () => {
		expect(formatTimeLimit(3600)).toBe("60:00");
		expect(formatTimeLimit(45)).toBe("0:45");
	});
});
describe("areTestHeadersEqual", () => {
	it("trả về true khi mọi trường bằng nhau", () => {
		const a = emptyTestHeader();
		const b = emptyTestHeader();
		expect(areTestHeadersEqual(a, b)).toBe(true);
	});

	it("trả về false khi khác bất kỳ trường nào", () => {
		const base = emptyTestHeader();
		expect(areTestHeadersEqual(base, { ...base, title: "Tiêu đề mới" })).toBe(
			false,
		);
		expect(
			areTestHeadersEqual(base, { ...base, description: "Mô tả mới" }),
		).toBe(false);
		expect(areTestHeadersEqual(base, { ...base, skill: "listening" })).toBe(
			false,
		);
		expect(areTestHeadersEqual(base, { ...base, timeLimit: "45:00" })).toBe(
			false,
		);
		expect(
			areTestHeadersEqual(base, { ...base, collection: "Cambridge" }),
		).toBe(false);
		expect(areTestHeadersEqual(base, { ...base, testGroup: "Practice" })).toBe(
			false,
		);
	});
});

describe("reconcileHeaderOnSaveSuccess", () => {
	it("trả về bản server và isDirty=false khi prev khớp với snapshot đã gửi", () => {
		const sent = { ...emptyTestHeader(), title: "Title đã gửi" };
		const fromServer = { ...sent, title: "Title đã lưu server" };

		const result = reconcileHeaderOnSaveSuccess(sent, sent, fromServer);
		expect(result).toEqual({ nextValue: fromServer, isDirty: false });
	});

	it("giữ nguyên prev và isDirty=true khi người dùng đã gõ thêm ký tự mới khác snapshot", () => {
		const sent = { ...emptyTestHeader(), title: "Title đã gửi" };
		const prev = { ...sent, title: "Title đã gửi và gõ thêm ký tự" };
		const fromServer = { ...sent, title: "Title đã lưu server" };

		const result = reconcileHeaderOnSaveSuccess(prev, sent, fromServer);
		expect(result).toEqual({ nextValue: prev, isDirty: true });
	});

	it("trả về fromServer và isDirty=false khi prev là null", () => {
		const sent = emptyTestHeader();
		const fromServer = { ...sent, title: "Server header" };

		const result = reconcileHeaderOnSaveSuccess(null, sent, fromServer);
		expect(result).toEqual({ nextValue: fromServer, isDirty: false });
	});
});

describe("buildCreatePayload", () => {
	it("payload khớp libraryTestCreateSchema, bơm default qua parse", () => {
		const value = {
			...emptyTestHeader(),
			title: "  Đề Reading  ",
			skill: "listening" as const,
		};
		const built = buildCreatePayload(value);
		if (!built.ok) throw new Error(JSON.stringify(built.errors));
		expect(built.payload).toMatchObject({
			title: "Đề Reading",
			skill: "listening",
			timeLimitSeconds: 3600,
			collection: "",
			testGroup: "",
		});
		// description rỗng (rich text trống) → default "" của schema
		expect(built.payload.description).toBe("");
	});

	it("thời gian sai dạng → lỗi tiếng Việt, không gọi schema", () => {
		const built = buildCreatePayload({
			...emptyTestHeader(),
			timeLimit: "90",
		});
		expect(built.ok).toBe(false);
		if (!built.ok) {
			expect(built.errors.timeLimitSeconds).toMatch(/MM:SS/);
		}
	});

	it("title rỗng → lỗi field tiếng Việt", () => {
		const built = buildCreatePayload(emptyTestHeader());
		expect(built.ok).toBe(false);
		if (!built.ok) expect(built.errors.title).toMatch(/1–200/);
	});
});

describe("buildUpdatePayload", () => {
	it("payload KHÔNG có skill (immutable)", () => {
		const built = buildUpdatePayload({
			...emptyTestHeader(),
			title: "Đổi tên",
			skill: "listening",
		});
		if (!built.ok) throw new Error(JSON.stringify(built.errors));
		expect(built.payload).toEqual({
			title: "Đổi tên",
			// optional field gửi undefined = không xuất hiện trên JSON
			description: undefined,
			timeLimitSeconds: 3600,
			collection: "",
			testGroup: "",
		});
		expect("skill" in built.payload).toBe(false);
	});
});

describe("TestHeaderForm (render tĩnh)", () => {
	it("nhãn tiếng Việt + khóa skill khi edit", () => {
		const html = renderToStaticMarkup(
			<TestHeaderForm
				value={emptyTestHeader()}
				showErrors={false}
				skillLocked
				onChange={vi.fn()}
			/>,
		);
		expect(html).toContain("Tiêu đề");
		expect(html).toContain("Thời gian làm bài");
		expect(html).toContain("Bộ sưu tập");
		expect(html).toContain("Nhóm đề");
		expect(html).toContain("Kỹ năng cố định sau khi tạo đề");
		expect(html).toContain("disabled");
	});

	it("chỉ 2 skill Reading/Listening", () => {
		const html = renderToStaticMarkup(
			<TestHeaderForm
				value={emptyTestHeader()}
				showErrors={false}
				onChange={vi.fn()}
			/>,
		);
		expect(html).toContain("Reading (Đọc)");
		expect(html).toContain("Listening (Nghe)");
		expect(html).not.toContain("Writing");
		expect(html).not.toContain("Speaking");
	});

	it("hiển thị lỗi khi showErrors", () => {
		const html = renderToStaticMarkup(
			<TestHeaderForm
				value={emptyTestHeader()}
				showErrors
				errors={{ title: "Tiêu đề 1–200 ký tự." }}
				onChange={vi.fn()}
			/>,
		);
		expect(html).toContain("Tiêu đề 1–200 ký tự.");
	});
});
