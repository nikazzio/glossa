-- #390: preset identity is deliberately an opaque key. Future icon kinds can
-- coexist without storing SVG paths or user-provided assets in the database.
ALTER TABLE workspaces ADD COLUMN icon_key TEXT NOT NULL DEFAULT 'book';
