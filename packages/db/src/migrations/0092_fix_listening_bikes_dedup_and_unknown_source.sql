-- Demote pre-existing legacy Listening "Talking about the history of bikes"
-- duplicates (and their synced assignment_test copies) to draft when the
-- canonical imported test is ready with its s4 part and audio_key, and
-- normalize "Unknown" source metadata to "Other sources" across library and
-- untouched org-cloned rows (idempotent, INF-03 safe, D1 flat-runner safe).
UPDATE `library_test`
SET
	`status` = 'draft',
	`description` = CASE
		WHEN INSTR(COALESCE(`description`, ''), '[Duplicate of lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3]') > 0
		THEN `description`
		WHEN TRIM(COALESCE(`description`, '')) = ''
		THEN '[Duplicate of lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3]'
		ELSE SUBSTR('[Duplicate of lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3] ' || TRIM(`description`), 1, 2000)
	END,
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE `skill` = 'listening'
	AND `status` = 'ready'
	AND `id` <> 'lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3'
	AND SUBSTR(`id`, 1, 11) <> 'lib-listen-'
	AND COALESCE(TRIM(`collection`), '') = ''
	AND LOWER(TRIM(COALESCE(`test_group`, ''))) IN ('', 'section 4', 's4')
	AND LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(`title`, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) = 'talking about the history of bikes'
	AND NOT EXISTS (
		SELECT 1
		FROM `library_test_part` p
		WHERE p.`test_id` = `library_test`.`id`
			AND p.`part` <> 's4'
	)
	AND EXISTS (
		SELECT 1
		FROM `library_test` canonical
		INNER JOIN `library_test_part` cp ON cp.`test_id` = canonical.`id`
		WHERE canonical.`id` = 'lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3'
			AND canonical.`skill` = 'listening'
			AND canonical.`status` = 'ready'
			AND cp.`id` = 'lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4'
			AND cp.`part` = 's4'
			AND cp.`audio_key` IS NOT NULL
			AND TRIM(cp.`audio_key`) <> ''
	);
--> statement-breakpoint
UPDATE `assignment_test`
SET
	`status` = 'draft',
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE `skill` = 'listening'
	AND `status` = 'ready'
	AND `library_ref` IS NOT NULL
	AND TRIM(`library_ref`) <> ''
	AND `library_ref` <> 'lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3'
	AND SUBSTR(`library_ref`, 1, 11) <> 'lib-listen-'
	AND EXISTS (
		SELECT 1
		FROM `library_test` canonical
		INNER JOIN `library_test_part` cp ON cp.`test_id` = canonical.`id`
		WHERE canonical.`id` = 'lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3'
			AND canonical.`skill` = 'listening'
			AND canonical.`status` = 'ready'
			AND cp.`id` = 'lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4'
			AND cp.`part` = 's4'
			AND cp.`audio_key` IS NOT NULL
			AND TRIM(cp.`audio_key`) <> ''
	)
	AND (
		EXISTS (
			SELECT 1
			FROM `library_test` legacy
			WHERE legacy.`id` = `assignment_test`.`library_ref`
				AND legacy.`skill` = 'listening'
				AND legacy.`status` <> 'ready'
				AND SUBSTR(legacy.`id`, 1, 11) <> 'lib-listen-'
				AND COALESCE(TRIM(legacy.`collection`), '') = ''
				AND LOWER(TRIM(COALESCE(legacy.`test_group`, ''))) IN ('', 'section 4', 's4')
				AND LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(legacy.`title`, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) = 'talking about the history of bikes'
				AND NOT EXISTS (
					SELECT 1
					FROM `library_test_part` p
					WHERE p.`test_id` = legacy.`id`
						AND p.`part` <> 's4'
				)
		)
		OR (
			COALESCE(TRIM(`collection`), '') = ''
			AND LOWER(TRIM(COALESCE(`test_group`, ''))) IN ('', 'section 4', 's4')
			AND LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(`title`, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) = 'talking about the history of bikes'
			AND NOT EXISTS (
				SELECT 1
				FROM `assignment_test_part` p
				WHERE p.`test_id` = `assignment_test`.`id`
					AND p.`part` <> 's4'
			)
			AND NOT EXISTS (
				SELECT 1
				FROM `library_test` lt
				WHERE lt.`id` = `assignment_test`.`library_ref`
			)
		)
	);
--> statement-breakpoint
UPDATE `library_test`
SET
	`collection` = 'Other sources',
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE SUBSTR(`id`, 1, 11) = 'lib-listen-'
	AND `skill` = 'listening'
	AND LOWER(TRIM(COALESCE(`collection`, ''))) = 'unknown';
--> statement-breakpoint
UPDATE `library_test_part`
SET
	`source` = CASE
		WHEN LOWER(TRIM(`source`)) = 'unknown' THEN 'Other sources'
		ELSE 'Other sources — Section ' || SUBSTR(`part`, 2)
	END,
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE SUBSTR(`id`, 1, 16) = 'lib-listen-part-'
	AND SUBSTR(`test_id`, 1, 11) = 'lib-listen-'
	AND EXISTS (
		SELECT 1
		FROM `library_test` lt
		WHERE lt.`id` = `library_test_part`.`test_id`
			AND lt.`skill` = 'listening'
			AND lt.`collection` = 'Other sources'
	)
	AND (
		LOWER(TRIM(`source`)) = 'unknown'
		OR (
			`part` IN ('s1', 's2', 's3', 's4')
			AND LOWER(TRIM(`source`)) = 'unknown — section ' || SUBSTR(`part`, 2)
		)
	);
--> statement-breakpoint
UPDATE `assignment_test`
SET
	`collection` = 'Other sources',
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE `library_ref` IS NOT NULL
	AND SUBSTR(`library_ref`, 1, 11) = 'lib-listen-'
	AND `skill` = 'listening'
	AND LOWER(TRIM(COALESCE(`collection`, ''))) = 'unknown'
	AND EXISTS (
		SELECT 1
		FROM `library_test` lt
		WHERE lt.`id` = `assignment_test`.`library_ref`
			AND lt.`skill` = 'listening'
			AND lt.`collection` = 'Other sources'
	);
--> statement-breakpoint
UPDATE `assignment_prompt`
SET
	`source` = CASE
		WHEN LOWER(TRIM(`source`)) = 'unknown' THEN 'Other sources'
		ELSE 'Other sources — Section ' || SUBSTR(`part`, 2)
	END
WHERE `library_ref` IS NOT NULL
	AND SUBSTR(`library_ref`, 1, 18) = 'library_test_part:'
	AND SUBSTR(`library_ref`, 19, 16) = 'lib-listen-part-'
	AND `skill` = 'listening'
	AND (
		LOWER(TRIM(`source`)) = 'unknown'
		OR (
			`part` IN ('s1', 's2', 's3', 's4')
			AND LOWER(TRIM(`source`)) = 'unknown — section ' || SUBSTR(`part`, 2)
		)
	)
	AND EXISTS (
		SELECT 1
		FROM `library_test_part` ltp
		INNER JOIN `library_test` lt ON lt.`id` = ltp.`test_id`
		WHERE ltp.`id` = SUBSTR(`assignment_prompt`.`library_ref`, 19)
			AND lt.`skill` = 'listening'
			AND lt.`collection` = 'Other sources'
			AND ltp.`part` = `assignment_prompt`.`part`
			AND ltp.`source` = CASE
				WHEN LOWER(TRIM(`assignment_prompt`.`source`)) = 'unknown' THEN 'Other sources'
				ELSE 'Other sources — Section ' || SUBSTR(`assignment_prompt`.`part`, 2)
			END
	);
