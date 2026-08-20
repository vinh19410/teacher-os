ALTER TABLE "class" ADD "type" text NOT NULL DEFAULT 'ielts';
--> statement-breakpoint
ALTER TABLE "class" RENAME COLUMN "skill" TO "skills";
--> statement-breakpoint
UPDATE "class" SET "type" = 'communication' WHERE "skills" = 'Giao tiếp';
--> statement-breakpoint
UPDATE "class" SET "skills" = json_array("skills") WHERE "type" = 'ielts' AND "skills" <> '';
--> statement-breakpoint
UPDATE "class" SET "skills" = '[]' WHERE "skills" = '' OR "type" = 'communication';
