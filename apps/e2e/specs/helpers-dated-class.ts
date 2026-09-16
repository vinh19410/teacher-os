/** Test-seeding helper for dated classes (#98). Wraps the POST /api/classes
 * CSRF contract so specs stay declarative: cookies ride on the page's request
 * context after signUpViaUi, and the Origin must equal the Vite dev origin
 * (:8001) or the kernel middleware answers 403. Reload (never goto) afterwards
 * — the ['kernel'] cache is staleTime: Infinity. Returns nothing; callers
 * navigate themselves. */
import type { Page } from "@playwright/test";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

export async function seedDatedClass(
	page: Page,
	opts: {
		name: string;
		schedule: { days: number[]; start?: string; end?: string };
		startDate: string;
		sessionsTotal?: number;
	},
): Promise<string> {
	const response = await page.request.post(
		`${API_ORIGIN}/api/classes`,
		{
			data: {
				name: opts.name,
				type: "ielts",
				level: "",
				skills: ["Writing"],
				mode: "Online",
				templateId: "",
				schedule: {
					days: opts.schedule.days,
					start: opts.schedule.start ?? "19:00",
					end: opts.schedule.end ?? "20:30",
				},
				sessionsTotal: opts.sessionsTotal ?? 4,
				startDate: opts.startDate,
			},
			headers: {
				Origin: WEB_ORIGIN,
				"Content-Type": "application/json",
			},
		},
	);
	if (response.status() !== 201) {
		throw new Error(
			`seedDatedClass failed (${response.status()}): ${await response.text()}`,
		);
	}
	const body = (await response.json()) as { id: string };
	return body.id;
}
