import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { Notif } from "@/lib/mock-data";

export function mapNotifs(snapshot: KernelSnapshot): Notif[] {
	return snapshot.notifs.map((row) => ({ ...row }));
}
