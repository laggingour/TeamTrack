-- Prevent duplicate Asana projects
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_asana_id
ON projects(asana_project_id)
WHERE asana_project_id IS NOT NULL;

-- Store Asana activity IDs
ALTER TABLE activity_logs
ADD COLUMN IF NOT EXISTS asana_story_id VARCHAR(150);

-- Prevent duplicate Asana activities
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_asana_story
ON activity_logs(asana_story_id)
WHERE asana_story_id IS NOT NULL;