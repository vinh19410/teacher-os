// @vitest-environment jsdom

import { useTheme } from "@teacher-os/ui/hooks/use-theme";
import {
	applyTheme,
	readTheme,
	THEME_STORAGE_KEY,
} from "@teacher-os/ui/lib/theme";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * jsdom env trong repo này không expose localStorage (Node 22 chặn global
 * experimental nếu thiếu --localstorage-file) → gán memory storage lên
 * window trước mỗi test, mô phỏng đủ hành vi đọc/ghi/throw.
 */
function memoryStorage(initial: Record<string, string> = {}) {
	const map = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
		setItem: (key: string, value: string) => {
			map.set(key, value);
		},
		removeItem: (key: string) => {
			map.delete(key);
		},
		clear: () => map.clear(),
		key: (index: number) => Array.from(map.keys())[index] ?? null,
		get length() {
			return map.size;
		},
	};
}

function installStorage(impl: ReturnType<typeof memoryStorage>) {
	Object.defineProperty(window, "localStorage", {
		value: impl,
		configurable: true,
	});
}

describe("readTheme", () => {
	it("mặc định dark khi không có lựa chọn trong storage", () => {
		installStorage(memoryStorage());
		expect(readTheme()).toBe("dark");
	});

	it("trả light khi storage ghi light", () => {
		installStorage(memoryStorage({ [THEME_STORAGE_KEY]: "light" }));
		expect(readTheme()).toBe("light");
	});

	it("giá trị lạ → dark", () => {
		installStorage(memoryStorage({ [THEME_STORAGE_KEY]: "banana" }));
		expect(readTheme()).toBe("dark");
	});

	it("storage hỏng (throw) → dark", () => {
		installStorage({
			...memoryStorage(),
			getItem: () => {
				throw new Error("unavailable");
			},
		});
		expect(readTheme()).toBe("dark");
	});
});

describe("applyTheme", () => {
	it("light: thêm class light, gỡ dark trên <html>", () => {
		document.documentElement.className = "";
		applyTheme("light");
		expect(document.documentElement.classList.contains("light")).toBe(true);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("dark: thêm class dark, gỡ light", () => {
		document.documentElement.className = "";
		applyTheme("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.classList.contains("light")).toBe(false);
	});
});

describe("useTheme", () => {
	beforeEach(() => {
		installStorage(memoryStorage());
		document.documentElement.className = "";
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("mặc định dark và áp class dark lên <html>", () => {
		const { result } = renderHook(() => useTheme());
		expect(result.current.theme).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("toggle → light, ghi storage và class light; không ghi storage khi mount", () => {
		const storage = memoryStorage();
		installStorage(storage);
		const setItem = vi.spyOn(storage, "setItem");
		const { result } = renderHook(() => useTheme());
		// Mount chưa tương tác → không ghi lựa chọn vào storage.
		expect(setItem).not.toHaveBeenCalled();

		act(() => result.current.toggle());
		expect(result.current.theme).toBe("light");
		expect(storage.getItem(THEME_STORAGE_KEY)).toBe("light");
		expect(document.documentElement.classList.contains("light")).toBe(true);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("setTheme('dark') sau light quay lại dark và ghi storage", () => {
		installStorage(memoryStorage({ [THEME_STORAGE_KEY]: "light" }));
		const { result } = renderHook(() => useTheme());
		expect(result.current.theme).toBe("light");

		act(() => result.current.setTheme("dark"));
		expect(result.current.theme).toBe("dark");
		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("storage đồng bộ giữa các tab qua sự kiện storage", () => {
		const { result } = renderHook(() => useTheme());
		expect(result.current.theme).toBe("dark");

		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: THEME_STORAGE_KEY,
					newValue: "light",
				}),
			);
		});
		expect(result.current.theme).toBe("light");
	});

	it("ghi storage hỏng (throw) không làm vỡ setTheme", () => {
		installStorage({
			...memoryStorage(),
			setItem: () => {
				throw new Error("quota");
			},
		});
		const { result } = renderHook(() => useTheme());

		expect(() => act(() => result.current.setTheme("light"))).not.toThrow();
		expect(result.current.theme).toBe("light");
		expect(document.documentElement.classList.contains("light")).toBe(true);
	});
});
