-- Align Listening "Talking about the history of bikes" Q5 blank wording
-- (`easier and [5] ride` -> `easier; ride [5]`) with audio answer `more smoothly`
-- across `library_test_part` and untouched `assignment_prompt` copies
-- (idempotent, org-edit safe, SQLite/D1 JSON1 nested CASE WHEN safe).
UPDATE `library_test_part`
SET
	`questions` = CASE
		WHEN json_valid(`questions`) = 1 THEN
			CASE
				WHEN json_type(`questions`, '$[4].stem') = 'text' THEN
					CASE
						WHEN json_extract(`questions`, '$[4].stem') = 'easier and ____ ride'
						THEN json_set(`questions`, '$[4].stem', 'easier; ride ____')
						ELSE `questions`
					END
				ELSE `questions`
			END
		ELSE `questions`
	END,
	`groups` = CASE
		WHEN json_valid(`groups`) = 1 THEN
			CASE
				WHEN json_type(`groups`) = 'array' THEN
					CASE
						WHEN json_type(`groups`, '$[0].instruction') = 'text' THEN
							CASE
								WHEN INSTR(json_extract(`groups`, '$[0].instruction'), '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0
								THEN json_set(
									`groups`,
									'$[0].instruction',
									REPLACE(
										json_extract(`groups`, '$[0].instruction'),
										'<td><p>easier and <strong>(5)</strong> ride</p></td>',
										'<td><p>easier; ride <strong>(5)</strong></p></td>'
									)
								)
								ELSE `groups`
							END
						ELSE `groups`
					END
				ELSE `groups`
			END
		ELSE `groups`
	END,
	`intro` = CASE
		WHEN INSTR(`intro`, '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0
		THEN REPLACE(
			`intro`,
			'<td><p>easier and <strong>(5)</strong> ride</p></td>',
			'<td><p>easier; ride <strong>(5)</strong></p></td>'
		)
		ELSE `intro`
	END,
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE `id` = 'lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4'
	AND `test_id` = 'lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3'
	AND `part` = 's4'
	AND EXISTS (
		SELECT 1
		FROM `library_test` lt
		WHERE lt.`id` = `library_test_part`.`test_id`
			AND lt.`skill` = 'listening'
	)
	AND (
		CASE
			WHEN json_valid(`questions`) = 1 THEN
				CASE
					WHEN json_type(`questions`) = 'array' THEN json_array_length(`questions`)
					ELSE -1
				END
			ELSE -1
		END
	) = 10
	AND (
		CASE
			WHEN json_valid(`questions`) = 1 THEN
				CASE
					WHEN json_type(`questions`) = 'array' THEN json_type(`questions`, '$[4]')
				END
		END
	) = 'object'
	AND (
		CASE
			WHEN json_valid(`questions`) = 1 THEN
				CASE
					WHEN json_type(`questions`, '$[4].answer') = 'text'
					THEN LOWER(TRIM(json_extract(`questions`, '$[4].answer')))
				END
		END
	) = 'more smoothly'
	AND (
		CASE
			WHEN json_valid(`questions`) = 1 THEN
				CASE
					WHEN json_type(`questions`, '$[4].stem') = 'text'
					THEN json_extract(`questions`, '$[4].stem')
				END
		END
	) IN ('easier and ____ ride', 'easier; ride ____')
	AND (
		CASE
			WHEN json_valid(`questions`) = 1 THEN
				CASE
					WHEN json_type(`questions`, '$[4].alts') IS NULL
						OR json_type(`questions`, '$[4].alts') = 'null'
					THEN ''
					WHEN json_type(`questions`, '$[4].alts') = 'text'
					THEN TRIM(json_extract(`questions`, '$[4].alts'))
					ELSE '__non_empty__'
				END
			ELSE '__invalid__'
		END
	) = ''
	AND (
		CASE
			WHEN json_valid(`questions`) = 1 THEN
				CASE
					WHEN json_type(`questions`, '$[4].type') IS NULL
						OR json_type(`questions`, '$[4].type') = 'null'
					THEN 'tablecomp'
					WHEN json_type(`questions`, '$[4].type') = 'text'
					THEN json_extract(`questions`, '$[4].type')
					ELSE '__other__'
				END
			ELSE '__invalid__'
		END
	) = 'tablecomp'
	AND (
		TRIM(`intro`) = ''
		OR INSTR(`intro`, '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0
		OR INSTR(`intro`, '<td><p>easier; ride <strong>(5)</strong></p></td>') > 0
	)
	AND (
		TRIM(`groups`) = ''
		OR (
			CASE
				WHEN json_valid(`groups`) = 1 THEN
					CASE
						WHEN json_type(`groups`) = 'array' THEN json_array_length(`groups`)
						ELSE -1
					END
				ELSE -1
			END
		) = 0
		OR (
			CASE
				WHEN json_valid(`groups`) = 1 THEN
					CASE
						WHEN json_type(`groups`) = 'array' THEN
							CASE
								WHEN json_array_length(`groups`) >= 1 THEN
									CASE
										WHEN json_type(`groups`, '$[0]') = 'object' THEN
											CASE
												WHEN json_type(`groups`, '$[0].instruction') = 'text' THEN
													CASE
														WHEN INSTR(json_extract(`groups`, '$[0].instruction'), '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0
															OR INSTR(json_extract(`groups`, '$[0].instruction'), '<td><p>easier; ride <strong>(5)</strong></p></td>') > 0
														THEN 1
														ELSE 0
													END
												ELSE 0
											END
										ELSE 0
									END
								ELSE 0
							END
						ELSE 0
					END
				ELSE 0
			END
		) = 1
	)
	AND (
		(
			CASE
				WHEN json_valid(`questions`) = 1 THEN
					CASE
						WHEN json_type(`questions`, '$[4].stem') = 'text' THEN
							CASE
								WHEN json_extract(`questions`, '$[4].stem') = 'easier and ____ ride' THEN 1
								ELSE 0
							END
						ELSE 0
					END
				ELSE 0
			END
		) = 1
		OR INSTR(`intro`, '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0
		OR (
			CASE
				WHEN json_valid(`groups`) = 1 THEN
					CASE
						WHEN json_type(`groups`) = 'array' THEN
							CASE
								WHEN json_type(`groups`, '$[0].instruction') = 'text' THEN
									CASE
										WHEN INSTR(json_extract(`groups`, '$[0].instruction'), '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0 THEN 1
										ELSE 0
									END
								ELSE 0
							END
						ELSE 0
					END
				ELSE 0
			END
		) = 1
	);
--> statement-breakpoint
UPDATE `assignment_prompt`
SET
	`questions` = CASE
		WHEN json_valid(`questions`) = 1 THEN
			CASE
				WHEN json_type(`questions`, '$[4].stem') = 'text' THEN
					CASE
						WHEN json_extract(`questions`, '$[4].stem') = 'easier and ____ ride'
						THEN json_set(`questions`, '$[4].stem', 'easier; ride ____')
						ELSE `questions`
					END
				ELSE `questions`
			END
		ELSE `questions`
	END,
	`groups` = CASE
		WHEN json_valid(`groups`) = 1 THEN
			CASE
				WHEN json_type(`groups`) = 'array' THEN
					CASE
						WHEN json_type(`groups`, '$[0].instruction') = 'text' THEN
							CASE
								WHEN INSTR(json_extract(`groups`, '$[0].instruction'), '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0
								THEN json_set(
									`groups`,
									'$[0].instruction',
									REPLACE(
										json_extract(`groups`, '$[0].instruction'),
										'<td><p>easier and <strong>(5)</strong> ride</p></td>',
										'<td><p>easier; ride <strong>(5)</strong></p></td>'
									)
								)
								ELSE `groups`
							END
						ELSE `groups`
					END
				ELSE `groups`
			END
		ELSE `groups`
	END,
	`intro` = CASE
		WHEN INSTR(`intro`, '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0
		THEN REPLACE(
			`intro`,
			'<td><p>easier and <strong>(5)</strong> ride</p></td>',
			'<td><p>easier; ride <strong>(5)</strong></p></td>'
		)
		ELSE `intro`
	END
WHERE `library_ref` = 'library_test_part:lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4'
	AND `skill` = 'listening'
	AND `part` = 's4'
	AND (
		CASE
			WHEN json_valid(`questions`) = 1 THEN
				CASE
					WHEN json_type(`questions`) = 'array' THEN json_array_length(`questions`)
					ELSE -1
				END
			ELSE -1
		END
	) = 10
	AND (
		CASE
			WHEN json_valid(`questions`) = 1 THEN
				CASE
					WHEN json_type(`questions`) = 'array' THEN json_type(`questions`, '$[4]')
				END
		END
	) = 'object'
	AND (
		CASE
			WHEN json_valid(`questions`) = 1 THEN
				CASE
					WHEN json_type(`questions`, '$[4].answer') = 'text'
					THEN LOWER(TRIM(json_extract(`questions`, '$[4].answer')))
				END
		END
	) = 'more smoothly'
	AND (
		CASE
			WHEN json_valid(`questions`) = 1 THEN
				CASE
					WHEN json_type(`questions`, '$[4].stem') = 'text'
					THEN json_extract(`questions`, '$[4].stem')
				END
		END
	) IN ('easier and ____ ride', 'easier; ride ____')
	AND (
		CASE
			WHEN json_valid(`questions`) = 1 THEN
				CASE
					WHEN json_type(`questions`, '$[4].alts') IS NULL
						OR json_type(`questions`, '$[4].alts') = 'null'
					THEN ''
					WHEN json_type(`questions`, '$[4].alts') = 'text'
					THEN TRIM(json_extract(`questions`, '$[4].alts'))
					ELSE '__non_empty__'
				END
			ELSE '__invalid__'
		END
	) = ''
	AND (
		CASE
			WHEN json_valid(`questions`) = 1 THEN
				CASE
					WHEN json_type(`questions`, '$[4].type') IS NULL
						OR json_type(`questions`, '$[4].type') = 'null'
					THEN 'tablecomp'
					WHEN json_type(`questions`, '$[4].type') = 'text'
					THEN json_extract(`questions`, '$[4].type')
					ELSE '__other__'
				END
			ELSE '__invalid__'
		END
	) = 'tablecomp'
	AND (
		TRIM(`intro`) = ''
		OR INSTR(`intro`, '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0
		OR INSTR(`intro`, '<td><p>easier; ride <strong>(5)</strong></p></td>') > 0
	)
	AND (
		TRIM(`groups`) = ''
		OR (
			CASE
				WHEN json_valid(`groups`) = 1 THEN
					CASE
						WHEN json_type(`groups`) = 'array' THEN json_array_length(`groups`)
						ELSE -1
					END
				ELSE -1
			END
		) = 0
		OR (
			CASE
				WHEN json_valid(`groups`) = 1 THEN
					CASE
						WHEN json_type(`groups`) = 'array' THEN
							CASE
								WHEN json_array_length(`groups`) >= 1 THEN
									CASE
										WHEN json_type(`groups`, '$[0]') = 'object' THEN
											CASE
												WHEN json_type(`groups`, '$[0].instruction') = 'text' THEN
													CASE
														WHEN INSTR(json_extract(`groups`, '$[0].instruction'), '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0
															OR INSTR(json_extract(`groups`, '$[0].instruction'), '<td><p>easier; ride <strong>(5)</strong></p></td>') > 0
														THEN 1
														ELSE 0
													END
												ELSE 0
											END
										ELSE 0
									END
								ELSE 0
							END
						ELSE 0
					END
				ELSE 0
			END
		) = 1
	)
	AND (
		(
			CASE
				WHEN json_valid(`questions`) = 1 THEN
					CASE
						WHEN json_type(`questions`, '$[4].stem') = 'text' THEN
							CASE
								WHEN json_extract(`questions`, '$[4].stem') = 'easier and ____ ride' THEN 1
								ELSE 0
							END
						ELSE 0
					END
				ELSE 0
			END
		) = 1
		OR INSTR(`intro`, '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0
		OR (
			CASE
				WHEN json_valid(`groups`) = 1 THEN
					CASE
						WHEN json_type(`groups`) = 'array' THEN
							CASE
								WHEN json_type(`groups`, '$[0].instruction') = 'text' THEN
									CASE
										WHEN INSTR(json_extract(`groups`, '$[0].instruction'), '<td><p>easier and <strong>(5)</strong> ride</p></td>') > 0 THEN 1
										ELSE 0
									END
								ELSE 0
							END
						ELSE 0
					END
				ELSE 0
			END
		) = 1
	);
