-- Counted once when the page lands: listing searches must never reopen and
-- parse every stored payload only to show how much arrived.
ALTER TABLE search_pages ADD COLUMN received INTEGER NOT NULL DEFAULT 0;
ALTER TABLE search_pages ADD COLUMN has_more INTEGER NOT NULL DEFAULT 0;
