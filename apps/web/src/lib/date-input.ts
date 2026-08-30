const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateInput(value: string): Date | null {
	const match = DATE_INPUT_PATTERN.exec(value);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date();
	date.setHours(0, 0, 0, 0);
	date.setFullYear(year, month - 1, day);

	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}

	return date;
}

export function formatDateInputValue(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

export function getTomorrowDateInputValue(now = new Date()): string {
	const tomorrow = new Date(now);
	tomorrow.setHours(0, 0, 0, 0);
	tomorrow.setDate(tomorrow.getDate() + 1);
	return formatDateInputValue(tomorrow);
}

export function isFutureDateInputValue(
	value: string,
	now = new Date(),
): boolean {
	const selected = parseDateInput(value);
	if (!selected) return false;

	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	return selected.getTime() > today.getTime();
}

/**
 * Roundtrip calendar check: the value must be a real yyyy-mm-dd date
 * (rejects 2026-02-30). Unlike isFutureDateInputValue, past and today are
 * valid — invoice due dates may legitimately be today or overdue.
 */
export function isRealDateInputValue(value: string): boolean {
	return parseDateInput(value) !== null;
}
