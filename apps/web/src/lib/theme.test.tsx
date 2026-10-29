// @vitest-environment jsdom

import { ThemeToggle } from "@teacher-os/ui/components/theme-toggle";
import { useTheme } from "@teacher-os/ui/hooks/use-theme";
import {
	applyTheme,
	readTheme,
	THEME_STORAGE_KEY,
} from "@teacher-os/ui/lib/theme";
import {
	act,
	cleanup,
	fireEvent,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
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

function installStorage(impl: Storage) {
	Object.defineProperty(window, "localStorage", {
		value: impl,
		configurable: true,
	});
}

describe("readTheme", () => {
	it("mặc định light khi không có lựa chọn trong storage", () => {
		installStorage(memoryStorage());
		expect(readTheme()).toBe("light");
	});

	it("trả dark khi storage ghi dark", () => {
		installStorage(memoryStorage({ [THEME_STORAGE_KEY]: "dark" }));
		expect(readTheme()).toBe("dark");
	});

	it("giá trị lạ → light", () => {
		installStorage(memoryStorage({ [THEME_STORAGE_KEY]: "banana" }));
		expect(readTheme()).toBe("light");
	});

	it("storage hỏng (throw) → light", () => {
		installStorage({
			...memoryStorage(),
			getItem: () => {
				throw new Error("unavailable");
			},
		});
		expect(readTheme()).toBe("light");
	});
});

describe("applyTheme", () => {
	it("light: <html> không còn class nào (light là mặc định)", () => {
		document.documentElement.className = "dark";
		applyTheme("light");
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("dark: thêm class dark trên <html>", () => {
		document.documentElement.className = "";
		applyTheme("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
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

	it("mặc định light, <html> không có class dark", () => {
		const { result } = renderHook(() => useTheme());
		expect(result.current.theme).toBe("light");
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("toggle → dark, ghi storage và class dark; không ghi storage khi mount", () => {
		const storage = memoryStorage();
		installStorage(storage);
		const setItem = vi.spyOn(storage, "setItem");
		const { result } = renderHook(() => useTheme());
		// Mount chưa tương tác → không ghi lựa chọn vào storage.
		expect(setItem).not.toHaveBeenCalled();

		act(() => result.current.toggle());
		expect(result.current.theme).toBe("dark");
		expect(storage.getItem(THEME_STORAGE_KEY)).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("setTheme('light') sau dark quay lại light và ghi storage", () => {
		// Mô phỏng theme-init: class dark đã trên <html> trước khi React mount.
		installStorage(memoryStorage({ [THEME_STORAGE_KEY]: "dark" }));
		document.documentElement.classList.add("dark");
		const { result } = renderHook(() => useTheme());
		expect(result.current.theme).toBe("dark");

		act(() => result.current.setTheme("light"));
		expect(result.current.theme).toBe("light");
		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("storage đồng bộ giữa các tab qua sự kiện storage", () => {
		const { result } = renderHook(() => useTheme());
		expect(result.current.theme).toBe("light");

		// Tab khác ghi storage — handler áp lại theme từ storage rồi mới emit.
		installStorage(memoryStorage({ [THEME_STORAGE_KEY]: "dark" }));
		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: THEME_STORAGE_KEY,
					newValue: "dark",
				}),
			);
		});
		expect(result.current.theme).toBe("dark");
	});

	it("ghi storage hỏng (throw) không làm vỡ setTheme", () => {
		installStorage({
			...memoryStorage(),
			setItem: () => {
				throw new Error("quota");
			},
		});
		const { result } = renderHook(() => useTheme());

		expect(() => act(() => result.current.setTheme("dark"))).not.toThrow();
		expect(result.current.theme).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("hai instance useTheme cùng tab dùng chung một snapshot (toggle ở chỗ này, chỗ kia theo)", () => {
		// Regression #349 review: Toaster và ThemeToggle mount 2 hook riêng —
		// phải đọc cùng một nguồn (class trên <html>), không state rời.
		const a = renderHook(() => useTheme());
		const b = renderHook(() => useTheme());
		expect(a.result.current.theme).toBe("light");
		expect(b.result.current.theme).toBe("light");

		act(() => a.result.current.toggle());
		expect(a.result.current.theme).toBe("dark");
		expect(b.result.current.theme).toBe("dark");

		act(() => b.result.current.setTheme("light"));
		expect(a.result.current.theme).toBe("light");
	});
});

describe("ThemeToggle", () => {
	// Vitest không bật globals → RTL auto-cleanup không đăng ký; state theme
	// đọc từ class trên <html> nên phải reset cùng storage trước mỗi test.
	beforeEach(() => {
		installStorage(memoryStorage());
		document.documentElement.className = "";
	});

	afterEach(cleanup);

	it("render switch 'Giao diện tối' unchecked mặc định (light), không còn chữ Tối/Sáng", () => {
		render(<ThemeToggle />);
		const sw = screen.getByRole("switch", { name: "Giao diện tối" });
		expect(sw.getAttribute("aria-checked")).toBe("false");
		expect(screen.queryByText("Tối")).toBeNull();
		expect(screen.queryByText("Sáng")).toBeNull();
	});

	it("click → checked, class dark trên <html>, ghi storage dark", () => {
		const storage = memoryStorage();
		installStorage(storage);
		render(<ThemeToggle />);
		const sw = screen.getByRole("switch", { name: "Giao diện tối" });

		fireEvent.click(sw);
		expect(sw.getAttribute("aria-checked")).toBe("true");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(storage.getItem(THEME_STORAGE_KEY)).toBe("dark");
	});

	it("click lần nữa → unchecked lại, không còn class dark", () => {
		render(<ThemeToggle />);
		const sw = screen.getByRole("switch", { name: "Giao diện tối" });

		fireEvent.click(sw);
		fireEvent.click(sw);
		expect(sw.getAttribute("aria-checked")).toBe("false");
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});
});
