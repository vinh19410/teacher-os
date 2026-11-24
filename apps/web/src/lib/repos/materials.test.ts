import { MATERIAL_ERROR_CODES } from "@teacher-os/api/material-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_HELP } from "@/components/materials/material-dialogs";
import { HttpError } from "@/lib/kernel-load-state";
import {
	attachClassMaterial,
	classMaterialsQueryKey,
	createClassMaterialLink,
	deleteMaterial,
	detachClassMaterial,
	fetchClassMaterials,
	fetchMaterials,
	formatBytes,
	isMaterialRequestError,
	MaterialRequestError,
	materialErrorMessage,
	prepareMaterialUpload,
	uploadClassMaterial,
	uploadMaterialFile,
	uploadSessionMaterial,
} from "./materials";

function fileOf(name: string, type: string, size: number): File {
	const file = new File(["x"], name, { type });
	Object.defineProperty(file, "size", { value: size });
	return file;
}

function stubFetch(status: number, body: unknown) {
	const fetchMock = vi.fn(
		async (_input: RequestInfo | URL, _init?: RequestInit) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			}),
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("prepareMaterialUpload", () => {
	it("accepts allowlisted files and resolves MIME from extension/browser aliases", () => {
		expect(prepareMaterialUpload(fileOf("de-thi.pdf", "", 1000))).toEqual({
			ok: true,
			mimeType: "application/pdf",
		});
		expect(
			prepareMaterialUpload(fileOf("nghe.m4a", "audio/x-m4a", 1000)),
		).toEqual({ ok: true, mimeType: "audio/mp4" });
		expect(
			prepareMaterialUpload(
				fileOf("bai-giang.mp4", "application/octet-stream", 1000),
			),
		).toEqual({ ok: true, mimeType: "video/mp4" });
		expect(
			prepareMaterialUpload(fileOf("nghe-win.m4a", "video/mp4", 1000)),
		).toEqual({ ok: true, mimeType: "audio/mp4" });
		expect(
			prepareMaterialUpload(
				fileOf("giao-an.docx", "application/x-zip-compressed", 1000),
			),
		).toEqual({
			ok: true,
			mimeType:
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		});
	});

	it("rejects unsupported types, spoofed browser types, unknown extensions, and dotfiles before sending", () => {
		for (const bad of [
			fileOf("trang.html", "text/html", 10),
			fileOf("spoof.mp3", "text/html", 100),
			fileOf("a.bin", "application/pdf", 100),
			fileOf("..pdf", "application/pdf", 100),
		]) {
			const prep = prepareMaterialUpload(bad);
			expect(prep.ok).toBe(false);
			if (!prep.ok) expect(prep.message).toMatch(/Định dạng chưa hỗ trợ/);
		}
	});

	it("rejects empty and oversized files with the per-kind cap", () => {
		const empty = prepareMaterialUpload(fileOf("a.pdf", "application/pdf", 0));
		expect(empty.ok).toBe(false);
		const bigDoc = prepareMaterialUpload(
			fileOf("a.pdf", "application/pdf", 26 * 1024 * 1024),
		);
		expect(bigDoc).toEqual({
			ok: false,
			message: "File quá lớn — tối đa 25 MB.",
		});
		const bigVideo = prepareMaterialUpload(
			fileOf("a.mp4", "video/mp4", 96 * 1024 * 1024),
		);
		expect(bigVideo).toEqual({
			ok: false,
			message: "File quá lớn — tối đa 95 MB.",
		});
		expect(
			prepareMaterialUpload(fileOf("a.mp4", "video/mp4", 100_000_000)).ok,
		).toBe(false);
		expect(
			prepareMaterialUpload(fileOf("a.mp4", "video/mp4", 95 * 1024 * 1024)).ok,
		).toBe(true);
		expect(UPLOAD_HELP).toContain("MP3/M4A/MP4 tối đa 95 MB");
		expect(UPLOAD_HELP).not.toContain("100 MB");
	});
});

describe("materialErrorMessage", () => {
	it("has a distinct Vietnamese message for every material error code", () => {
		const messages = MATERIAL_ERROR_CODES.map((code) =>
			materialErrorMessage(new MaterialRequestError(400, code)),
		);
		for (const message of messages) {
			expect(message).not.toBe("Không lưu được — vui lòng thử lại.");
			expect(message).not.toBe(
				"Dữ liệu không hợp lệ. Kiểm tra lại rồi thử lại.",
			);
		}
		expect(new Set(messages).size).toBe(MATERIAL_ERROR_CODES.length);
	});

	it("includes the session count for MATERIAL_IN_USE", () => {
		expect(
			materialErrorMessage(
				new MaterialRequestError(409, "MATERIAL_IN_USE", {
					sessionCount: 3,
					classCount: 0,
				}),
			),
		).toBe(
			"Tài liệu đang được dùng ở 3 buổi học. Hãy gỡ khỏi các buổi đó trước khi xóa.",
		);
	});

	it("formats MATERIAL_IN_USE with classCount alone and combined with session/syllabus counts", () => {
		expect(
			materialErrorMessage(
				new MaterialRequestError(409, "MATERIAL_IN_USE", { classCount: 2 }),
			),
		).toBe(
			"Tài liệu đang được dùng ở 2 lớp học. Hãy gỡ khỏi các lớp đó trước khi xóa.",
		);
		expect(
			materialErrorMessage(
				new MaterialRequestError(409, "MATERIAL_IN_USE", {
					sessionCount: 2,
					classCount: 1,
				}),
			),
		).toBe(
			"Tài liệu đang được dùng ở 2 buổi học và 1 lớp học. Hãy gỡ khỏi các nơi đang dùng trước khi xóa.",
		);
		expect(
			materialErrorMessage(
				new MaterialRequestError(409, "MATERIAL_IN_USE", {
					syllabusCount: 3,
					classCount: 2,
				}),
			),
		).toBe(
			"Tài liệu đang được dùng ở 3 bài trong giáo trình và 2 lớp học. Hãy gỡ khỏi các nơi đang dùng trước khi xóa.",
		);
		expect(
			materialErrorMessage(
				new MaterialRequestError(409, "MATERIAL_IN_USE", {
					sessionCount: 1,
					syllabusCount: 2,
					classCount: 3,
				}),
			),
		).toBe(
			"Tài liệu đang được dùng ở 1 buổi học, 2 bài trong giáo trình và 3 lớp học. Hãy gỡ khỏi các nơi đang dùng trước khi xóa.",
		);
	});

	it("falls back by status and for network failures", () => {
		expect(materialErrorMessage(new HttpError(413, "x"))).toBe(
			"File quá lớn so với giới hạn cho phép.",
		);
		expect(materialErrorMessage(new HttpError(403, "x"))).toMatch(
			/không có quyền/,
		);
		expect(materialErrorMessage(new TypeError("fetch failed"))).toMatch(
			/Không kết nối được/,
		);
	});
});

describe("material requests", () => {
	it("parses the 409 in-use body into a typed error", async () => {
		stubFetch(409, {
			error: "MATERIAL_IN_USE",
			code: "MATERIAL_IN_USE",
			sessionCount: 2,
			syllabusCount: 1,
			classCount: 3,
		});
		const error = await deleteMaterial("m-1").catch((e: unknown) => e);
		expect(isMaterialRequestError(error)).toBe(true);
		if (isMaterialRequestError(error)) {
			expect(error.status).toBe(409);
			expect(error.materialCode).toBe("MATERIAL_IN_USE");
			expect(error.sessionCount).toBe(2);
			expect(error.syllabusCount).toBe(1);
			expect(error.classCount).toBe(3);
		}
	});

	it("sends the list filters as query params", async () => {
		const fetchMock = stubFetch(200, { items: [] });
		await fetchMaterials({ q: " ielts ", kind: "link", folderId: "root" });
		const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(url.pathname).toBe("/api/materials");
		expect(Object.fromEntries(url.searchParams)).toEqual({
			q: "ielts",
			kind: "link",
			folderId: "root",
		});
		expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe("include");
	});

	it("uploads raw bytes with the canonical type and an encoded file name", async () => {
		const fetchMock = stubFetch(201, { material: { id: "m-1" } });
		const file = fileOf("Đề thi 1.pdf", "", 100);
		await uploadMaterialFile({
			file,
			mimeType: "application/pdf",
			folderId: "f-1",
		});
		const [input, init] = fetchMock.mock.calls[0] ?? [];
		expect(String(input)).toMatch(/\/api\/materials\/files\?folderId=f-1$/);
		expect(init?.method).toBe("PUT");
		expect(init?.body).toBe(file);
		expect(init?.headers).toEqual({
			"Content-Type": "application/pdf",
			"X-File-Name": encodeURIComponent("Đề thi 1.pdf"),
		});
	});

	it("uploads into a session under the class/date path", async () => {
		const fetchMock = stubFetch(201, { item: { id: "m-1" } });
		await uploadSessionMaterial({
			classId: "cl-1",
			date: "2026-10-12",
			file: fileOf("a.mp3", "audio/mpeg", 10),
			mimeType: "audio/mpeg",
		});
		expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
			/\/api\/classes\/cl-1\/sessions\/2026-10-12\/materials\/files$/,
		);
	});

	it("manages class shared materials under /api/classes/:classId/materials", async () => {
		expect(classMaterialsQueryKey("cl-1")).toEqual([
			"materials",
			"class",
			"cl-1",
		]);

		const getMock = stubFetch(200, { items: [{ id: "m-1" }] });
		const listed = await fetchClassMaterials("cl-1");
		expect(listed).toEqual([{ id: "m-1" }]);
		expect(String(getMock.mock.calls[0]?.[0])).toMatch(
			/\/api\/classes\/cl-1\/materials$/,
		);

		const attachMock = stubFetch(201, { item: { id: "m-1" } });
		const attached = await attachClassMaterial("cl-1", "m-1");
		expect(attached).toEqual({ id: "m-1" });
		expect(String(attachMock.mock.calls[0]?.[0])).toMatch(
			/\/api\/classes\/cl-1\/materials$/,
		);
		expect(attachMock.mock.calls[0]?.[1]?.method).toBe("POST");
		expect(attachMock.mock.calls[0]?.[1]?.body).toBe(
			JSON.stringify({ materialId: "m-1" }),
		);

		const uploadMock = stubFetch(201, { item: { id: "m-2" } });
		const file = fileOf("Đề cương.pdf", "application/pdf", 128);
		const uploaded = await uploadClassMaterial({
			classId: "cl-1",
			file,
			mimeType: "application/pdf",
		});
		expect(uploaded).toEqual({ id: "m-2" });
		expect(String(uploadMock.mock.calls[0]?.[0])).toMatch(
			/\/api\/classes\/cl-1\/materials\/files$/,
		);
		expect(uploadMock.mock.calls[0]?.[1]?.method).toBe("PUT");
		expect(uploadMock.mock.calls[0]?.[1]?.body).toBe(file);
		expect(uploadMock.mock.calls[0]?.[1]?.headers).toEqual({
			"Content-Type": "application/pdf",
			"X-File-Name": encodeURIComponent("Đề cương.pdf"),
		});

		const linkMock = stubFetch(201, { item: { id: "m-3" } });
		const created = await createClassMaterialLink("cl-1", {
			title: "Từ điển Cambridge",
			url: "https://dictionary.cambridge.org/",
			description: "Tra phát âm",
		});
		expect(created).toEqual({ id: "m-3" });
		expect(String(linkMock.mock.calls[0]?.[0])).toMatch(
			/\/api\/classes\/cl-1\/materials\/links$/,
		);
		expect(linkMock.mock.calls[0]?.[1]?.method).toBe("POST");
		expect(linkMock.mock.calls[0]?.[1]?.body).toBe(
			JSON.stringify({
				title: "Từ điển Cambridge",
				url: "https://dictionary.cambridge.org/",
				description: "Tra phát âm",
			}),
		);

		const detachMock = stubFetch(200, { ok: true });
		await detachClassMaterial("cl-1", "m-3");
		expect(String(detachMock.mock.calls[0]?.[0])).toMatch(
			/\/api\/classes\/cl-1\/materials\/m-3$/,
		);
		expect(detachMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
	});
});

describe("formatBytes", () => {
	it("formats sizes in Vietnamese locale", () => {
		expect(formatBytes(500)).toBe("500 B");
		expect(formatBytes(1536)).toBe("1,5 KB");
		expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
	});
});
