import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

/**
 * Person only — invariant 3: no package columns on student.
 * Entitlements live on session_package keyed by student (enrollment is the optional class attachment — issue #104).
 */
export const student = sqliteTable(
	"student",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		phone: text("phone").notNull().default(""),
		/** Email học viên — danh tính đăng nhập portal (PR #255 + issue #257).
		 * Ghi bởi: bridge portal provisioning (requireStudent) khi emailVerified === true.
		 * Unique expression index: lower(trim(email)) WHERE trim(email) != ''. */
		email: text("email").notNull().default(""),
		zalo: text("zalo").notNull().default(""),
		parentName: text("parent_name").notNull().default(""),
		parentPhone: text("parent_phone").notNull().default(""),
		/** Chứng chỉ học viên quan tâm ("ielts" | "toeic") — enum EXAM_INTERESTS ở packages/api.
		 * Ghi bởi: học viên hoàn thành wizard onboarding — POST /api/student/onboarding (bước 1). */
		examInterest: text("exam_interest"),
		/** Band/điểm mục tiêu (chuỗi hiển thị, vd "6.5" IELTS hoặc "750" TOEIC).
		 * Ghi bởi: POST /api/student/onboarding (bước 2, ràng buộc theo examInterest). */
		targetScore: text("target_score"),
		/** Mục tiêu học tiếng Anh — JSON array string của keys LEARNING_GOAL_OPTIONS.
		 * Ghi bởi: POST /api/student/onboarding (bước 3, multi-select). */
		learningGoals: text("learning_goals"),
		/** Ghi chú tự nhiên cho bước mục tiêu (≤200 ký tự, có thể null khi bỏ trống).
		 * Ghi bởi: POST /api/student/onboarding (bước 3, tùy chọn). */
		learningGoalsNote: text("learning_goals_note"),
		/** Thời gian tự học mỗi ngày (key DAILY_STUDY_HOUR_OPTIONS).
		 * Ghi bởi: POST /api/student/onboarding (bước 4). */
		dailyStudyHours: text("daily_study_hours"),
		/** Thời điểm học viên hoàn thành wizard onboarding — null = chưa onboarding (gate UI đọc cột này).
		 * Ghi bởi: POST /api/student/onboarding khi payload hợp lệ. */
		onboardingCompletedAt: integer("onboarding_completed_at", {
			mode: "timestamp_ms",
		}),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("student_org_idx").on(table.orgId),
		uniqueIndex("student_org_email_uq")
			.on(table.orgId, sql`lower(trim(${table.email}))`)
			.where(sql`trim(${table.email}) != ''`),
	],
);
