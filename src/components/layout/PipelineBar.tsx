import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { confirm } from '../../stores/confirmStore';
import type { Pipeline } from '../../types';

const MAX_PIPELINES = 10;

interface PipelineTabProps {
  pipeline: Pipeline;
  index: number;
  isActive: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}

function isModified(pipeline: Pipeline): boolean {
  // A pipeline is "new" if it was never run and never had its config saved
  // (updatedAt matches createdAt within a few seconds of creation).
  if (pipeline.lastRunConfig !== null) return true;
  const created = new Date(pipeline.createdAt).getTime();
  const updated = new Date(pipeline.updatedAt).getTime();
  return Math.abs(updated - created) > 5000;
}

function PipelineTab({ pipeline, index, isActive, canDelete, onSelect, onDelete, onRename }: PipelineTabProps) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(pipeline.name);

  const startEdit = (e: React.MouseEvent) => {
    if (!isActive) return;
    e.stopPropagation();
    setEditValue(pipeline.name);
    setEditing(true);
  };

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== pipeline.name) onRename(trimmed);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { setEditing(false); setEditValue(pipeline.name); }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isModified(pipeline)) {
      const confirmed = await confirm({
        title: `Eliminare "${pipeline.name}"?`,
        message: 'Le traduzioni associate a questa pipeline verranno eliminate definitivamente.',
        confirmLabel: 'Elimina',
        danger: true,
      });
      if (!confirmed) return;
    }
    onDelete();
  };

  const showDeleteHint = hovered && canDelete && !editing;

  return (
    <div
      className="flex items-center gap-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={showDeleteHint ? handleDelete : onSelect}
        aria-label={showDeleteHint ? `Elimina ${pipeline.name}` : `Seleziona ${pipeline.name}`}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
          showDeleteHint
            ? 'border border-editorial-accent/50 bg-editorial-accent/10 text-editorial-accent hover:bg-editorial-accent hover:text-white'
            : isActive
            ? 'border border-editorial-accent/40 bg-editorial-accent/10 text-editorial-accent'
            : 'border border-editorial-border/60 text-editorial-muted/60 hover:border-editorial-accent/30 hover:text-editorial-accent/70'
        }`}
      >
        {showDeleteHint ? <Minus size={11} /> : index + 1}
      </button>

      {editing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="font-display italic tracking-tight text-editorial-ink text-sm bg-transparent border-b border-editorial-accent outline-none w-32 leading-none"
          aria-label="Rinomina pipeline"
        />
      ) : (
        <button
          onClick={onSelect}
          onDoubleClick={startEdit}
          className={`font-display italic tracking-tight text-sm leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent rounded ${
            isActive ? 'text-editorial-ink' : 'text-editorial-muted hover:text-editorial-ink'
          }`}
          title={isActive ? 'Doppio clic per rinominare' : undefined}
        >
          {pipeline.name}
        </button>
      )}
    </div>
  );
}

export function PipelineBar() {
  const pipelines = useProjectStore((s) => s.pipelines);
  const activePipelineId = useProjectStore((s) => s.activePipelineId);
  const switchPipeline = useProjectStore((s) => s.switchPipeline);
  const createNewPipeline = useProjectStore((s) => s.createNewPipeline);
  const deletePipeline = useProjectStore((s) => s.deletePipeline);
  const renamePipeline = useProjectStore((s) => s.renamePipeline);

  if (pipelines.length === 0) return null;

  const atLimit = pipelines.length >= MAX_PIPELINES;

  return (
    <div
      role="tablist"
      aria-label="Pipeline"
      className="flex shrink-0 items-center gap-3 bg-[#f7f3ec] px-6 py-1.5 md:px-10"
    >
      {pipelines.map((pipeline, index) => (
        <PipelineTab
          key={pipeline.id}
          pipeline={pipeline}
          index={index}
          isActive={pipeline.id === activePipelineId}
          canDelete={pipelines.length > 1}
          onSelect={() => void switchPipeline(pipeline.id)}
          onDelete={() => void deletePipeline(pipeline.id)}
          onRename={(name) => void renamePipeline(pipeline.id, name)}
        />
      ))}

      {!atLimit && (
        <button
          onClick={() => void createNewPipeline(`Pipeline ${pipelines.length + 1}`)}
          aria-label="Aggiungi pipeline"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-editorial-border/50 text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <Plus size={11} />
        </button>
      )}
    </div>
  );
}
