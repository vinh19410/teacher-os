import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { Report } from "@/lib/mock-data";

export function mapReports(snapshot: KernelSnapshot): Report[] {
	return snapshot.reports.map((row) => ({
		id: row.id,
		sid: row.studentId,
		period: row.period,
		sessions: row.sessions,
		status: row.status,
		sent: row.sent,
		read: row.read,
	}));
}
