import {
	AVATAR_MAX_IMAGE_CHARS,
	AVATAR_TARGET_PX,
	isSafeAvatarSrc,
} from "@teacher-os/auth/avatar-policy";

// Re-exported so web callers import the shared policy from one place.
export { AVATAR_MAX_IMAGE_CHARS, AVATAR_TARGET_PX, isSafeAvatarSrc };

const ACCEPTED_AVATAR_TYPES: readonly string[] = [
	"image/jpeg",
	"image/png",
	"image/webp",
];
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

const QUALITY_LADDER = [0.78, 0.6, 0.45];

/** Pure — unit-tested without a canvas (jsdom has none). */
export function pickQuality(tryIndex: number): number | null {
	if (tryIndex >= QUALITY_LADDER.length) return null;
	return QUALITY_LADDER[tryIndex];
}

/** null means the file is usable; otherwise a Vietnamese user-facing message. */
export function validateAvatarFile(file: File): string | null {
	if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
		return "Ảnh phải ở định dạng JPEG, PNG hoặc WebP.";
	}
	if (file.size > MAX_INPUT_BYTES) {
		return "Ảnh gốc tối đa 10MB — hãy chọn ảnh nhỏ hơn.";
	}
	return null;
}

/**
 * Resizes to a square AVATAR_TARGET_PX data URL under AVATAR_MAX_IMAGE_CHARS.
 * DOM/canvas work stays inside this function so the pure helpers above remain
 * testable in the node environment; the full path is covered by Playwright.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
	const source = await loadBitmap(file);
	const canvas = document.createElement("canvas");
	canvas.width = AVATAR_TARGET_PX;
	canvas.height = AVATAR_TARGET_PX;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Không tạo được canvas để xử lý ảnh.");

	// Opaque white backdrop first: transparent PNG/WebP sources must not turn
	// black once flattened into JPEG.
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	drawCenterCropped(ctx, source);

	for (let tryIndex = 0; ; tryIndex += 1) {
		const quality = pickQuality(tryIndex);
		if (quality === null) {
			throw new Error("Ảnh quá lớn sau khi nén — hãy thử ảnh khác.");
		}
		const dataUrl = canvas.toDataURL("image/jpeg", quality);
		if (dataUrl.length <= AVATAR_MAX_IMAGE_CHARS) return dataUrl;
	}
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
	if (typeof createImageBitmap === "function") {
		try {
			// "from-image" bakes EXIF orientation into the bitmap, so phone
			// portraits stay upright through the center-crop. The <img>
			// fallback below cannot guarantee that — it is a last resort only.
			return await createImageBitmap(file, { imageOrientation: "from-image" });
		} catch {
			// fall through to the <img> path
		}
	}
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("Không đọc được tệp ảnh."));
		};
		img.src = url;
	});
}

function drawCenterCropped(
	ctx: CanvasRenderingContext2D,
	source: ImageBitmap | HTMLImageElement,
): void {
	const isBitmap =
		typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap;
	const sourceWidth = isBitmap
		? source.width
		: (source as HTMLImageElement).naturalWidth || source.width;
	const sourceHeight = isBitmap
		? source.height
		: (source as HTMLImageElement).naturalHeight || source.height;
	const side = Math.min(sourceWidth, sourceHeight);
	const sx = (sourceWidth - side) / 2;
	const sy = (sourceHeight - side) / 2;
	ctx.drawImage(
		source,
		sx,
		sy,
		side,
		side,
		0,
		0,
		AVATAR_TARGET_PX,
		AVATAR_TARGET_PX,
	);
}
