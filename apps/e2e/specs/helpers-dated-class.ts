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
			templateId: "",
			schedule: {
				days: opts.schedule?.days ?? [vnWeekdayMon0(opts.startDate)],
				start: opts.schedule?.start ?? "19:00",
				end: opts.schedule?.end ?? "20:30",
			},
			sessionsTotal: opts.sessionsTotal ?? 4,
			startDate: opts.startDate,
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
