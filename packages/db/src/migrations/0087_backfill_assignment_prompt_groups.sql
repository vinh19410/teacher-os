-- Backfill assignment_prompt.groups from library_test_part.groups for
-- pre-0085 library-cloned prompts (idempotent, INF-03 safe, SQLite/D1 JSON1 & PK-index safe).
UPDATE `assignment_prompt`
SET `groups` = COALESCE(
	(
		SELECT ltp.`groups`
		FROM `library_test_part` ltp
		WHERE SUBSTR(`assignment_prompt`.`library_ref`, 1, 18) = 'library_test_part:'
			AND ltp.`id` = SUBSTR(`assignment_prompt`.`library_ref`, 19)
	),
	`assignment_prompt`.`groups`
)
WHERE (
	TRIM(`assignment_prompt`.`groups`) = ''
	OR (
		CASE
			WHEN json_valid(`assignment_prompt`.`groups`) = 1
				AND (
					CASE
						WHEN json_valid(`assignment_prompt`.`groups`) = 1
						THEN json_type(`assignment_prompt`.`groups`)
					END
				) = 'array'
			THEN json_array_length(`assignment_prompt`.`groups`)
			ELSE -1
		END
	) = 0
)
	AND SUBSTR(`assignment_prompt`.`library_ref`, 1, 18) = 'library_test_part:'
	AND EXISTS (
		SELECT 1
		FROM `library_test_part` ltp
		INNER JOIN `library_test` lt ON lt.`id` = ltp.`test_id`
		WHERE ltp.`id` = SUBSTR(`assignment_prompt`.`library_ref`, 19)
			AND lt.`status` = 'ready'
			AND `assignment_prompt`.`skill` = lt.`skill`
			AND `assignment_prompt`.`part` = ltp.`part`
			AND `assignment_prompt`.`passage` = ltp.`passage`
			AND (
				CASE
					WHEN json_valid(ltp.`groups`) = 1
						AND (
							CASE
								WHEN json_valid(ltp.`groups`) = 1
								THEN json_type(ltp.`groups`)
							END
						) = 'array'
					THEN json_array_length(ltp.`groups`)
					ELSE 0
				END
			) BETWEEN 1 AND 20
			AND (
				CASE
					WHEN json_valid(`assignment_prompt`.`questions`) = 1
						AND (
							CASE
								WHEN json_valid(`assignment_prompt`.`questions`) = 1
								THEN json_type(`assignment_prompt`.`questions`)
							END
						) = 'array'
					THEN json_array_length(`assignment_prompt`.`questions`)
					ELSE -1
				END
			) > 0
			AND (
				CASE
					WHEN json_valid(ltp.`questions`) = 1
						AND (
							CASE
								WHEN json_valid(ltp.`questions`) = 1
								THEN json_type(ltp.`questions`)
							END
						) = 'array'
					THEN json_array_length(ltp.`questions`)
					ELSE -2
				END
			) = (
				CASE
					WHEN json_valid(`assignment_prompt`.`questions`) = 1
						AND (
							CASE
								WHEN json_valid(`assignment_prompt`.`questions`) = 1
								THEN json_type(`assignment_prompt`.`questions`)
							END
						) = 'array'
					THEN json_array_length(`assignment_prompt`.`questions`)
					ELSE -1
				END
			)
			AND NOT EXISTS (
				SELECT 1
				FROM json_each(
					CASE
						WHEN json_valid(ltp.`groups`) = 1
							AND (
								CASE
									WHEN json_valid(ltp.`groups`) = 1
									THEN json_type(ltp.`groups`)
								END
							) = 'array'
						THEN ltp.`groups`
						ELSE '[]'
					END
				) g
				WHERE g.`type` IS NOT 'object'
					OR json_type(g.`value`, '$.id') IS NOT 'text'
					OR LENGTH(TRIM(json_extract(g.`value`, '$.id'))) = 0
					OR json_type(g.`value`, '$.type') IS NOT 'text'
					OR LENGTH(TRIM(json_extract(g.`value`, '$.type'))) = 0
					OR json_type(g.`value`, '$.instruction') IS NOT 'text'
					OR json_type(g.`value`, '$.startIndex') IS NOT 'integer'
					OR json_extract(g.`value`, '$.startIndex') < 0
					OR json_type(g.`value`, '$.count') IS NOT 'integer'
					OR json_extract(g.`value`, '$.count') NOT BETWEEN 1 AND 40
					OR (
						json_type(g.`value`, '$.optionBank') IS NOT NULL
						AND json_type(g.`value`, '$.optionBank') IS NOT 'array'
					)
					OR COALESCE(
						(
							SELECT SUM(json_extract(p.`value`, '$.count'))
							FROM json_each(
								CASE
									WHEN json_valid(ltp.`groups`) = 1
										AND (
											CASE
												WHEN json_valid(ltp.`groups`) = 1
												THEN json_type(ltp.`groups`)
											END
										) = 'array'
									THEN ltp.`groups`
									ELSE '[]'
								END
							) p
							WHERE p.`key` < g.`key`
						),
						0
					) IS NOT json_extract(g.`value`, '$.startIndex')
			)
			AND (
				SELECT SUM(json_extract(g.`value`, '$.count'))
				FROM json_each(
					CASE
						WHEN json_valid(ltp.`groups`) = 1
							AND (
								CASE
									WHEN json_valid(ltp.`groups`) = 1
									THEN json_type(ltp.`groups`)
								END
							) = 'array'
						THEN ltp.`groups`
						ELSE '[]'
					END
				) g
			) = (
				CASE
					WHEN json_valid(`assignment_prompt`.`questions`) = 1
						AND (
							CASE
								WHEN json_valid(`assignment_prompt`.`questions`) = 1
								THEN json_type(`assignment_prompt`.`questions`)
							END
						) = 'array'
					THEN json_array_length(`assignment_prompt`.`questions`)
					ELSE -1
				END
			)
			AND NOT EXISTS (
				SELECT 1
				FROM json_each(
					CASE
						WHEN json_valid(`assignment_prompt`.`questions`) = 1
							AND (
								CASE
									WHEN json_valid(`assignment_prompt`.`questions`) = 1
									THEN json_type(`assignment_prompt`.`questions`)
								END
							) = 'array'
						THEN `assignment_prompt`.`questions`
						ELSE '[]'
					END
				) q
				INNER JOIN json_each(
					CASE
						WHEN json_valid(ltp.`groups`) = 1
							AND (
								CASE
									WHEN json_valid(ltp.`groups`) = 1
									THEN json_type(ltp.`groups`)
								END
							) = 'array'
						THEN ltp.`groups`
						ELSE '[]'
					END
				) g
					ON q.`key` >= json_extract(g.`value`, '$.startIndex')
					AND q.`key` < json_extract(g.`value`, '$.startIndex') + json_extract(g.`value`, '$.count')
				WHERE json_type(q.`value`, '$.type') = 'text'
					AND LENGTH(TRIM(json_extract(q.`value`, '$.type'))) > 0
					AND json_extract(q.`value`, '$.type') IS NOT json_extract(g.`value`, '$.type')
			)
	);
