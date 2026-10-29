import type { LucideIcon } from "lucide-react";
import { teacherNavForViewer } from "@/components/layout/sidebar";
import {
	INVOICE_STATUS_LABEL,
	invoiceCode,
	invoiceType,
} from "@/lib/format-invoice";
import type {
	Assignment,
	ClassGroup,
	Invoice,
	MockData,
	Student,
} from "@/lib/mock-data";
import { fmtVND } from "@/lib/mock-data";

/**
 * Chỉ mục tìm kiếm cho command palette ⌘K (phase 8) — thay search của topbar
 * v1 (lib/global-search, đã xóa cùng commit). Pure by design: caller (palette)
 * truyền snapshot kernel đã có sẵn ở client qua useData(), KHÔNG gọi API mới.
 *
 * So khớp bỏ dấu và không phân biệt hoa/thường trên CẢ HAI phía (query và dữ
 * liệu) — "lop 7" khớp "Lớp 7", "huy" khớp "Lê Quang Huy". Mỗi nhóm tối đa
 * MAX_PER_GROUP kết quả để một đuôi học viên dài không lấn nhóm khác.
 */

export type SearchResultKind =
	| "class"
	| "student"
	| "assignment"
	| "invoice"
	| "nav";

export interface SearchItem {
	kind: SearchResultKind;
	/** Id thực thể — mục nav dùng key nav (vd. "dashboard"). */
	id: string;
	label: string;
	/** Dòng phụ: SĐT, phụ huynh, nhóm nav, trạng thái… */
	hint: string;
	/** Route literal — chỉ mục nav dùng; thực thể điều hướng qua nhánh router
	 * tương ứng kind trong palette (params đúng kiểu cho TanStack). */
	href: string;
	/** Icon riêng cho mục nav (từ TEACHER_NAV); thực thể dùng bản đồ kind. */
	icon?: LucideIcon;
	/** Chuỗi so khớp đã normalizeVi — dựng 1 lần lúc build index. */
	needles: string[];
}

export interface SearchGroup {
	kind: SearchResultKind;
	label: string;
	items: SearchItem[];
}

export interface SearchIndex {
	/** false = store chưa có snapshot kernel → palette hiển thị "Đang tải…". */
	loaded: boolean;
	/** Toàn bộ nhóm theo thứ tự hiển thị; lọc theo query bằng queryIndex. */
	groups: SearchGroup[];
}

/** Nhãn nhóm kết quả hiển thị trong palette. */
export const KIND_LABELS: Record<SearchResultKind, string> = {
	class: "Lớp học",
	student: "Học viên",
	assignment: "Bài tập",
	invoice: "Hóa đơn",
	nav: "Điều hướng",
};

const KIND_ORDER: Record<SearchResultKind, number> = {
	class: 0,
	student: 1,
	assignment: 2,
	invoice: 3,
	nav: 4,
};

/** Tối đa 5 kết quả mỗi nhóm (phase 8). */
const MAX_PER_GROUP = 5;

/** Bỏ dấu tiếng Việt + lowercase để so khớp 2 chiều (nguồn duy nhất — topbar
 * v1 từng giữ bản riêng trong global-search đã xóa). */
export function normalizeVi(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/đ/g, "d")
		.replace(/Đ/g, "D")
		.toLowerCase();
}

const needle = (parts: Array<string | undefined | null>): string[] =>
	parts.filter((p): p is string => Boolean(p?.trim())).map(normalizeVi);

const STORE_COLLECTIONS = [
	"classes",
	"students",
	"assignments",
	"invoices",
] as const;

/**
 * Store chưa tải = chưa có snapshot kernel (provider gate chưa nhả). Kiểm tra
 * dạng mảng — org rỗng (đăng ký mới) vẫn là `loaded` thật sự, palette phải
 * báo "Không tìm thấy" chứ không treo "Đang tải…" vĩnh viễn.
 */
export function isSnapshotLoaded(data: unknown): data is MockData {
	return (
		typeof data === "object" &&
		data !== null &&
		STORE_COLLECTIONS.every((key) => Array.isArray((data as MockData)[key]))
	);
}

function classItems(data: MockData): SearchItem[] {
	return data.classes.map((c: ClassGroup) => ({
		kind: "class",
		id: c.id,
		label: c.name,
		hint: [c.level, c.mode].filter(Boolean).join(" · "),
		href: "",
		needles: needle([c.name, c.level, c.mode]),
	}));
}

function studentItems(data: MockData): SearchItem[] {
	return data.students.map((s: Student) => ({
		kind: "student",
		id: s.id,
		label: s.name,
		hint: [s.phone, s.parent.name].filter(Boolean).join(" · "),
		href: "",
		needles: needle([s.name, s.phone, s.zalo, s.parent.name]),
	}));
}

function assignmentItems(data: MockData): SearchItem[] {
	// Bảng tra tên học viên theo id — Record dựng 1 lần mỗi lần build
	// (rule ts-set-map: khóa string, chỉ đọc, không xóa phần tử runtime).
	const namesById: Record<string, string> = Object.fromEntries(
		data.students.map((s) => [s.id, s.name] as const),
	);
	return data.assignments.map((a: Assignment) => {
		const studentName = a.sid ? namesById[a.sid] : undefined;
		return {
			kind: "assignment",
			id: a.id,
			label: a.title,
			hint: studentName ?? a.type,
			href: "",
			needles: needle([a.title, a.type, studentName]),
		};
	});
}

function invoiceItems(data: MockData): SearchItem[] {
	const namesById: Record<string, string> = Object.fromEntries(
		data.students.map((s) => [s.id, s.name] as const),
	);
	return data.invoices.map((i: Invoice) => {
		const studentName = i.sid ? namesById[i.sid] : undefined;
		const label = studentName ?? invoiceCode(i.id);
		const statusLabel = INVOICE_STATUS_LABEL[i.status];
		return {
			kind: "invoice",
			id: i.id,
			label,
			hint: [invoiceType(i.type), fmtVND(i.amount), statusLabel]
				.filter(Boolean)
				.join(" · "),
			href: "",
			needles: needle([label, i.type, statusLabel, invoiceCode(i.id)]),
		};
	});
}

function navItems(canAccessFinance: boolean): SearchItem[] {
	return teacherNavForViewer(canAccessFinance).flatMap((group) =>
		group.items
			.filter((item) => item.enabled !== false)
			.map((item) => ({
				kind: "nav",
				id: item.key,
				label: item.label,
				hint: group.group,
				href: item.href,
				icon: item.icon,
				needles: needle([item.label, group.group]),
			})),
	);
}

/**
 * Dựng chỉ mục từ snapshot store. `null` = store chưa tải (palette hiển thị
 * "Đang tải…") — gọi lại mỗi khi snapshot đổi; org rỗng vẫn loaded với đúng
 * một nhóm Điều hướng.
 */
export function buildSearchIndex(data: MockData | null): SearchIndex {
	if (!data) {
		return { loaded: false, groups: [] };
	}
	const collected: SearchItem[] = [
		...classItems(data),
		...studentItems(data),
		...assignmentItems(data),
		...invoiceItems(data),
		...navItems(data.viewer?.canAccessFinance ?? true),
	];
	const groups = (Object.keys(KIND_ORDER) as SearchResultKind[])
		.sort((a, b) => KIND_ORDER[a] - KIND_ORDER[b])
		.map((kind) => ({
			kind,
			label: KIND_LABELS[kind],
			items: collected.filter((item) => item.kind === kind),
		}))
		.filter((group) => group.items.length > 0);
	return { loaded: true, groups };
}

/** Lọc chỉ mục theo query (bỏ dấu 2 chiều): tách query thành token, mỗi token
 * phải khớp ÍT NHẤT MỘT needle của item (vd. "lop 7" → "Lớp 7…", "essay tech"
 * → đề "Essay: Technology"). Mỗi nhóm lấy tối đa 5 kết quả, bỏ nhóm rỗng.
 * Query rỗng → [] (palette tự hiển thị nhóm Điều hướng). */
export function queryIndex(index: SearchIndex, query: string): SearchGroup[] {
	const tokens = normalizeVi(query.trim()).split(/\s+/).filter(Boolean);
	if (tokens.length === 0 || !index.loaded) return [];
	return index.groups
		.map((group) => ({
			...group,
			items: group.items
				.filter((item) =>
					tokens.every((token) => item.needles.some((n) => n.includes(token))),
				)
				.slice(0, MAX_PER_GROUP),
		}))
		.filter((group) => group.items.length > 0);
}
