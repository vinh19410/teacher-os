import type {
	StudentAssignment,
	StudentClassLesson,
} from "@teacher-os/api/contracts";
import type { StudentClassMaterialView } from "@teacher-os/api/material-contracts";
import { describe, expect, it } from "vitest";
import {
	buildClassDetailSearch,
	buildSessionNumberByDate,
	extractSafeHostname,
	formatMaterialTypeLabel,
	formatSessionCountdown,
	formatZoomOpenAtLabel,
	isClassAssignmentDueNow,
	isStudyPackUpcoming,
	normalizeVietnameseSearch,
	parseClassDetailSearch,
	resolveAssignmentExpectedDateISO,
} from "./class-detail-helpers";

function makeLesson(
	overrides: Partial<StudentClassLesson> & { id: string },
): StudentClassLesson {
	return {
		date: "2026-11-26",
		day: 4,
		time: "19:00",
		dur: 90,
		status: "upcoming",
		topic: "",
		...overrides,
	};
}

function makeMaterial(
	overrides: Partial<StudentClassMaterialView> & { id: string },
): StudentClassMaterialView {
	return {
		title: "Tài liệu",
		description: "",
		kind: "file",
		url: null,
		mimeType: "application/pdf",
		sizeBytes: 1024,
		originalName: "doc.pdf",
		position: 0,
		...overrides,
	};
}

describe("parseClassDetailSearch & buildClassDetailSearch", () => {
	it("omits default values and rejects unknown or prototype keys", () => {
		expect(parseClassDetailSearch({})).toEqual({});
		expect(
			parseClassDetailSearch({
				tab: "journey",
				jf: "all",
				af: "all",
				mk: "all",
				mq: "   ",
			}),
		).toEqual({});
		expect(
			parseClassDetailSearch({
				tab: "constructor",
				jf: "toString",
				af: "__proto__",
				mk: "valueOf",
			}),
		).toEqual({});
	});

	it("keeps only params belonging to the active tab during both parse and build", () => {
		expect(
			parseClassDetailSearch({
				tab: "journey",
				jf: "ahead",
				af: "todo",
				mk: "link",
				mq: "cambridge",
			}),
		).toEqual({ jf: "ahead" });

		expect(
			parseClassDetailSearch({
				tab: "assignments",
				jf: "done",
				af: "graded",
				mk: "media",
				mq: "audio",
			}),
		).toEqual({ tab: "assignments", af: "graded" });

		expect(
			parseClassDetailSearch({
				tab: "materials",
				jf: "done",
				af: "todo",
				mk: "media",
				mq: "cambridge",
			}),
		).toEqual({ tab: "materials", mk: "media", mq: "cambridge" });

		expect(
			buildClassDetailSearch({
				tab: "journey",
				jf: "all",
				af: "todo",
				mk: "file",
				mq: "leaked",
			}),
		).toEqual({});
		expect(
			buildClassDetailSearch({
				tab: "materials",
				mk: "all",
				mq: "  cambridge  ",
			}),
		).toEqual({ tab: "materials", mq: "cambridge" });
	});

	it("coerces finite numeric mq from TanStack Router JSON.parse and strips control/Bidi chars", () => {
		expect(parseClassDetailSearch({ tab: "materials", mq: 18 })).toEqual({
			tab: "materials",
			mq: "18",
		});
		expect(parseClassDetailSearch({ tab: "materials", mq: 6.5 })).toEqual({
			tab: "materials",
			mq: "6.5",
		});
		expect(parseClassDetailSearch({ tab: "materials", mq: true })).toEqual({
			tab: "materials",
		});
		expect(parseClassDetailSearch({ tab: "materials", mq: { a: 1 } })).toEqual({
			tab: "materials",
		});
		expect(
			parseClassDetailSearch({
				tab: "materials",
				mq: Number.POSITIVE_INFINITY,
			}),
		).toEqual({ tab: "materials" });

		// Strip U+202E Bidi override, newline, NUL and cap at 200 chars
		expect(
			parseClassDetailSearch({
				tab: "materials",
				mq: " \u202Eabc\ndef\u0000ghi ",
			}),
		).toEqual({
			tab: "materials",
			mq: "abcdefghi",
		});
		const longText = "a".repeat(250);
		expect(
			parseClassDetailSearch({ tab: "materials", mq: longText }).mq,
		).toHaveLength(200);
	});
});

describe("formatSessionCountdown", () => {
	it("formats days+hours, hours+minutes, minutes (min 1 phút), live, and null when ended/invalid", () => {
		// Session: 2026-11-27 19:00 VN (90 min -> ends 20:30 VN)
		// 1 day 5 hours before: 2026-11-26 14:00 VN
		expect(
			formatSessionCountdown(
				"2026-11-27",
				"19:00",
				90,
				Date.parse("2026-11-26T14:00:00+07:00"),
			),
		).toBe("Bắt đầu sau 1 ngày 5 giờ");

		// Exactly 2 days before
		expect(
			formatSessionCountdown(
				"2026-11-28",
				"19:00",
				90,
				Date.parse("2026-11-26T19:00:00+07:00"),
			),
		).toBe("Bắt đầu sau 2 ngày");

		// 23 hours 59 minutes 40 seconds before -> rounds to 1 ngày (never 24 giờ)
		expect(
			formatSessionCountdown(
				"2026-11-27",
				"19:00",
				90,
				Date.parse("2026-11-26T19:00:20+07:00"),
			),
		).toBe("Bắt đầu sau 1 ngày");

		// 3 hours 15 minutes before
		expect(
			formatSessionCountdown(
				"2026-11-27",
				"19:00",
				90,
				Date.parse("2026-11-27T15:45:00+07:00"),
			),
		).toBe("Bắt đầu sau 3 giờ 15 phút");

		// 30 seconds before -> clamps to 1 phút (never 0 phút)
		expect(
			formatSessionCountdown(
				"2026-11-27",
				"19:00",
				90,
				Date.parse("2026-11-27T18:59:30+07:00"),
			),
		).toBe("Bắt đầu sau 1 phút");

		// Live session (at start and midway)
		expect(
			formatSessionCountdown(
				"2026-11-27",
				"19:00",
				90,
				Date.parse("2026-11-27T19:00:00+07:00"),
			),
		).toBe("Đang diễn ra");
		expect(
			formatSessionCountdown(
				"2026-11-27",
				"19:00",
				90,
				Date.parse("2026-11-27T20:29:00+07:00"),
			),
		).toBe("Đang diễn ra");

		// Ended or invalid
		expect(
			formatSessionCountdown(
				"2026-11-27",
				"19:00",
				90,
				Date.parse("2026-11-27T20:30:00+07:00"),
			),
		).toBeNull();
		expect(formatSessionCountdown(null, "19:00", 90, Date.now())).toBeNull();
		expect(
			formatSessionCountdown("2026-11-27", "7pm", 90, Date.now()),
		).toBeNull();
	});
});

describe("formatZoomOpenAtLabel", () => {
	it("returns HH:mm on same day, HH:mm dd/mm on another day, and null when already open or invalid", () => {
		// Same day, too early (18:00 < 18:30 open window for 19:00)
		expect(
			formatZoomOpenAtLabel({
				date: "2026-11-26",
				time: "19:00",
				dur: 90,
				todayISO: "2026-11-26",
				nowMs: Date.parse("2026-11-26T18:00:00+07:00"),
			}),
		).toBe("18:30");

		// Different day -> includes dd/mm
		expect(
			formatZoomOpenAtLabel({
				date: "2026-11-28",
				time: "19:00",
				dur: 90,
				todayISO: "2026-11-26",
				nowMs: Date.parse("2026-11-26T14:00:00+07:00"),
			}),
		).toBe("18:30 28/11");

		// Already inside join window (18:30)
		expect(
			formatZoomOpenAtLabel({
				date: "2026-11-26",
				time: "19:00",
				dur: 90,
				todayISO: "2026-11-26",
				nowMs: Date.parse("2026-11-26T18:30:00+07:00"),
			}),
		).toBeNull();

		// Missing date
		expect(
			formatZoomOpenAtLabel({
				date: null,
				time: "19:00",
				dur: 90,
				todayISO: "2026-11-26",
				nowMs: Date.parse("2026-11-26T14:00:00+07:00"),
			}),
		).toBeNull();
	});
});

describe("normalizeVietnameseSearch", () => {
	it("strips diacritics, normalizes đ/Đ, lowercases, and collapses spaces", () => {
		expect(normalizeVietnameseSearch("  Lộ trình   & Nội quy ĐỀ THI ")).toBe(
			"lo trinh & noi quy de thi",
		);
		expect(normalizeVietnameseSearch("Đề cương Cambridge 15")).toBe(
			"de cuong cambridge 15",
		);
	});
});

describe("formatMaterialTypeLabel & extractSafeHostname", () => {
	it("maps MATERIAL_MIME labels and safe fallbacks", () => {
		expect(
			formatMaterialTypeLabel(
				makeMaterial({ id: "1", kind: "file", mimeType: "application/pdf" }),
			),
		).toBe("PDF");
		expect(
			formatMaterialTypeLabel(
				makeMaterial({
					id: "2",
					kind: "file",
					mimeType:
						"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				}),
			),
		).toBe("DOCX");
		expect(
			formatMaterialTypeLabel(
				makeMaterial({ id: "3", kind: "media", mimeType: "audio/mpeg" }),
			),
		).toBe("Audio · MP3");
		expect(
			formatMaterialTypeLabel(
				makeMaterial({ id: "4", kind: "media", mimeType: "video/mp4" }),
			),
		).toBe("Video · MP4");
		expect(
			formatMaterialTypeLabel(
				makeMaterial({
					id: "5",
					kind: "link",
					mimeType: null,
					url: "https://dictionary.cambridge.org/dictionary",
				}),
			),
		).toBe("Liên kết");
		expect(
			formatMaterialTypeLabel(
				makeMaterial({ id: "6", kind: "file", mimeType: null }),
			),
		).toBe("Tài liệu");
	});

	it("extracts hostname only for safe http/https URLs", () => {
		expect(extractSafeHostname("https://dictionary.cambridge.org/test")).toBe(
			"dictionary.cambridge.org",
		);
		expect(extractSafeHostname("http://example.com:8080/path")).toBe(
			"example.com",
		);
		expect(extractSafeHostname("javascript:alert(1)")).toBeNull();
		expect(extractSafeHostname("not-a-url")).toBeNull();
		expect(extractSafeHostname(null)).toBeNull();
	});
});

describe("buildSessionNumberByDate", () => {
	it("assigns 1-based teaching session numbers skipping holiday and legacy null-date rows", () => {
		const map = buildSessionNumberByDate([
			makeLesson({ id: "l1", date: "2026-11-02", status: "completed" }),
			makeLesson({ id: "l-hol", date: "2026-11-04", status: "holiday" }),
			makeLesson({ id: "l2", date: "2026-11-06", status: "upcoming" }),
			makeLesson({ id: "l-legacy", date: null, status: "upcoming" }),
		]);
		expect(map.get("2026-11-02")).toBe(1);
		expect(map.has("2026-11-04")).toBe(false);
		expect(map.get("2026-11-06")).toBe(2);
		expect(map.size).toBe(2);
	});
});

function makeAssignment(
	overrides: Partial<StudentAssignment> & { id: string },
): StudentAssignment {
	return {
		source: "class_assignment",
		classId: "c1",
		className: "IELTS",
		title: "Test assignment",
		skill: "reading",
		due: "2026-11-26",
		submittedAt: null,
		gradedAt: null,
		scores: null,
		...overrides,
	};
}

describe("resolveAssignmentExpectedDateISO, isStudyPackUpcoming, isClassAssignmentDueNow", () => {
	it("resolves trimmed valid due first and safely falls back to VN date of availableAt/dueAt without throwing", () => {
		expect(
			resolveAssignmentExpectedDateISO(
				makeAssignment({ id: "a1", due: " 2026-11-25 " }),
			),
		).toBe("2026-11-25");

		// 17:00Z = 00:00+07:00 ngày hôm sau theo giờ VN
		expect(
			resolveAssignmentExpectedDateISO(
				makeAssignment({
					id: "a2",
					due: "",
					availableAt: "2026-11-24T17:00:00.000Z",
				}),
			),
		).toBe("2026-11-25");

		expect(
			resolveAssignmentExpectedDateISO(
				makeAssignment({
					id: "a3",
					due: "invalid",
					availableAt: "not-a-date",
					dueAt: "2026-11-26T10:00:00.000Z",
				}),
			),
		).toBe("2026-11-26");

		expect(
			resolveAssignmentExpectedDateISO(
				makeAssignment({
					id: "a4",
					due: "",
					availableAt: "bad",
					dueAt: "also-bad",
				}),
			),
		).toBeNull();
	});

	it("marks future study-pack assignments as upcoming while manual homework always counts as due-now", () => {
		const manualFuture = makeAssignment({
			id: "m-1",
			due: "2026-12-01",
			classStudyPackId: null,
		});
		const packPast = makeAssignment({
			id: "p-1",
			due: "2026-11-19",
			classStudyPackId: "csp-1",
		});
		const packToday = makeAssignment({
			id: "p-2",
			due: "2026-11-20",
			classStudyPackId: "csp-1",
		});
		const packFuture = makeAssignment({
			id: "p-3",
			due: "2026-11-21",
			classStudyPackId: "csp-1",
		});

		expect(isStudyPackUpcoming(manualFuture, "2026-11-20")).toBe(false);
		expect(isClassAssignmentDueNow(manualFuture, "2026-11-20")).toBe(true);

		expect(isStudyPackUpcoming(packPast, "2026-11-20")).toBe(false);
		expect(isStudyPackUpcoming(packToday, "2026-11-20")).toBe(false);
		expect(isStudyPackUpcoming(packFuture, "2026-11-20")).toBe(true);

		expect(isClassAssignmentDueNow(packPast, "2026-11-20")).toBe(true);
		expect(isClassAssignmentDueNow(packToday, "2026-11-20")).toBe(true);
		expect(isClassAssignmentDueNow(packFuture, "2026-11-20")).toBe(false);
	});
});
