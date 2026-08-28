CREATE UNIQUE INDEX `session_package_parked_student_uq` ON `session_package` (`student_id`) WHERE "session_package"."enrollment_id" is null;
