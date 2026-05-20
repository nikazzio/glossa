import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import type { Pipeline } from '../../types';

interface PipelineTabProps {
  pipeline: Pipeline;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
}

function PipelineTab({ pipeline, index, isActive, onSelect, onRename }: PipelineTabProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(pipeline.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (e: React.MouseEvent) => {
    if (!isActive) return;
    e.stopPropagation();
    setEditValue(pipeline.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
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

  return (
    <button
      onClick={onSelect}
      className={`group flex items-center gap-1.5 rounded px-2 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
        isActive
          ? 'text-editorial-ink'
          : 'text-editorial-muted hover:text-editorial-ink'
      }`}
      aria-pressed={isActive}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold transition-colors ${
          isActive
            ? 'border border-editorial-accent/40 bg-editorial-accent/10 text-editorial-accent'
            : 'border border-editorial-border/60 text-editorial-muted/60 group-hover:border-editorial-accent/30 group-hover:text-editorial-accent/70'
        }`}
      >
        {index + 1}
      </span>

      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="font-display italic tracking-tight text-editorial-ink text-sm bg-transparent border-b border-editorial-accent outline-none w-32 leading-none"
          aria-label="Rinomina pipeline"
        />
      ) : (
        <span
          onDoubleClick={startEdit}
          className="font-display italic tracking-tight text-sm leading-none select-none"
          title={isActive ? 'Doppio clic per rinominare' : undefined}
        >
          {pipeline.name}
        </span>
      )}
    </button>
  );
}

export function PipelineBar() {
  const pipelines = useProjectStore((s) => s.pipelines);
  const activePipelineId = useProjectStore((s) => s.activePipelineId);
  const switchPipeline = useProjectStore((s) => s.switchPipeline);
  const createNewPipeline = useProjectStore((s) => s.createNewPipeline);
  const renamePipeline = useProjectStore((s) => s.renamePipeline);

  if (pipelines.length === 0) return null;

  const handleAdd = () => {
    void createNewPipeline(`Pipeline ${pipelines.length + 1}`);
  };

  return (
    <div
      role="tablist"
      aria-label="Pipeline"
      className="flex-shrink-0 flex items-center gap-0.5 bg-[#f7f3ec] px-6 py-1 md:px-10"
    >
      {pipelines.map((pipeline, index) => (
        <PipelineTab
          key={pipeline.id}
          pipeline={pipeline}
          index={index}
          isActive={pipeline.id === activePipelineId}
          onSelect={() => void switchPipeline(pipeline.id)}
          onRename={(name) => void renamePipeline(pipeline.id, name)}
        />
      ))}

      <button
        onClick={handleAdd}
        aria-label="Aggiungi pipeline"
        className="ml-1 flex h-5 w-5 items-center justify-center rounded-full border border-editorial-border/50 text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      >
        <Plus size={10} />
      </button>
    </div>
  );
}
