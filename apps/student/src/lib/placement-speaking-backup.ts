export const SPEAKING_MAGIC_PEEK_BYTES = 64;

export const SPEAKING_BACKUP_DB_NAME = "msmy_student_placement_speaking_v1";
export const SPEAKING_BACKUP_DB_VERSION = 1;
export const SPEAKING_BACKUP_STORE_NAME = "recordings";
export const SPEAKING_BACKUP_TTL_MS = 24 * 60 * 60 * 1000;

export interface StudentSpeakingBackupRecord {
	key: string;
	studentId: string;
	submissionId: string;
	blob: Blob;
	mimeType: string;
	durationSec: number;
	savedAt: number;
	expiresAt: number;
}

export function buildStudentSpeakingBackupKey(
	studentId: string,
	submissionId: string,
): string {
	return `${studentId}:${submissionId}`;
}

/**
 * Đọc tối đa `maxBytes` byte đầu của Blob để kiểm tra chữ ký định dạng audio
 * (magic bytes) một cách an toàn trên mọi trình duyệt kể cả iOS WebKit cũ.
 */
export async function readBlobHeadBytes(
	blob: Blob,
	maxBytes = SPEAKING_MAGIC_PEEK_BYTES,
): Promise<Uint8Array | null> {
	if (!blob || maxBytes <= 0 || blob.size <= 0) return null;
	const limit = Math.min(blob.size, Math.max(1, Math.trunc(maxBytes)));
	const slice = typeof blob.slice === "function" ? blob.slice(0, limit) : blob;

	try {
		if (typeof slice.arrayBuffer === "function") {
			const buf = await slice.arrayBuffer();
			return new Uint8Array(buf, 0, Math.min(buf.byteLength, limit));
		}
	} catch {
		// Fallback sang FileReader hoặc Response khi arrayBuffer không khả dụng.
	}

	try {
		if (typeof FileReader !== "undefined") {
			const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => {
					if (reader.result && typeof reader.result !== "string") {
						resolve(reader.result);
					} else {
						reject(new Error("FileReader did not return ArrayBuffer"));
					}
				};
				reader.onerror = () =>
					reject(reader.error ?? new Error("FileReader error"));
				reader.readAsArrayBuffer(slice);
			});
			return new Uint8Array(buf, 0, Math.min(buf.byteLength, limit));
		}
	} catch {
		// Fallback sang Response.
	}

	try {
		if (typeof Response !== "undefined") {
			const buf = await new Response(slice).arrayBuffer();
			return new Uint8Array(buf, 0, Math.min(buf.byteLength, limit));
		}
	} catch {
		// Không đọc được byte đầu; trả null để dùng fallback MIME.
	}

	return null;
}

function resolveIdbFactory(explicit?: IDBFactory | null): IDBFactory | null {
	if (explicit !== undefined) return explicit;
	try {
		if (typeof globalThis !== "undefined" && globalThis.indexedDB) {
			return globalThis.indexedDB;
		}
	} catch {
		// Private browsing / WebView bị chặn quyền IndexedDB.
	}
	return null;
}

function openSpeakingBackupDb(idbFactory: IDBFactory): Promise<IDBDatabase> {
	return new Promise<IDBDatabase>((resolve, reject) => {
		let settled = false;
		const finishResolve = (db: IDBDatabase) => {
			if (settled) return;
			settled = true;
			resolve(db);
		};
		const finishReject = (err: unknown) => {
			if (settled) return;
			settled = true;
			reject(err);
		};

		let req: IDBOpenDBRequest;
		try {
			req = idbFactory.open(
				SPEAKING_BACKUP_DB_NAME,
				SPEAKING_BACKUP_DB_VERSION,
			);
		} catch (err) {
			finishReject(err);
			return;
		}

		req.onupgradeneeded = () => {
			try {
				const db = req.result;
				if (!db.objectStoreNames.contains(SPEAKING_BACKUP_STORE_NAME)) {
					db.createObjectStore(SPEAKING_BACKUP_STORE_NAME, {
						keyPath: "key",
					});
				}
			} catch (err) {
				finishReject(err);
			}
		};
		req.onsuccess = () => finishResolve(req.result);
		req.onerror = () =>
			finishReject(req.error ?? new Error("IndexedDB open failed"));
		req.onblocked = () => finishReject(new Error("IndexedDB open blocked"));
	});
}

function closeDbSafely(db: IDBDatabase | null): void {
	if (!db) return;
	try {
		db.close();
	} catch {
		// Bỏ qua lỗi khi đóng kết nối IndexedDB.
	}
}

function isValidStoredBlob(value: unknown): value is Blob {
	if (!value || typeof value !== "object") return false;
	const candidate = value as { size?: unknown };
	return (
		typeof candidate.size === "number" &&
		Number.isFinite(candidate.size) &&
		candidate.size > 0
	);
}

/**
 * Lưu bản sao tạm của bản ghi Speaking vào IndexedDB (TTL 24 giờ) để tự động
 * khôi phục nếu người học bị tải lại trang giữa lúc tải lên. Fail-open: không
 * bao giờ ném lỗi nếu IndexedDB bị chặn hoặc hết dung lượng.
 */
export async function saveStudentSpeakingBackup(
	input: {
		studentId: string;
		submissionId: string;
		blob: Blob;
		mimeType: string;
		durationSec: number;
	},
	opts?: { now?: number; idbFactory?: IDBFactory | null },
): Promise<boolean> {
	if (
		!input.studentId ||
		!input.submissionId ||
		!isValidStoredBlob(input.blob)
	) {
		return false;
	}
	const idb = resolveIdbFactory(opts?.idbFactory);
	if (!idb) return false;

	let db: IDBDatabase | null = null;
	try {
		db = await openSpeakingBackupDb(idb);
		const now = opts?.now ?? Date.now();
		const record: StudentSpeakingBackupRecord = {
			key: buildStudentSpeakingBackupKey(input.studentId, input.submissionId),
			studentId: input.studentId,
			submissionId: input.submissionId,
			blob: input.blob,
			mimeType: input.mimeType || input.blob.type || "",
			durationSec: Math.max(0, Math.round(input.durationSec)),
			savedAt: now,
			expiresAt: now + SPEAKING_BACKUP_TTL_MS,
		};

		const activeDb = db;
		await new Promise<void>((resolve, reject) => {
			let settled = false;
			const done = () => {
				if (settled) return;
				settled = true;
				resolve();
			};
			const fail = (err: unknown) => {
				if (settled) return;
				settled = true;
				reject(err);
			};
			const tx = activeDb.transaction(SPEAKING_BACKUP_STORE_NAME, "readwrite");
			tx.oncomplete = done;
			tx.onerror = () => fail(tx.error ?? new Error("IndexedDB tx error"));
			tx.onabort = () => fail(tx.error ?? new Error("IndexedDB tx aborted"));
			const store = tx.objectStore(SPEAKING_BACKUP_STORE_NAME);
			const req = store.put(record);
			req.onerror = () => fail(req.error ?? new Error("IndexedDB put error"));
		});
		return true;
	} catch {
		return false;
	} finally {
		closeDbSafely(db);
	}
}

/**
 * Xoá bản sao tạm của bản ghi Speaking khỏi IndexedDB. Fail-open: không bao
 * giờ ném lỗi nếu IndexedDB không khả dụng.
 */
export async function deleteStudentSpeakingBackup(
	studentId: string,
	submissionId: string,
	opts?: { idbFactory?: IDBFactory | null },
): Promise<boolean> {
	if (!studentId || !submissionId) return false;
	const idb = resolveIdbFactory(opts?.idbFactory);
	if (!idb) return false;

	let db: IDBDatabase | null = null;
	try {
		db = await openSpeakingBackupDb(idb);
		const key = buildStudentSpeakingBackupKey(studentId, submissionId);
		const activeDb = db;
		await new Promise<void>((resolve, reject) => {
			let settled = false;
			const done = () => {
				if (settled) return;
				settled = true;
				resolve();
			};
			const fail = (err: unknown) => {
				if (settled) return;
				settled = true;
				reject(err);
			};
			const tx = activeDb.transaction(SPEAKING_BACKUP_STORE_NAME, "readwrite");
			tx.oncomplete = done;
			tx.onerror = () => fail(tx.error ?? new Error("IndexedDB tx error"));
			tx.onabort = () => fail(tx.error ?? new Error("IndexedDB tx aborted"));
			const store = tx.objectStore(SPEAKING_BACKUP_STORE_NAME);
			const req = store.delete(key);
			req.onerror = () =>
				fail(req.error ?? new Error("IndexedDB delete error"));
		});
		return true;
	} catch {
		return false;
	} finally {
		closeDbSafely(db);
	}
}

/**
 * Đọc bản sao tạm của bản ghi Speaking từ IndexedDB. Tự động xoá và trả `null`
 * nếu bản ghi đã quá hạn TTL (24 giờ) hoặc blob rỗng/không hợp lệ. Fail-open.
 */
export async function loadStudentSpeakingBackup(
	studentId: string,
	submissionId: string,
	opts?: { now?: number; idbFactory?: IDBFactory | null },
): Promise<StudentSpeakingBackupRecord | null> {
	if (!studentId || !submissionId) return null;
	const idb = resolveIdbFactory(opts?.idbFactory);
	if (!idb) return null;

	let db: IDBDatabase | null = null;
	let shouldDelete = false;
	try {
		db = await openSpeakingBackupDb(idb);
		const key = buildStudentSpeakingBackupKey(studentId, submissionId);
		const activeDb = db;
		const raw = await new Promise<unknown>((resolve, reject) => {
			let settled = false;
			const done = (val: unknown) => {
				if (settled) return;
				settled = true;
				resolve(val);
			};
			const fail = (err: unknown) => {
				if (settled) return;
				settled = true;
				reject(err);
			};
			const tx = activeDb.transaction(SPEAKING_BACKUP_STORE_NAME, "readonly");
			tx.onerror = () => fail(tx.error ?? new Error("IndexedDB tx error"));
			tx.onabort = () => fail(tx.error ?? new Error("IndexedDB tx aborted"));
			const store = tx.objectStore(SPEAKING_BACKUP_STORE_NAME);
			const req = store.get(key);
			req.onsuccess = () => done(req.result);
			req.onerror = () => fail(req.error ?? new Error("IndexedDB get error"));
		});

		if (!raw || typeof raw !== "object") {
			return null;
		}
		const record = raw as Partial<StudentSpeakingBackupRecord>;
		const now = opts?.now ?? Date.now();
		const isExpired =
			typeof record.expiresAt !== "number" ||
			!Number.isFinite(record.expiresAt) ||
			record.expiresAt <= now;
		const hasValidBlob = isValidStoredBlob(record.blob);

		if (
			isExpired ||
			!hasValidBlob ||
			typeof record.key !== "string" ||
			typeof record.studentId !== "string" ||
			typeof record.submissionId !== "string"
		) {
			shouldDelete = true;
			return null;
		}

		return {
			key: record.key,
			studentId: record.studentId,
			submissionId: record.submissionId,
			blob: record.blob as Blob,
			mimeType:
				typeof record.mimeType === "string"
					? record.mimeType
					: (record.blob as Blob).type || "",
			durationSec:
				typeof record.durationSec === "number" &&
				Number.isFinite(record.durationSec)
					? Math.max(0, Math.round(record.durationSec))
					: 0,
			savedAt:
				typeof record.savedAt === "number" && Number.isFinite(record.savedAt)
					? record.savedAt
					: 0,
			expiresAt: record.expiresAt as number,
		};
	} catch {
		return null;
	} finally {
		closeDbSafely(db);
		if (shouldDelete) {
			await deleteStudentSpeakingBackup(studentId, submissionId, {
				idbFactory: idb,
			});
		}
	}
}
