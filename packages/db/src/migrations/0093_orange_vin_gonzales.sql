-- Non-destructive two-pass deduplication using SQLite rowid before creating
-- case-insensitive (ASCII lower(trim(name))) unique indexes on course_category
-- and course. Preserves all rows and foreign-key references.

-- Pass 1 (course_category, max 80 chars): disambiguate duplicates with " (rn)",
-- falling back to " (#rowid)" if " (rn)" already exists in the same org.
WITH base AS (
	SELECT
		rowid AS rid,
		org_id,
		trim(name) AS trimmed_name,
		ROW_NUMBER() OVER (
			PARTITION BY org_id, lower(trim(name))
			ORDER BY sort_order ASC, created_at ASC, id ASC
		) AS rn
	FROM `course_category`
),
candidates AS (
	SELECT
		rid,
		org_id,
		rn,
		CASE
			WHEN rtrim(substr(trimmed_name, 1, 80 - length(' (' || rn || ')'))) = ''
				THEN '(' || rn || ')'
			ELSE rtrim(substr(trimmed_name, 1, 80 - length(' (' || rn || ')'))) || ' (' || rn || ')'
		END AS cand1,
		CASE
			WHEN rtrim(substr(trimmed_name, 1, 80 - length(' (#' || rid || ')'))) = ''
				THEN '(#' || rid || ')'
			ELSE rtrim(substr(trimmed_name, 1, 80 - length(' (#' || rid || ')'))) || ' (#' || rid || ')'
		END AS cand2
	FROM base
	WHERE rn > 1
),
resolved AS (
	SELECT
		c.rid,
		CASE
			WHEN NOT EXISTS (
				SELECT 1
				FROM `course_category` AS other
				WHERE other.org_id = c.org_id
					AND other.rowid <> c.rid
					AND lower(trim(other.name)) = lower(trim(c.cand1))
			) THEN c.cand1
			ELSE c.cand2
		END AS next_name
	FROM candidates AS c
)
UPDATE `course_category`
SET `name` = (SELECT next_name FROM resolved WHERE resolved.rid = `course_category`.rowid)
WHERE rowid IN (SELECT rid FROM resolved);
--> statement-breakpoint
-- Pass 2 insurance (course_category): resolve any residual collision caused by
-- shared-prefix truncation or pre-existing " (#rowid)" values.
WITH ranked2 AS (
	SELECT
		rowid AS rid,
		trim(name) AS trimmed_name,
		ROW_NUMBER() OVER (
			PARTITION BY org_id, lower(trim(name))
			ORDER BY sort_order ASC, created_at ASC, id ASC
		) AS rn
	FROM `course_category`
),
remaining AS (
	SELECT
		rid,
		CASE
			WHEN rtrim(substr(trimmed_name, 1, 80 - length(' (#' || rid || '-' || rn || ')'))) = ''
				THEN '(#' || rid || '-' || rn || ')'
			ELSE rtrim(substr(trimmed_name, 1, 80 - length(' (#' || rid || '-' || rn || ')'))) || ' (#' || rid || '-' || rn || ')'
		END AS safe_name
	FROM ranked2
	WHERE rn > 1
)
UPDATE `course_category`
SET `name` = (SELECT safe_name FROM remaining WHERE remaining.rid = `course_category`.rowid)
WHERE rowid IN (SELECT rid FROM remaining);
--> statement-breakpoint
-- Pass 1 (course, max 120 chars): disambiguate duplicates within (org_id, category_id).
WITH base AS (
	SELECT
		rowid AS rid,
		org_id,
		category_id,
		trim(name) AS trimmed_name,
		ROW_NUMBER() OVER (
			PARTITION BY org_id, category_id, lower(trim(name))
			ORDER BY sort_order ASC, created_at ASC, id ASC
		) AS rn
	FROM `course`
),
candidates AS (
	SELECT
		rid,
		org_id,
		category_id,
		rn,
		CASE
			WHEN rtrim(substr(trimmed_name, 1, 120 - length(' (' || rn || ')'))) = ''
				THEN '(' || rn || ')'
			ELSE rtrim(substr(trimmed_name, 1, 120 - length(' (' || rn || ')'))) || ' (' || rn || ')'
		END AS cand1,
		CASE
			WHEN rtrim(substr(trimmed_name, 1, 120 - length(' (#' || rid || ')'))) = ''
				THEN '(#' || rid || ')'
			ELSE rtrim(substr(trimmed_name, 1, 120 - length(' (#' || rid || ')'))) || ' (#' || rid || ')'
		END AS cand2
	FROM base
	WHERE rn > 1
),
resolved AS (
	SELECT
		c.rid,
		CASE
			WHEN NOT EXISTS (
				SELECT 1
				FROM `course` AS other
				WHERE other.org_id = c.org_id
					AND other.category_id = c.category_id
					AND other.rowid <> c.rid
					AND lower(trim(other.name)) = lower(trim(c.cand1))
			) THEN c.cand1
			ELSE c.cand2
		END AS next_name
	FROM candidates AS c
)
UPDATE `course`
SET `name` = (SELECT next_name FROM resolved WHERE resolved.rid = `course`.rowid)
WHERE rowid IN (SELECT rid FROM resolved);
--> statement-breakpoint
-- Pass 2 insurance (course): resolve any residual collision from shared-prefix truncation
-- or pre-existing " (#rowid)" values.
WITH ranked2 AS (
	SELECT
		rowid AS rid,
		trim(name) AS trimmed_name,
		ROW_NUMBER() OVER (
			PARTITION BY org_id, category_id, lower(trim(name))
			ORDER BY sort_order ASC, created_at ASC, id ASC
		) AS rn
	FROM `course`
),
remaining AS (
	SELECT
		rid,
		CASE
			WHEN rtrim(substr(trimmed_name, 1, 120 - length(' (#' || rid || '-' || rn || ')'))) = ''
				THEN '(#' || rid || '-' || rn || ')'
			ELSE rtrim(substr(trimmed_name, 1, 120 - length(' (#' || rid || '-' || rn || ')'))) || ' (#' || rid || '-' || rn || ')'
		END AS safe_name
	FROM ranked2
	WHERE rn > 1
)
UPDATE `course`
SET `name` = (SELECT safe_name FROM remaining WHERE remaining.rid = `course`.rowid)
WHERE rowid IN (SELECT rid FROM remaining);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `course_category_org_name_uq` ON `course_category` (`org_id`, lower(trim(`name`)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `course_org_category_name_uq` ON `course` (`org_id`, `category_id`, lower(trim(`name`)));
