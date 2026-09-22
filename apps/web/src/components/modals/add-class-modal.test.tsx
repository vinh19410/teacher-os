import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const templates = [
	{
		id: "syl-skills",
		name: "IELTS Foundation",
		skills: ["Writing", "Speaking"],
	},
	{
		id: "syl-empty",
		name: "Giao tiếp A1",
		skills: [],
	},
];

vi.mock("@/lib/repos/use-syllabus", () => ({
	useSyllabus: () => ({
		templates,
		syllabi: templates,
		syllabusById: (id: string) => templates.find((item) => item.id === id),
	}),
}));

vi.mock("@/lib/use-kernel-form-submit", () => ({
	useKernelFormSubmit: () => ({
		saving: false,
		error: undefined,
		setError: () => undefined,
		notice: undefined,
		submitBlocked: false,
		run: async () => null,
		reconcile: async () => false,
	}),
}));

import type {
	Syllabus,
	SyllabusLesson,
	SyllabusLessonKind,
} from "@/lib/mock-data";
import {
	AddClassModal,
	ClassTemplatePicker,
	sessionsFromTemplate,
	skillsFromTemplate,
} from "./add-class-modal";

function linkedSelectId(html: string) {
	const match = html.match(
		/<label for="([^"]+)"[^>]*>Template giáo trình<\/label>/,
	);
	expect(match?.[1]).toBeTruthy();
	const id = match?.[1] ?? "";
	expect(html).toContain(`<select id="${id}"`);
	return id;
}

describe("ClassTemplatePicker syllabus skills", () => {
	it("shows a skill count on every option and no hint for an empty class", () => {
		const html = renderToStaticMarkup(
			<ClassTemplatePicker
				templates={templates}
				templateId=""
				onTemplateId={() => undefined}
			/>,
		);

		expect(html).toContain("IELTS Foundation · 2 kỹ năng");
		expect(html).toContain("Giao tiếp A1 · 0 kỹ năng");
		expect(html).toContain(">— Lớp trống —<");
		expect(html).not.toContain("Kỹ năng giáo trình");
		expect(html).not.toContain("Syllabus chưa khai báo kỹ năng");
		linkedSelectId(html);
	});

	it("shows syllabus skill tags while the template select stays labelled", () => {
		const html = renderToStaticMarkup(
			<ClassTemplatePicker
				templates={templates}
				templateId="syl-skills"
				onTemplateId={() => undefined}
			/>,
		);

		expect(html).toContain("Kỹ năng giáo trình");
		expect(html).toContain(">Writing<");
		expect(html).toContain(">Speaking<");
		expect(html).not.toContain("Syllabus chưa khai báo kỹ năng");
		linkedSelectId(html);
	});

	it("shows the empty-skills notice and keeps the select labelled", () => {
		const html = renderToStaticMarkup(
			<ClassTemplatePicker
				templates={templates}
				templateId="syl-empty"
				onTemplateId={() => undefined}
			/>,
		);

		expect(html).toContain("Syllabus chưa khai báo kỹ năng");
		expect(html).not.toContain("Kỹ năng giáo trình");
		linkedSelectId(html);
	});
});

describe("AddClassModal template options", () => {
	it("renders skill counts and leaves class skill chips unselected", () => {
		const html = renderToStaticMarkup(
			<AddClassModal open onClose={() => undefined} />,
		);

		expect(html).toContain("IELTS Foundation · 2 kỹ năng");
		expect(html).toContain("Giao tiếp A1 · 0 kỹ năng");
		expect(html).not.toContain("Kỹ năng giáo trình");
		expect(html).not.toContain("Syllabus chưa khai báo kỹ năng");
		expect(html).toMatch(/aria-pressed="false"[^>]*>Writing</);
		expect(html).toMatch(/aria-pressed="false"[^>]*>Speaking</);
		linkedSelectId(html);
	});
});

describe("skillsFromTemplate", () => {
	it("orders skills canonically and drops unknown values", () => {
		expect(skillsFromTemplate(["Reading", "Writing", "Pronunciation"])).toEqual(
			["Writing", "Reading"],
		);
	});

	it("dedupes repeated skills", () => {
		expect(skillsFromTemplate(["Writing", "Writing"])).toEqual(["Writing"]);
	});

	it("returns all four skills unchanged for a full syllabus", () => {
		expect(
			skillsFromTemplate(["Listening", "Speaking", "Reading", "Writing"]),
		).toEqual(["Writing", "Speaking", "Reading", "Listening"]);
	});

	it("returns an empty array for an empty syllabus", () => {
		expect(skillsFromTemplate([])).toEqual([]);
	});
});

const lesson = (kind: SyllabusLessonKind): SyllabusLesson => ({
	id: `l-${kind}-${Math.random()}`,
	title: "",
	objectives: "",
	materials: "",
	kind,
	status: "upcoming",
});

describe("sessionsFromTemplate", () => {
	it("counts lessons across all modules including midterm and final sessions", () => {
		const modules = [
			{
				id: "m1",
				title: "Module 1",
				lessons: [lesson("lesson"), lesson("lesson"), lesson("midterm")],
			},
			{
				id: "m2",
				title: "Module 2",
				lessons: [lesson("lesson"), lesson("final")],
			},
		] satisfies Syllabus["modules"];
		expect(sessionsFromTemplate(modules)).toBe(5);
	});

	it("returns 0 for a syllabus without modules", () => {
		expect(sessionsFromTemplate([])).toBe(0);
	});

	it("handles null or undefined modules safely", () => {
		expect(sessionsFromTemplate(undefined)).toBe(0);
		expect(sessionsFromTemplate(null)).toBe(0);
	});
});
