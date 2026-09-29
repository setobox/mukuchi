ALTER TABLE auth_sessions ADD COLUMN login_provider TEXT CHECK(login_provider IN ('github','google'));

UPDATE auth_sessions
SET login_provider = (SELECT provider FROM auth_identities WHERE user_id = auth_sessions.user_id)
WHERE local = 0
  AND (SELECT COUNT(*) FROM auth_identities WHERE user_id = auth_sessions.user_id) = 1;
