-- Per-pipeline prompt composition: custom system texts by id and parts switched
-- off, as JSON {"texts": {id: text}, "disabled": [part ids]}. NULL = all defaults.
ALTER TABLE pipelines ADD COLUMN prompt_composition TEXT;
