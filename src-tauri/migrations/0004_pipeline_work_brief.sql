-- Optional shared task context. Existing pipelines retain their legacy prompts.
ALTER TABLE pipelines ADD COLUMN work_brief TEXT;
