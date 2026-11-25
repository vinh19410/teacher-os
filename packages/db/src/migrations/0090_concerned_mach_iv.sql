WITH scored AS (
	SELECT
		`id`,
		`org_id`,
		`student_id`,
		`test_id`,
		`started_at`,
		`rowid` AS `row_ord`,
		CASE WHEN `media_key` IS NOT NULL AND TRIM(`media_key`) <> '' THEN 1 ELSE 0 END AS `has_media`,
		(
			SELECT COUNT(*)
			FROM json_each(
				CASE
					WHEN json_valid(`answers`) = 1
						AND (
							CASE
								WHEN json_valid(`answers`) = 1
								THEN json_type(`answers`)
							END
						) = 'object'
					THEN `answers`
					ELSE '{}'
				END
			) je
			WHERE je.`value` IS NOT NULL
				AND TRIM(CAST(je.`value` AS TEXT)) <> ''
		) AS `answer_count`,
		LENGTH(TRIM(`essay`)) AS `essay_len`
	FROM `quiz_attempt`
	WHERE `mode` = 'practice'
		AND `status` = 'in_progress'
		AND `test_id` IS NOT NULL
),
ranked AS (
	SELECT
		`id`,
		MIN(`started_at`) OVER (PARTITION BY `org_id`, `student_id`, `test_id`) AS `min_started_at`,
		ROW_NUMBER() OVER (
			PARTITION BY `org_id`, `student_id`, `test_id`
			ORDER BY `has_media` DESC, `answer_count` DESC, `essay_len` DESC, `row_ord` DESC
		) AS `rn`
	FROM scored
)
UPDATE `quiz_attempt`
SET `started_at` = (
	SELECT r.`min_started_at`
	FROM ranked r
	WHERE r.`id` = `quiz_attempt`.`id`
)
WHERE EXISTS (
	SELECT 1
	FROM ranked r
	WHERE r.`id` = `quiz_attempt`.`id`
		AND r.`rn` = 1
		AND `quiz_attempt`.`started_at` <> r.`min_started_at`
);
--> statement-breakpoint
WITH scored AS (
	SELECT
		`id`,
		`org_id`,
		`student_id`,
		`test_id`,
		`rowid` AS `row_ord`,
		CASE WHEN `media_key` IS NOT NULL AND TRIM(`media_key`) <> '' THEN 1 ELSE 0 END AS `has_media`,
		(
			SELECT COUNT(*)
			FROM json_each(
				CASE
					WHEN json_valid(`answers`) = 1
						AND (
							CASE
								WHEN json_valid(`answers`) = 1
								THEN json_type(`answers`)
							END
						) = 'object'
					THEN `answers`
					ELSE '{}'
				END
			) je
			WHERE je.`value` IS NOT NULL
				AND TRIM(CAST(je.`value` AS TEXT)) <> ''
		) AS `answer_count`,
		LENGTH(TRIM(`essay`)) AS `essay_len`
	FROM `quiz_attempt`
	WHERE `mode` = 'practice'
		AND `status` = 'in_progress'
		AND `test_id` IS NOT NULL
),
ranked AS (
	SELECT
		`id`,
		ROW_NUMBER() OVER (
			PARTITION BY `org_id`, `student_id`, `test_id`
			ORDER BY `has_media` DESC, `answer_count` DESC, `essay_len` DESC, `row_ord` DESC
		) AS `rn`
	FROM scored
)
DELETE FROM `quiz_attempt`
WHERE `id` IN (
	SELECT `id` FROM ranked WHERE `rn` > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `quiz_attempt_practice_in_progress_uq` ON `quiz_attempt` (`org_id`,`student_id`,`test_id`) WHERE "quiz_attempt"."mode" = 'practice' and "quiz_attempt"."status" = 'in_progress' and "quiz_attempt"."test_id" is not null;
