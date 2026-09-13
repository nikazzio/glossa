import { useEffect, useState } from 'react';
import { HelpCircle, RefreshCw } from 'lucide-react';
import { appLogDir } from '@tauri-apps/api/path';
import { useTranslation } from 'react-i18next';
import { CopyButton, Dialog, DialogCancelButton, IconButton } from '../ui';
import { HELP_GROUPS, useUiStore, type HelpSection } from '../../stores/uiStore';

interface HelpGuideProps {
  open: boolean;
  onClose: () => void;
}

interface HelpBlock {
  title: string;
  paragraphs: string[];
  steps?: string[];
}

interface HelpArticle {
  title: string;
  intro: string;
  blocks: HelpBlock[];
}

function isArticle(value: unknown): value is HelpArticle {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<HelpArticle>;
  return typeof candidate.title === 'string' && Array.isArray(candidate.blocks);
}

export function HelpGuide({ open, onClose }: HelpGuideProps) {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<HelpSection>('overview');
  const requestedSection = useUiStore((state) => state.helpSection);

  useEffect(() => {
    if (open) setActiveSection(requestedSection);
  }, [open, requestedSection]);

  // Un argomento senza testo non lascia il riquadro vuoto: si torna alla
  // panoramica invece di leggere blocchi che non esistono.
  const requested = t(`help.articles.${activeSection}`, { returnObjects: true }) as unknown;
  const article: HelpArticle = isArticle(requested)
    ? requested
    : (t('help.articles.overview', { returnObjects: true }) as HelpArticle);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}
      title={t('help.title')}
      closeLabel={t('common.close')}
      icon={<HelpCircle size={22} />}
      eyebrow={t('help.eyebrow')}
      widthClassName="max-w-5xl"
      panelClassName="h-[88vh]"
      bodyClassName="p-0"
      footer={
        <div className="flex justify-end">
          <DialogCancelButton onClick={onClose}>{t('common.close')}</DialogCancelButton>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden sm:flex-row">
        <nav
          aria-label={t('help.navigation')}
          className="max-h-48 shrink-0 overflow-y-auto border-b border-editorial-border bg-surface-panel p-4 custom-scrollbar sm:max-h-none sm:w-60 sm:border-b-0 sm:border-r"
        >
          {HELP_GROUPS.map((group) => (
            <div key={group.id} className="mb-5 last:mb-0">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-editorial-muted">
                {t(`help.groups.${group.id}`)}
              </p>
              <ul className="space-y-1">
                {group.sections.map((section) => (
                  <li key={section}>
                    <button
                      type="button"
                      aria-pressed={activeSection === section}
                      aria-controls={`help-${section}`}
                      onClick={() => setActiveSection(section)}
                      className={`block w-full rounded-sm px-2 py-1.5 text-left text-xs leading-relaxed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                        activeSection === section
                          ? 'bg-editorial-accent/10 font-semibold text-editorial-accent'
                          : 'text-editorial-ink hover:bg-surface-hover/50'
                      }`}
                    >
                      {t(`help.articles.${section}.title`)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <article
          key={activeSection}
          id={`help-${activeSection}`}
          aria-labelledby="help-article-title"
          className="min-w-0 flex-1 overflow-y-auto p-5 text-sm leading-relaxed text-editorial-ink sm:p-8 custom-scrollbar"
        >
          <h2 id="help-article-title" className="mb-4 font-display text-3xl tracking-tight">
            {article.title}
          </h2>
          <p className="mb-8 text-editorial-muted">{article.intro}</p>
          {article.blocks.map((block, index) => (
            <section key={index} className="mb-8 last:mb-0">
              <h3 className="mb-3 border-b border-editorial-border pb-2 font-display text-xl">
                {block.title}
              </h3>
              {block.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex} className="mb-3 last:mb-0">{paragraph}</p>
              ))}
              {block.steps && (
                <ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-editorial-muted">
                  {block.steps.map((step, stepIndex) => (
                    <li key={stepIndex} className="pl-1">{step}</li>
                  ))}
                </ol>
              )}
            </section>
          ))}
          {activeSection === 'overview' && <VersionWidget />}
          {activeSection === 'troubleshooting' && <LogDirectory />}
        </article>
      </div>
    </Dialog>
  );
}

function LogDirectory() {
  const { t } = useTranslation();
  const [logPath, setLogPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    appLogDir()
      .then((directory) => { if (!cancelled) setLogPath(directory); })
      .catch(() => { if (!cancelled) setLogPath(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="mt-8">
      <h3 className="mb-3 font-display text-xl">{t('help.logs.title')}</h3>
      <div className="flex items-center gap-3 border-y border-editorial-border py-3">
        <span className="min-w-0 flex-1 break-all font-mono text-xs">
          {logPath ?? t(loading ? 'help.logs.loading' : 'help.logs.unavailable')}
        </span>
        {logPath && <CopyButton text={logPath} size="sm" />}
      </div>
    </section>
  );
}

function VersionWidget() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'loading' | 'up-to-date' | 'update-available' | 'error'>('idle');
  const [latestTag, setLatestTag] = useState<string | null>(null);

  const checkForUpdates = async () => {
    setStatus('loading');
    try {
      const res = await fetch('https://api.github.com/repos/nikazzio/glossa/releases/latest');
      if (!res.ok) throw new Error('fetch failed');
      const data = await (res.json() as Promise<{ tag_name: string }>);
      const normalize = (v: string) => v.trim().replace(/^glossa-/i, '').replace(/^v/, '');
      setLatestTag(data.tag_name);
      setStatus(normalize(data.tag_name) === normalize(String(__APP_VERSION__)) ? 'up-to-date' : 'update-available');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="mt-8 flex items-center gap-3 border-y border-editorial-border/70 py-3">
      <span className="font-mono text-xs text-editorial-muted/70">v{__APP_VERSION__}</span>
      <IconButton
        title={t('help.version.check')}
        onClick={() => void checkForUpdates()}
        disabled={status === 'loading'}
        size="sm"
      >
        <RefreshCw size={13} className={status === 'loading' ? 'animate-spin' : ''} />
      </IconButton>
      {status === 'up-to-date' && (
        <span className="text-xs text-editorial-success">{t('help.version.upToDate')}</span>
      )}
      {status === 'update-available' && latestTag && (
        <span className="text-xs text-editorial-accent">{t('help.version.updateAvailable', { tag: latestTag })}</span>
      )}
      {status === 'error' && (
        <span className="text-xs text-editorial-muted/60">{t('help.version.error')}</span>
      )}
    </div>
  );
}

