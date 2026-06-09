import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  MessageSquare,
  NotebookText,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnnotationsStore } from '../../../stores/annotationsStore';
import { useProjectStore } from '../../../stores/projectStore';
import { MarkdownEditor } from '../../common';
import type { AnnotationType, TranslationChunk } from '../../../types';
import type { Annotation } from '../../../types';

export interface NotesTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
}

const ANNOTATION_META: Record<AnnotationType, { icon: LucideIcon; colorClass: string; bgClass: string; borderClass: string; labelKey: string }> = {
  comment:  { icon: MessageSquare, colorClass: 'text-editorial-charcoal', bgClass: 'bg-editorial-charcoal/8', borderClass: 'border-editorial-charcoal/25', labelKey: 'annotations.typeComment' },
  doubt:    { icon: HelpCircle,    colorClass: 'text-editorial-warning',  bgClass: 'bg-editorial-warning/8',  borderClass: 'border-editorial-warning/30',  labelKey: 'annotations.typeDoubt' },
  problem:  { icon: AlertTriangle, colorClass: 'text-editorial-accent',   bgClass: 'bg-editorial-accent/8',   borderClass: 'border-editorial-accent/25',   labelKey: 'annotations.typeProblem' },
  approved: { icon: CheckCircle2,  colorClass: 'text-editorial-success',  bgClass: 'bg-editorial-success/8',  borderClass: 'border-editorial-success/25',  labelKey: 'annotations.typeApproved' },
};

const ANNOTATION_TYPES: AnnotationType[] = ['comment', 'doubt', 'problem', 'approved'];

function AnnotationCard({
  annotation,
  isEditing,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  annotation: Annotation;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (updates: Partial<Pick<Annotation, 'type' | 'content' | 'anchorText'>>) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const meta = ANNOTATION_META[annotation.type];
  const Icon = meta.icon;

  const [editType, setEditType] = useState<AnnotationType>(annotation.type);
  const [editContent, setEditContent] = useState(annotation.content);
  const [editAnchor, setEditAnchor] = useState(annotation.anchorText ?? '');

  if (isEditing) {
    return (
      <article className={`rounded-2xl border ${meta.borderClass} ${meta.bgClass} px-4 py-3`}>
        <TypeSelector selected={editType} onSelect={setEditType} />
        <MarkdownEditor
          value={editContent}
          onChange={setEditContent}
          markdownEnabled={false}
          minHeightClassName="min-h-[72px]"
          textClassName="text-sm leading-relaxed"
          identityKey={`edit-${annotation.id}`}
        />
        <input
          type="text"
          value={editAnchor}
          onChange={(e) => setEditAnchor(e.target.value)}
          placeholder={t('annotations.anchorPlaceholder')}
          className="mt-2 w-full rounded-xl border border-editorial-border bg-editorial-textbox px-3 py-1.5 text-xs text-editorial-ink placeholder:text-editorial-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onSave({ type: editType, content: editContent, anchorText: editAnchor.trim() || null });
            }}
            className="rounded-full border border-editorial-accent/50 bg-editorial-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-editorial-accent transition-colors hover:bg-editorial-accent/20"
          >
            {t('annotations.updateButton')}
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-full border border-editorial-border px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-editorial-muted transition-colors hover:text-editorial-ink"
          >
            {t('annotations.cancelButton')}
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className={`rounded-2xl border ${meta.borderClass} ${meta.bgClass} px-4 py-3`}>
      <div className="mb-2 flex items-center gap-2">
        <Icon size={13} className={`shrink-0 ${meta.colorClass}`} />
        <span className={`text-[10px] font-bold uppercase tracking-[0.25em] ${meta.colorClass}`}>
          {t(meta.labelKey)}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onEdit}
          aria-label={t('annotations.editButton')}
          className="rounded-full p-1 text-editorial-muted transition-colors hover:text-editorial-ink"
        >
          <Pencil size={11} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('annotations.deleteButton')}
          className="rounded-full p-1 text-editorial-muted transition-colors hover:text-editorial-accent"
        >
          <Trash2 size={11} />
        </button>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-editorial-ink">{annotation.content}</p>
      {annotation.anchorText && (
        <p className="mt-2 truncate rounded-lg bg-editorial-bg/60 px-2 py-1 text-[11px] italic text-editorial-muted">
          «{annotation.anchorText}»
        </p>
      )}
    </article>
  );
}

function TypeSelector({ selected, onSelect }: { selected: AnnotationType; onSelect: (t: AnnotationType) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {ANNOTATION_TYPES.map((type) => {
        const meta = ANNOTATION_META[type];
        const Icon = meta.icon;
        const isActive = selected === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors ${
              isActive
                ? `${meta.borderClass} ${meta.bgClass} ${meta.colorClass}`
                : 'border-editorial-border text-editorial-muted hover:border-editorial-accent/30 hover:text-editorial-ink'
            }`}
          >
            <Icon size={10} />
            {t(meta.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

export function NotesTab({ panelId, labelledBy, currentChunk }: NotesTabProps) {
  const { t } = useTranslation();
  const activePipelineId = useProjectStore((s) => s.activePipelineId);
  const { annotationsByChunkId, addAnnotation, updateAnnotation, deleteAnnotation } = useAnnotationsStore();

  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<AnnotationType>('comment');
  const [formContent, setFormContent] = useState('');
  const [formAnchor, setFormAnchor] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const footnotes = currentChunk?.footnotes ?? [];
  const annotations = currentChunk ? (annotationsByChunkId.get(currentChunk.id) ?? []) : [];

  if (!currentChunk) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <NotebookText size={28} className="text-editorial-border" />
        <p className="text-sm font-medium text-editorial-muted">{t('annotations.emptyNoChunk')}</p>
      </div>
    );
  }

  const handleAdd = async () => {
    if (!formContent.trim() || !activePipelineId) return;
    await addAnnotation({
      chunkId: currentChunk.id,
      pipelineId: activePipelineId,
      type: formType,
      content: formContent.trim(),
      anchorText: formAnchor.trim() || null,
      sequence: annotations.length,
    });
    setFormContent('');
    setFormAnchor('');
    setFormType('comment');
    setShowForm(false);
  };

  const handleSaveEdit = async (id: string, updates: Partial<Pick<Annotation, 'type' | 'content' | 'anchorText'>>) => {
    await updateAnnotation(id, currentChunk.id, updates);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteAnnotation(id, currentChunk.id);
    if (editingId === id) setEditingId(null);
  };

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex flex-col gap-3 px-5 py-5">

      {/* Add annotation button */}
      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-2xl border border-dashed border-editorial-border px-4 py-2.5 text-sm text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent"
        >
          <Plus size={14} />
          {t('annotations.addButton')}
        </button>
      )}

      {/* Add form */}
      {showForm && (
        <div className="rounded-2xl border border-editorial-border bg-editorial-textbox/40 px-4 py-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
              {t('annotations.addButton')}
            </span>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormContent(''); setFormAnchor(''); }}
              className="rounded-full p-1 text-editorial-muted transition-colors hover:text-editorial-ink"
            >
              <X size={12} />
            </button>
          </div>
          <TypeSelector selected={formType} onSelect={setFormType} />
          <MarkdownEditor
            value={formContent}
            onChange={setFormContent}
            markdownEnabled={false}
            placeholder={t('annotations.placeholder')}
            minHeightClassName="min-h-[72px]"
            textClassName="text-sm leading-relaxed"
            identityKey={`new-annotation-${currentChunk.id}`}
          />
          <input
            type="text"
            value={formAnchor}
            onChange={(e) => setFormAnchor(e.target.value)}
            placeholder={t('annotations.anchorPlaceholder')}
            className="mt-2 w-full rounded-xl border border-editorial-border bg-editorial-textbox px-3 py-1.5 text-xs text-editorial-ink placeholder:text-editorial-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!formContent.trim()}
              className="rounded-full border border-editorial-accent/50 bg-editorial-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-editorial-accent transition-colors hover:bg-editorial-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('annotations.saveButton')}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormContent(''); setFormAnchor(''); }}
              className="rounded-full border border-editorial-border px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-editorial-muted transition-colors hover:text-editorial-ink"
            >
              {t('annotations.cancelButton')}
            </button>
          </div>
        </div>
      )}

      {/* Annotations list */}
      {annotations.length === 0 && !showForm && (
        <p className="px-1 text-xs text-editorial-muted">{t('annotations.emptyNoAnnotations')}</p>
      )}
      {annotations.map((ann) => (
        <AnnotationCard
          key={ann.id}
          annotation={ann}
          isEditing={editingId === ann.id}
          onEdit={() => setEditingId(ann.id)}
          onCancelEdit={() => setEditingId(null)}
          onSave={(updates) => handleSaveEdit(ann.id, updates)}
          onDelete={() => handleDelete(ann.id)}
        />
      ))}

      {/* Source footnotes — collapsed, shown only when present */}
      {footnotes.length > 0 && (
        <>
          <div className="mx-0 my-1 h-px bg-editorial-border/40" />
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 py-0.5 text-[10px] font-sans font-bold uppercase tracking-[0.3em] text-editorial-muted/70 transition-colors hover:text-editorial-muted">
              <ChevronRight size={11} className="shrink-0 text-editorial-accent/60 transition-transform group-open:rotate-90" />
              {t('annotations.sourceTitle')}
            </summary>
            <div className="mt-3 space-y-2">
              {footnotes.map((note) => (
                <article key={note.id} className="rounded-2xl border border-editorial-border bg-editorial-bg px-4 py-3">
                  <div className="mb-1.5 font-display text-sm italic text-editorial-accent">{note.marker}</div>
                  <p className="text-[12px] leading-relaxed text-editorial-ink">{note.text}</p>
                </article>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
