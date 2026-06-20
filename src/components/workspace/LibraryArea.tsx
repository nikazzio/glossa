import { useState } from 'react';
import { ArrowLeft, BookMarked, Brain, LibraryBig } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { DictionariesTab } from '../library/DictionariesTab';
import { MemoriesTab } from '../library/MemoriesTab';
import { PromptTemplatesTab } from '../library/PromptTemplatesTab';

type LibrarySection = 'glossaries' | 'memories' | 'templates' | null;

interface SectionCardProps {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  body: string;
  onClick: () => void;
}

function SectionCard({ icon: Icon, title, body, onClick }: SectionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-[24px] border border-editorial-border bg-editorial-paper/75 px-5 py-4 text-left shadow-[var(--inset-highlight)] transition-colors hover:border-editorial-accent/45 hover:bg-editorial-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
    >
      <span className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg/85 text-editorial-muted transition-colors group-hover:border-editorial-accent/45 group-hover:text-editorial-accent">
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg italic text-editorial-ink">{title}</span>
          <span className="mt-1 block text-xs text-editorial-muted [text-wrap:pretty]">{body}</span>
        </span>
      </span>
    </button>
  );
}

export function LibraryArea() {
  const { t } = useTranslation();
  const { activeWorkspace } = useWorkspaceStore();
  const setActiveWorkspaceArea = useUiStore((s) => s.setActiveWorkspaceArea);
  const [activeSection, setActiveSection] = useState<LibrarySection>(null);

  const sectionTitle =
    activeSection === 'glossaries' ? t('library.tabs.dictionaries')
    : activeSection === 'memories' ? t('library.tabs.memories')
    : activeSection === 'templates' ? t('library.tabs.templates')
    : t('workspace.areas.library.title');

  return (
    <main className="flex flex-1 h-full min-h-0 flex-col overflow-y-auto bg-editorial-paper custom-scrollbar">
      <div className="px-5 py-5 md:px-6 max-w-5xl">
        {/* Back nav */}
        <div className="mb-4">
          {activeSection !== null ? (
            <button
              type="button"
              onClick={() => setActiveSection(null)}
              aria-label={t('workspace.libraryArea.backToLibrary')}
              className="flex items-center gap-1.5 text-xs text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent rounded-md"
            >
              <ArrowLeft size={11} />
              <span>{t('workspace.areas.library.title')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveWorkspaceArea(null)}
              aria-label={t('workspace.libraryArea.backLabel', { name: activeWorkspace?.name ?? '' })}
              className="flex items-center gap-1.5 text-xs text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent rounded-md"
            >
              <ArrowLeft size={11} />
              <span>{activeWorkspace?.name ?? t('workspace.noActive')}</span>
            </button>
          )}
        </div>

        {/* Header */}
        <div className="mb-5">
          <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">
            {sectionTitle}
          </h1>
        </div>

        {/* Hub or section content */}
        {activeSection === null ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <SectionCard
              icon={BookMarked}
              title={t('library.tabs.dictionaries')}
              body={t('workspace.libraryArea.glossariesBody')}
              onClick={() => setActiveSection('glossaries')}
            />
            <SectionCard
              icon={Brain}
              title={t('library.tabs.memories')}
              body={t('workspace.libraryArea.memoriesBody')}
              onClick={() => setActiveSection('memories')}
            />
            <SectionCard
              icon={LibraryBig}
              title={t('library.tabs.templates')}
              body={t('workspace.libraryArea.templatesBody')}
              onClick={() => setActiveSection('templates')}
            />
          </div>
        ) : activeSection === 'glossaries' ? (
          <DictionariesTab />
        ) : activeSection === 'memories' ? (
          <MemoriesTab />
        ) : (
          <PromptTemplatesTab />
        )}
      </div>
    </main>
  );
}
