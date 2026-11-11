export const ACTIVE_STUDENT_ORG_KEY = "active_student_org_id";
export const ACTIVE_STUDENT_USER_KEY = "active_student_user_id";

const listeners = new Set<() => void>();
let windowStorageBound = false;

function notifyListeners(): void {
	for (const listener of listeners) {
		listener();
	}
}

function ensureWindowStorageListener(): void {
	if (windowStorageBound || typeof window === "undefined") return;
	windowStorageBound = true;
	window.addEventListener("storage", (event) => {
		if (
			event.key === null ||
			event.key === ACTIVE_STUDENT_ORG_KEY ||
			event.key === ACTIVE_STUDENT_USER_KEY
		) {
			notifyListeners();
		}
	});
}

export function getActiveStudentOrgId(): string | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = localStorage.getItem(ACTIVE_STUDENT_ORG_KEY)?.trim();
		return raw ? raw : null;
	} catch {
		return null;
	}
}

export function setActiveStudentOrgId(orgId: string): void {
	if (typeof window === "undefined") return;
	const trimmed = orgId.trim();
	if (!trimmed) {
		clearActiveStudentOrgId();
		return;
	}
	try {
		const prev = localStorage.getItem(ACTIVE_STUDENT_ORG_KEY);
		if (prev === trimmed) return;
		localStorage.setItem(ACTIVE_STUDENT_ORG_KEY, trimmed);
		notifyListeners();
	} catch {
		// Ignore storage quota / privacy errors
	}
}

export function clearActiveStudentOrgId(): void {
	if (typeof window === "undefined") return;
	try {
		const hadValue = localStorage.getItem(ACTIVE_STUDENT_ORG_KEY) !== null;
		localStorage.removeItem(ACTIVE_STUDENT_ORG_KEY);
		if (hadValue) {
			notifyListeners();
		}
	} catch {
		// Ignore storage errors
	}
}

/**
 * Cô lập `active_student_org_id` theo phiên đăng nhập hiện tại (#675):
 * - Khi hết phiên / đăng xuất (`userId` rỗng): xoá cả user key và org key.
 * - Khi `userId` khác với phiên trước trên cùng trình duyệt: xoá ngay org cũ
 *   của tài khoản trước để không rò sang tài khoản mới.
 * - Chủ đích giữ `if (prevUser && prevUser !== trimmedUser)` khi nâng cấp lần
 *   đầu từ phiên bản trước #675 (`!prevUser`) để không reset org phụ đang chọn
 *   của học viên đa-org hiện hữu; sau lần đầu ghi `ACTIVE_STUDENT_USER_KEY`,
 *   mọi lần chuyển tài khoản kế tiếp đều được khoá chặt.
 */
export function syncActiveStudentUser(userId: string | null | undefined): void {
	if (typeof window === "undefined") return;
	const trimmedUser = userId?.trim();
	if (!trimmedUser) {
		try {
			localStorage.removeItem(ACTIVE_STUDENT_USER_KEY);
		} catch {
			// Ignore storage errors
		}
		clearActiveStudentOrgId();
		return;
	}
	try {
		const prevUser = localStorage.getItem(ACTIVE_STUDENT_USER_KEY)?.trim();
		if (prevUser && prevUser !== trimmedUser) {
			clearActiveStudentOrgId();
		}
		if (prevUser !== trimmedUser) {
			localStorage.setItem(ACTIVE_STUDENT_USER_KEY, trimmedUser);
		}
	} catch {
		// Ignore storage errors
	}
}

export function subscribeActiveStudentOrg(listener: () => void): () => void {
	ensureWindowStorageListener();
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
