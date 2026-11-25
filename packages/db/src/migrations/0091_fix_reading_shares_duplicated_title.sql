-- Fix duplicated Reading title for "Investment in shares versus investment in other assets - which gives the greater gain?"
-- across library_test, assignment_test, library_test_part, and assignment_prompt
-- (idempotent, INF-03/provenance safe, orphan-copy safe, NOT NULL safe, no LIKE).
UPDATE `library_test`
SET
	`title` = 'Investment in shares versus investment in other assets - which gives the greater gain?',
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE `skill` = 'reading'
	AND TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?';
--> statement-breakpoint
UPDATE `assignment_test`
SET
	`title` = 'Investment in shares versus investment in other assets - which gives the greater gain?',
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE `library_ref` IS NOT NULL
	AND TRIM(`library_ref`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) <> ''
	AND `skill` = 'reading'
	AND TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
	AND (
		EXISTS (
			SELECT 1
			FROM `library_test` lt
			WHERE lt.`id` = `assignment_test`.`library_ref`
				AND lt.`skill` = 'reading'
				AND TRIM(lt.`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
					'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
					'Investment in shares versus investment in other assets - which gives the greater gain?'
				)
		)
		OR NOT EXISTS (
			SELECT 1
			FROM `library_test` lt
			WHERE lt.`id` = `assignment_test`.`library_ref`
		)
	);
--> statement-breakpoint
UPDATE `library_test_part`
SET
	`title` = CASE
		WHEN TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		THEN 'Investment in shares versus investment in other assets - which gives the greater gain?'
		WHEN `part` IN ('p1', 'p2', 'p3')
			AND LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) > 5
			AND SUBSTR(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)), -5) = ' — ' || UPPER(`part`)
			AND TRIM(
				SUBSTR(
					TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)),
					1,
					LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) - 5
				),
				' ' || CHAR(9) || CHAR(10) || CHAR(13)
			) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		THEN 'Investment in shares versus investment in other assets - which gives the greater gain? — ' || UPPER(`part`)
		WHEN TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
			'Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		)
		THEN REPLACE(
			TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)),
			'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Investment in shares versus investment in other assets - which gives the greater gain?'
		)
		ELSE `title`
	END,
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE (
		TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
			'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		)
		OR (
			`part` IN ('p1', 'p2', 'p3')
			AND LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) > 5
			AND SUBSTR(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)), -5) = ' — ' || UPPER(`part`)
			AND TRIM(
				SUBSTR(
					TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)),
					1,
					LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) - 5
				),
				' ' || CHAR(9) || CHAR(10) || CHAR(13)
			) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		)
	)
	AND EXISTS (
		SELECT 1
		FROM `library_test` lt
		WHERE lt.`id` = `library_test_part`.`test_id`
			AND lt.`skill` = 'reading'
			AND TRIM(lt.`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
				'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
				'Investment in shares versus investment in other assets - which gives the greater gain?'
			)
	);
--> statement-breakpoint
UPDATE `assignment_prompt`
SET
	`title` = CASE
		WHEN TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		THEN 'Investment in shares versus investment in other assets - which gives the greater gain?'
		WHEN `part` IN ('p1', 'p2', 'p3')
			AND LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) > 5
			AND SUBSTR(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)), -5) = ' — ' || UPPER(`part`)
			AND TRIM(
				SUBSTR(
					TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)),
					1,
					LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) - 5
				),
				' ' || CHAR(9) || CHAR(10) || CHAR(13)
			) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		THEN 'Investment in shares versus investment in other assets - which gives the greater gain? — ' || UPPER(`part`)
		WHEN TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
			'Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		)
		THEN REPLACE(
			TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)),
			'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Investment in shares versus investment in other assets - which gives the greater gain?'
		)
		ELSE `title`
	END
WHERE SUBSTR(`library_ref`, 1, 18) = 'library_test_part:'
	AND TRIM(SUBSTR(`library_ref`, 19), ' ' || CHAR(9) || CHAR(10) || CHAR(13)) <> ''
	AND `skill` = 'reading'
	AND (
		TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
			'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 1: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 2: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
			'Reading Passage 3: Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		)
		OR (
			`part` IN ('p1', 'p2', 'p3')
			AND LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) > 5
			AND SUBSTR(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)), -5) = ' — ' || UPPER(`part`)
			AND TRIM(
				SUBSTR(
					TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)),
					1,
					LENGTH(TRIM(`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13))) - 5
				),
				' ' || CHAR(9) || CHAR(10) || CHAR(13)
			) = 'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?'
		)
	)
	AND (
		EXISTS (
			SELECT 1
			FROM `library_test_part` ltp
			INNER JOIN `library_test` lt ON lt.`id` = ltp.`test_id`
			WHERE ltp.`id` = SUBSTR(`assignment_prompt`.`library_ref`, 19)
				AND lt.`skill` = 'reading'
				AND TRIM(lt.`title`, ' ' || CHAR(9) || CHAR(10) || CHAR(13)) IN (
					'Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?',
					'Investment in shares versus investment in other assets - which gives the greater gain?'
				)
				AND `assignment_prompt`.`part` = ltp.`part`
				AND `assignment_prompt`.`passage` = ltp.`passage`
		)
		OR NOT EXISTS (
			SELECT 1
			FROM `library_test_part` ltp
			WHERE ltp.`id` = SUBSTR(`assignment_prompt`.`library_ref`, 19)
		)
	);
