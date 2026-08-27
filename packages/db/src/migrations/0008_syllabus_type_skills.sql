ALTER TABLE "syllabus" ADD "type" text NOT NULL DEFAULT 'ielts';
--> statement-breakpoint
ALTER TABLE "syllabus" RENAME COLUMN "skill" TO "skills";
--> statement-breakpoint
UPDATE "syllabus" SET "skills" = json_array("skills") WHERE "skills" <> '';
--> statement-breakpoint
UPDATE "syllabus" SET "skills" = '[]' WHERE "skills" = '';
