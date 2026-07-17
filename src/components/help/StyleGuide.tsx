import { useEffect, useState } from 'react';
import { Play, Plus, Save, Settings, CircleCheck, AlertCircle, Loader2, FilePen } from 'lucide-react';
import { IconButton, PillButton, ContrastBadge } from '../ui';

function useCssVarMap(vars: readonly string[]): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const map: Record<string, string> = {};
    vars.forEach(v => {
      map[v] = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    });
    setValues(map);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return values;
}

const COLOR_TOKENS = [
  { name: 'bg',       var: '--color-editorial-bg',       label: 'Sfondo' },
  { name: 'ink',      var: '--color-editorial-ink',      label: 'Testo principale' },
  { name: 'charcoal', var: '--color-editorial-charcoal', label: 'Pipeline / azioni primarie' },
  { name: 'accent',   var: '--color-editorial-accent',   label: 'Accento / interazione' },
  { name: 'muted',    var: '--color-editorial-muted',    label: 'Testo secondario' },
  { name: 'success',  var: '--color-editorial-success',  label: 'Stato OK / salvato' },
  { name: 'border',   var: '--color-editorial-border',   label: 'Bordi' },
  { name: 'textbox',  var: '--color-editorial-textbox',  label: 'Sfondo input' },
];

const ALL_CSS_VARS = ['--color-editorial-bg', ...COLOR_TOKENS.map(t => t.var)] as const;

function ColorSection() {
  const cssValues = useCssVarMap(ALL_CSS_VARS);
  const bg = cssValues['--color-editorial-bg'] ?? '';
  const tokenValues = COLOR_TOKENS.map(t => ({ ...t, value: cssValues[t.var] ?? '' }));

  return (
    <div className="space-y-2">
      {tokenValues.map(({ name, label, value }) => (
        <div key={name} className="flex items-center gap-3">
          <div
            className="h-8 w-8 shrink-0 rounded-lg border border-editorial-border/60"
            style={{ backgroundColor: value }}
          />
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs text-editorial-muted">editorial-{name}</p>
            <p className="font-mono text-xs text-editorial-ink/50">{value || '…'}</p>
          </div>
          <p className="text-xs text-editorial-muted shrink-0 hidden sm:block">{label}</p>
          {value && bg && name !== 'bg' && <ContrastBadge fg={value} bg={bg} />}
        </div>
      ))}
    </div>
  );
}

const TYPE_SCALE = [
  { label: 'Display',   specimen: 'La traduzione come arte',                              cls: 'font-display text-2xl italic text-editorial-ink' },
  { label: 'Heading',   specimen: 'Configurazione pipeline',                              cls: 'font-display text-lg text-editorial-ink' },
  { label: 'Body',      specimen: 'Testo principale dell\'interfaccia — leggibile.',       cls: 'font-sans text-[15px] text-editorial-ink' },
  { label: 'Secondary', specimen: 'Descrizione contestuale, nota breve.',                 cls: 'font-sans text-[13px] text-editorial-muted' },
  { label: 'Label',     specimen: 'IMPOSTAZIONI PIPELINE',                                cls: 'font-sans text-[11px] font-bold uppercase tracking-[0.2em] text-editorial-muted' },
  { label: 'Micro',     specimen: 'DEV · v0.9.1',                                        cls: 'font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-editorial-muted' },
];

function TypographySection() {
  return (
    <div className="space-y-4">
      {TYPE_SCALE.map(({ label, specimen, cls }) => (
        <div key={label} className="flex items-baseline gap-4 border-b border-editorial-border pb-3 last:border-0">
          <span className="w-20 shrink-0 font-mono text-xs text-editorial-muted uppercase tracking-wider">{label}</span>
          <p className={cls}>{specimen}</p>
        </div>
      ))}
    </div>
  );
}

function ComponentsSection() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-editorial-muted mb-3">Icon buttons</p>
        <div className="flex items-center gap-3 flex-wrap">
          <IconButton title="Default"><Settings size={14} /></IconButton>
          <IconButton title="Accent" tone="accent"><Save size={14} /></IconButton>
          <IconButton title="Success" tone="success"><Plus size={14} /></IconButton>
          <IconButton title="Disabled" disabled><Settings size={14} /></IconButton>
          <IconButton title="Nuovo" className="border-dashed"><Plus size={14} /></IconButton>
          <PillButton variant="primary"><span className="flex items-center gap-1.5"><Play size={11} className="fill-current" /> Avvia</span></PillButton>
        </div>
        <div className="mt-1.5 flex gap-6 text-xs text-editorial-muted font-mono">
          <span>default</span><span>accent</span><span>success</span><span>disabled</span><span>+ nuovo</span><span>start</span>
        </div>
      </div>

      <div>
        <p className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-editorial-muted mb-3">Pill buttons</p>
        <div className="flex items-center gap-2 flex-wrap">
          <PillButton variant="primary">Primary</PillButton>
          <PillButton variant="secondary">Secondary</PillButton>
          <PillButton variant="accent">Accent</PillButton>
        </div>
      </div>

      <div>
        <p className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-editorial-muted mb-3">Status badges</p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-editorial-success/50 bg-editorial-success/10 px-2.5 py-1 text-[10px] text-editorial-success">
            <CircleCheck size={11} /> Salvato
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-editorial-muted/30 bg-editorial-muted/8 px-2.5 py-1 text-[10px] text-editorial-muted">
            <Loader2 size={11} className="animate-spin" /> Salvataggio
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-editorial-muted/30 bg-editorial-muted/8 px-2.5 py-1 text-[10px] text-editorial-muted">
            <FilePen size={11} /> Non salvato
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-editorial-accent/50 bg-editorial-accent/8 px-2.5 py-1 text-[10px] text-editorial-accent">
            <AlertCircle size={11} /> Errore
          </span>
        </div>
      </div>
    </div>
  );
}

export function StyleGuide() {
  return (
    <div className="space-y-10">
      <div className="border-b border-editorial-border pb-6">
        <p className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-editorial-muted mb-2">Glossa</p>
        <h2 className="font-display text-3xl text-editorial-ink mb-2" style={{ fontVariationSettings: '"wght" 560' }}>Design System</h2>
        <p className="font-sans text-[13px] text-editorial-muted">Token, tipografia e componenti base dell'interfaccia. I valori dei colori sono letti in tempo reale dai CSS custom properties.</p>
      </div>

      <section>
        <h3 className="font-display text-xl italic text-editorial-ink mb-1">Colori</h3>
        <p className="text-[12px] text-editorial-muted mb-5">Token letti dai CSS custom properties — aggiornamento automatico con il dark mode.</p>
        <ColorSection />
      </section>

      <section>
        <h3 className="font-display text-xl italic text-editorial-ink mb-1">Tipografia</h3>
        <p className="text-[12px] text-editorial-muted mb-5">
          Serif: <span className="font-mono">Elstob</span> (variable, opsz 6–18, wght 200–800) —
          Sans: <span className="font-mono">Plus Jakarta Sans</span> (variable, wght 200–800)
        </p>
        <TypographySection />
      </section>

      <section>
        <h3 className="font-display text-xl italic text-editorial-ink mb-1">Componenti</h3>
        <p className="text-[12px] text-editorial-muted mb-5">Stili base per i componenti interattivi principali.</p>
        <ComponentsSection />
      </section>

      <section className="rounded-2xl border border-dashed border-editorial-border p-5 opacity-50">
        <h3 className="font-display text-xl italic text-editorial-ink mb-1">Dark mode</h3>
        <p className="text-[12px] text-editorial-muted">
          I token <span className="font-mono">--color-editorial-*</span> verranno ridefiniti
          in <span className="font-mono">@media (prefers-color-scheme: dark)</span> in <span className="font-mono">index.css</span>.
          Questa sezione si popolerà automaticamente.
        </p>
      </section>
    </div>
  );
}
