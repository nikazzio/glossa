import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        title: t('pipeline.deleteTitle', { name: pipeline.name }),
        message: t('pipeline.deleteMessage'),
        confirmLabel: t('pipeline.deleteConfirm'),
        danger: true,
      });
      if (!confirmed) return;
    }
    onDelete();
  };

  const showDeleteHint = hovered && canDelete && !editing;

  return (
    <div
      className={`flex items-center gap-2 rounded-full transition-all ${
        isActive
          ? 'bg-editorial-bg border border-editorial-border/50 shadow-[0_1px_6px_rgba(26,26,26,0.08)] px-3.5 py-1.5'
          : 'px-2 py-1 cursor-pointer hover:bg-editorial-bg/60'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={!isActive ? onSelect : undefined}
    >
      <button
        onClick={showDeleteHint ? handleDelete : (isActive ? undefined : onSelect)}
        aria-label={showDeleteHint ? `Elimina ${pipeline.name}` : `Seleziona ${pipeline.name}`}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
          showDeleteHint
            ? 'bg-editorial-accent text-white cursor-pointer'
            : isActive
            ? 'bg-editorial-accent text-white'
            : 'text-editorial-muted/50 hover:text-editorial-accent/60'
        }`}
      >
        {showDeleteHint ? <Minus size={10} /> : index + 1}
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
          onClick={isActive ? undefined : onSelect}
          onDoubleClick={startEdit}
          className={`font-display italic tracking-tight text-sm leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent rounded ${
            isActive ? 'text-editorial-ink cursor-default' : 'text-editorial-muted/60 hover:text-editorial-ink'
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
      role="group"
      aria-label="Pipeline"
      className="flex shrink-0 items-center gap-1.5 bg-[#f7f3ec] px-5 pt-2 pb-1.5 md:px-6"
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
          className="ml-1 flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-editorial-border/40 text-editorial-muted/40 transition-colors hover:border-editorial-accent/50 hover:text-editorial-accent/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <Plus size={10} />
        </button>
      )}
    </div>
  );
}
