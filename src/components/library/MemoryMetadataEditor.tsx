import { useState } from 'react';
import { Loader2, Pencil, Plus, RefreshCcw, Ruler, Save, Tags, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EmbeddingModel } from '../../types';
import type { PhraseMemoryEntry } from '../../services/phraseMemoryService';
import { FieldLabel, Hint, IconButton, Select } from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';

interface Props {
  entry: PhraseMemoryEntry;
  disabled: boolean;
  measuring?: boolean;
  onMeasure: (model: EmbeddingModel) => void;
  onTags: (tags: string[]) => Promise<void>;
  onEditing: (editing: boolean) => void;
}

export function MemoryMetadataEditor({ entry, disabled, measuring = false, onMeasure, onTags, onEditing }: Props) {
  const { t } = useTranslation();
  const [model, setModel] = useState<EmbeddingModel>('text-embedding-3-small');
  const [editingTags, setEditingTags] = useState(false);
  const [tags, setTags] = useState('');
  const exists = entry.embeddings.some((measure) => measure.model === model);
  const closeTags = () => { setEditingTags(false); onEditing(false); };
  return <div className="grid min-w-0 gap-4 sm:grid-cols-2">
    <section className="min-w-0 space-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <Hint label={entry.embeddings.map((measure) => `${measure.model} · ${t('library.measureDimensions', { count: measure.dimensions })}`).join('\n') || t('library.noMeasures')}>
          <span className="flex items-center gap-1 text-xs text-editorial-muted"><Ruler size={14} /><span>{entry.embeddings.length}</span></span>
        </Hint>
        <Select value={model} onChange={(value) => setModel(value as EmbeddingModel)} disabled={disabled || editingTags}
          className="min-w-0 flex-1" ariaLabel={t('library.embeddingModel')} options={[
            { value: 'text-embedding-3-small', label: 'text-embedding-3-small' },
            { value: 'text-embedding-3-large', label: 'text-embedding-3-large' },
          ]} />
        <IconButton size="sm" onClick={() => onMeasure(model)} disabled={disabled || editingTags}
          title={t(measuring ? 'library.measureRunning' : exists ? 'library.recalculateMeasure' : 'library.addMeasure')}>
          {measuring ? <Loader2 size={14} className="animate-spin" /> : exists ? <RefreshCcw size={14} /> : <Plus size={14} />}
        </IconButton>
      </div>
      {measuring && <span role="status" className="sr-only">{t('library.measureRunning')}</span>}
      <ul className="space-y-1.5 text-xs text-editorial-muted">
        {entry.embeddings.map((measure) => <li key={`${measure.provider}-${measure.model}-${measure.profile}`} className="flex min-w-0 items-start gap-2">
          <Ruler size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 break-words">{measure.model}</span>
          <Hint label={t('library.measureDimensions', { count: measure.dimensions })}><span className="tabular-nums">{measure.dimensions}</span></Hint>
        </li>)}
      </ul>
    </section>
    <section className="min-w-0 space-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <Hint label={t('library.textTagsHint')}><Tags size={14} className="text-editorial-muted" /></Hint>
        {!editingTags && <span className="min-w-0 flex-1 break-words text-sm text-editorial-ink">{entry.tags.join('; ') || t('library.noTags')}</span>}
        {!editingTags && <IconButton size="sm" onClick={() => { setTags(entry.tags.join('; ')); setEditingTags(true); onEditing(true); }} disabled={disabled} title={t('library.editTags')}><Pencil size={14} /></IconButton>}
      </div>
      {editingTags ? <div className="space-y-2">
        <FieldLabel htmlFor={`memory-tags-${entry.id}`} >{t('library.textTags')}</FieldLabel>
        <input id={`memory-tags-${entry.id}`} value={tags} onChange={(event) => setTags(event.target.value)} className={FIELD_CLASSNAME}
          disabled={disabled} />
        <div className="flex justify-end gap-1">
          <IconButton size="sm" onClick={() => { void onTags(tags.split(';')).then(closeTags).catch(() => { /* Parent reports the failure and retains this draft. */ }); }} disabled={disabled} title={t('common.save')}><Save size={14} /></IconButton>
          <IconButton size="sm" onClick={closeTags} disabled={disabled} title={t('common.cancel')}><X size={14} /></IconButton>
        </div>
      </div> : null}
    </section>
  </div>;
}
