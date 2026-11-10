/** Test-seeding helper for dated classes (#98). Wraps the POST /api/classes
 * CSRF contract so specs stay declarative: cookies ride on the page's request
 * context after signUpViaApi, and the Origin must equal the Vite dev origin
 * (:8001) or the kernel middleware answers 403. Reload (never goto) afterwards
 * — the ['kernel'] cache is staleTime: Infinity. Returns nothing; callers
 * navigate themselves. */
import type { Page } from "@playwright/test";
import { seedStudent, vnWeekdayMon0 } from "./helpers";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

export async function seedDatedClass(
	page: Page,
	opts: {
		name: string;
		schedule?: { days?: number[]; start?: string; end?: string };
		startDate: string;
		sessionsTotal?: number;
		schedulingMode?: "auto" | "manual";
		/** Tạo lớp từ template giáo trình (#655) — vắng mặt là lớp trống. */
		templateId?: string;
		students?: { teacherEmail?: string; names: string[] };
	},
): Promise<string> {
	const response = await page.request.post(`${API_ORIGIN}/api/classes`, {
		data: {
			name: opts.name,
			type: "ielts",
			level: "",
			skills: ["Writing"],
			mode: "Online",
			templateId: opts.templateId ?? "",
			schedule: {
				days: opts.schedule?.days ?? [vnWeekdayMon0(opts.startDate)],
				start: opts.schedule?.start ?? "19:00",
				end: opts.schedule?.end ?? "20:30",
			},
			sessionsTotal: opts.sessionsTotal ?? 4,
			startDate: opts.startDate,
			schedulingMode: opts.schedulingMode ?? "auto",
		},
		headers: {
			Origin: WEB_ORIGIN,
			"Content-Type": "application/json",
		},
	});
	if (response.status() !== 201) {
		throw new Error(
			`seedDatedClass failed (${response.status()}): ${await response.text()}`,
		);
	}
	const body = (await response.json()) as { id: string };
	const classId = body.id;

	if (opts.students) {
		for (const studentName of opts.students.names) {
			const st = await seedStudent({
				teacherEmail: opts.students.teacherEmail,
				name: studentName,
			});
			const enrollRes = await page.request.post(
				`${API_ORIGIN}/api/classes/${classId}/enroll`,
				{
					data: { studentId: st.id },
					headers: {
						Origin: WEB_ORIGIN,
						"Content-Type": "application/json",
					},
				},
			);
			if (enrollRes.status() !== 201) {
				throw new Error(
					`enroll failed (${enrollRes.status()}): ${await enrollRes.text()}`,
				);
			}
			const { id: enrollmentId } = (await enrollRes.json()) as { id: string };
			const acceptRes = await page.request.post(
				`${API_ORIGIN}/api/enrollments/${enrollmentId}/accept`,
				{
					data: {},
					headers: {
						Origin: WEB_ORIGIN,
						"Content-Type": "application/json",
					},
				},
			);
			if (acceptRes.status() !== 200) {
				throw new Error(
					`accept failed (${acceptRes.status()}): ${await acceptRes.text()}`,
				);
			}
		}
	}

	return classId;
}

/** Seeds an EMPTY IELTS Writing syllabus template (no modules/lessons) and
 * returns the label its <option> carries in the create-class TemplatePicker.
 * Since #649 a class created without a template is manual (0 buổi, "Tổng số
 * buổi" field hidden); picking this template makes the class auto-scheduled
 * while "Tổng số buổi" stays editable, because an empty syllabus has no
 * sessions to auto-fill (skills are locked to Writing — IELTS templates need
 * at least one skill). Reload or goto afterwards so the ['kernel'] snapshot
 * (staleTime: Infinity) picks the template up. */
export async function seedEmptySyllabusTemplate(
	page: Page,
	name: string,
): Promise<string> {
	const response = await page.request.post(
		`${API_ORIGIN}/api/syllabus-templates`,
		{
			data: {
				name,
				type: "ielts",
				level: "Band 7.0",
				skills: ["Writing"],
				description: "",
			},
			headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
		},
	);
	if (response.status() !== 201) {
		throw new Error(
			`seedEmptySyllabusTemplate failed (${response.status()}): ${await response.text()}`,
		);
	}
	return `${name} · 0 buổi`;
}
