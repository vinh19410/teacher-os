UPDATE `class_assignment`
SET `target_scope` = 'selected'
WHERE `class_study_pack_id` IS NULL
	AND `target_scope` = 'class'
	AND EXISTS (
		SELECT 1
		FROM `enrollment` e
		INNER JOIN `student` s
			ON s.`id` = e.`student_id`
			AND s.`org_id` = `class_assignment`.`org_id`
		WHERE e.`org_id` = `class_assignment`.`org_id`
			AND e.`class_id` = `class_assignment`.`class_id`
			AND e.`status` = 'active'
			AND s.`id` NOT LIKE 'demo-student:%'
			AND e.`created_at` < `class_assignment`.`created_at`
			AND NOT EXISTS (
				SELECT 1
				FROM `session_package` sp
				WHERE sp.`enrollment_id` = e.`id`
					AND sp.`org_id` = `class_assignment`.`org_id`
					AND sp.`created_at` >= `class_assignment`.`created_at`
			)
			AND NOT EXISTS (
				SELECT 1
				FROM `class_assignment_target` t
				WHERE t.`org_id` = `class_assignment`.`org_id`
					AND t.`assignment_id` = `class_assignment`.`id`
					AND t.`student_id` = e.`student_id`
			)
	);
--> statement-breakpoint
INSERT OR IGNORE INTO `class_assignment_target` (`id`, `org_id`, `assignment_id`, `student_id`, `submitted_at`)
SELECT
	'cat_bf_' || ca.`id` || '_' || e.`student_id`,
	ca.`org_id`,
	ca.`id`,
	e.`student_id`,
	NULL
FROM (
	SELECT
		`id`,
		`org_id`,
		`class_id`,
		`created_at`,
		`class_study_pack_id`,
		`target_scope`,
		COALESCE(
			`due_at`,
			CASE
				WHEN `due` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
					AND strftime('%Y-%m-%d', `due`) = `due`
				THEN CAST(strftime('%s', `due`) AS integer) * 1000 + 61199999
				ELSE NULL
			END
		) AS `deadline_ms`
	FROM `class_assignment`
) ca
INNER JOIN `class` c
	ON c.`id` = ca.`class_id`
	AND c.`org_id` = ca.`org_id`
	AND c.`status` = 'active'
INNER JOIN `enrollment` e
	ON e.`org_id` = ca.`org_id`
	AND e.`class_id` = ca.`class_id`
	AND e.`status` = 'active'
INNER JOIN `student` s
	ON s.`id` = e.`student_id`
	AND s.`org_id` = ca.`org_id`
	AND s.`id` NOT LIKE 'demo-student:%'
WHERE ca.`class_study_pack_id` IS NULL
	AND ca.`target_scope` = 'class'
	AND ca.`deadline_ms` IS NOT NULL
	AND (
		(e.`created_at` >= ca.`created_at` AND e.`created_at` <= ca.`deadline_ms`)
		OR EXISTS (
			SELECT 1
			FROM `session_package` sp
			WHERE sp.`enrollment_id` = e.`id`
				AND sp.`org_id` = ca.`org_id`
				AND sp.`created_at` >= ca.`created_at`
				AND sp.`created_at` <= ca.`deadline_ms`
		)
	);
