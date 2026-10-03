import { useState } from 'react';
import { Plus, RefreshCcw, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EmbeddingModel } from '../../types';
import type { PhraseMemoryEntry } from '../../services/phraseMemoryService';
import { IconButton, Select, SettingRow, StatRow } from '../ui';
import { FIELD_INLINE_CLASSNAME } from '../ui/fieldStyles';

interface Props {
  entry: PhraseMemoryEntry;
  disabled: boolean;
  onMeasure: (model: EmbeddingModel) => void;
  onTags: (tags: string[]) => Promise<void>;
  onEditing: (editing: boolean) => void;
}

export function MemoryMetadataEditor({ entry, disabled, onMeasure, onTags, onEditing }: Props) {
  const { t } = useTranslation();
  const [model, setModel] = useState<EmbeddingModel>('text-embedding-3-small');
  const [editingTags, setEditingTags] = useState(false);
  const [tags, setTags] = useState('');
  const exists = entry.embeddings.some((measure) => measure.model === model);
  const closeTags = () => { setEditingTags(false); onEditing(false); };
  return <div className="divide-y divide-rule border-y border-rule">
    <SettingRow label={t('library.embeddingModels')} hint={t('library.embeddingModelsHint')}>
      <Select value={model} onChange={(value) => setModel(value as EmbeddingModel)} disabled={disabled || editingTags}
        ariaLabel={t('library.embeddingModel')} options={[
          { value: 'text-embedding-3-small', label: 'text-embedding-3-small' },
          { value: 'text-embedding-3-large', label: 'text-embedding-3-large' },
        ]} />
      <IconButton onClick={() => onMeasure(model)} disabled={disabled || editingTags}
        title={t(exists ? 'library.recalculateMeasure' : 'library.addMeasure')}>
        {exists ? <RefreshCcw size={14} /> : <Plus size={14} />}
      </IconButton>
    </SettingRow>
    <dl className="space-y-1 py-2.5">
      {entry.embeddings.map((measure) => <StatRow key={`${measure.provider}-${measure.model}-${measure.profile}`}
        label={measure.model} value={t('library.measureDimensions', { count: measure.dimensions })} />)}
      {entry.embeddings.length === 0 && <StatRow label={t('library.embeddingModels')} value={t('library.noMeasures')} />}
    </dl>
    <SettingRow label={t('library.textTags')} hint={t('library.textTagsHint')}>
      {editingTags ? <>
        <input value={tags} onChange={(event) => setTags(event.target.value)} className={FIELD_INLINE_CLASSNAME}
          aria-label={t('library.textTags')} disabled={disabled} />
        <IconButton onClick={() => { void onTags(tags.split(';')).then(closeTags).catch(() => { /* Parent reports the failure and retains this draft. */ }); }} disabled={disabled} title={t('common.save')}><Save size={14} /></IconButton>
        <IconButton onClick={closeTags} disabled={disabled} title={t('common.cancel')}><X size={14} /></IconButton>
      </> : <>
        <span className="max-w-48 break-words text-sm text-editorial-ink">{entry.tags.join('; ') || t('library.noTags')}</span>
        <IconButton onClick={() => { setTags(entry.tags.join('; ')); setEditingTags(true); onEditing(true); }} disabled={disabled} title={t('library.editTags')}><Plus size={14} /></IconButton>
      </>}
    </SettingRow>
  </div>;
}
