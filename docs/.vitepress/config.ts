import { defineConfig } from 'vitepress';

const sidebarIt = [
  {
    text: 'Inizio',
    items: [{ text: 'Per iniziare', link: '/intro/getting-started' }],
  },
  {
    text: 'Guide',
    items: [
      { text: 'Pipeline documento', link: '/guides/document-pipeline' },
      { text: 'LLM e pipeline', link: '/guides/llm-and-pipelines' },
      { text: 'Progetti e workspace', link: '/guides/projects-and-workspace' },
      { text: 'Biblioteca e fonti IIIF', link: '/guides/library-discovery' },
      { text: 'Archiviazione e lavori', link: '/guides/storage-and-jobs' },
      { text: 'Glossario e phrase memory', link: '/guides/glossary-and-memory' },
      { text: 'Phrase memory', link: '/guides/phrase-memory' },
      { text: 'Audit e revisione', link: '/guides/audit-review' },
      { text: 'Contesto e caching', link: '/guides/context-and-caching' },
      { text: 'Annotazioni', link: '/guides/annotations' },
      { text: 'Scorciatoie da tastiera', link: '/guides/keyboard-shortcuts' },
    ],
  },
  {
    text: 'Riferimento',
    items: [
      { text: 'Configurazione pipeline', link: '/reference/pipeline-config' },
      { text: 'Provider supportati', link: '/reference/provider-support' },
      { text: 'Import ed export', link: '/reference/import-export' },
      { text: 'Risoluzione problemi', link: '/reference/troubleshooting' },
    ],
  },
  {
    text: 'Progetto',
    items: [{ text: 'Changelog', link: '/project/changelog' }],
  },
];

const sidebarEn = [
  {
    text: 'Getting started',
    items: [{ text: 'Getting started', link: '/en/intro/getting-started' }],
  },
  {
    text: 'Guides',
    items: [
      { text: 'Document pipeline', link: '/en/guides/document-pipeline' },
      { text: 'LLMs and pipelines', link: '/en/guides/llm-and-pipelines' },
      { text: 'Projects and workspace', link: '/en/guides/projects-and-workspace' },
      { text: 'Library and IIIF sources', link: '/en/guides/library-discovery' },
      { text: 'Storage and jobs', link: '/en/guides/storage-and-jobs' },
      { text: 'Glossary and phrase memory', link: '/en/guides/glossary-and-memory' },
      { text: 'Phrase memory', link: '/en/guides/phrase-memory' },
      { text: 'Audit and review', link: '/en/guides/audit-review' },
      { text: 'Context and caching', link: '/en/guides/context-and-caching' },
      { text: 'Annotations', link: '/en/guides/annotations' },
      { text: 'Keyboard shortcuts', link: '/en/guides/keyboard-shortcuts' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'Pipeline config', link: '/en/reference/pipeline-config' },
      { text: 'Provider support', link: '/en/reference/provider-support' },
      { text: 'Import and export', link: '/en/reference/import-export' },
      { text: 'Troubleshooting', link: '/en/reference/troubleshooting' },
    ],
  },
  {
    text: 'Project',
    items: [{ text: 'Changelog', link: '/en/project/changelog' }],
  },
];

export default defineConfig({
  title: 'Glossa',
  description: 'Documentazione desktop per il workflow di traduzione di Glossa.',
  base: '/glossa/',
  cleanUrls: true,
  lastUpdated: true,
  locales: {
    root: {
      label: 'Italiano',
      lang: 'it',
      title: 'Glossa',
      description: 'Documentazione desktop per il workflow di traduzione di Glossa.',
      themeConfig: {
        nav: [
          { text: 'Inizia qui', link: '/intro/getting-started' },
          { text: 'Workflow', link: '/guides/document-pipeline' },
          { text: 'Riferimento', link: '/reference/pipeline-config' },
          { text: 'GitHub', link: 'https://github.com/nikazzio/glossa' },
        ],
        sidebar: {
          '/': sidebarIt,
        },
        outline: {
          level: [2, 3],
          label: 'In questa pagina',
        },
        socialLinks: [{ icon: 'github', link: 'https://github.com/nikazzio/glossa' }],
        footer: {
          message: 'Documentazione pubblica dell’app desktop Glossa',
          copyright: `Copyright (c) ${new Date().getFullYear()} Glossa`,
        },
        docFooter: {
          prev: 'Pagina precedente',
          next: 'Pagina successiva',
        },
        darkModeSwitchLabel: 'Aspetto',
        lightModeSwitchTitle: 'Passa al tema chiaro',
        darkModeSwitchTitle: 'Passa al tema scuro',
        sidebarMenuLabel: 'Menu',
        returnToTopLabel: 'Torna in alto',
        langMenuLabel: 'Cambia lingua',
        lastUpdated: {
          text: 'Ultimo aggiornamento',
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/',
      title: 'Glossa',
      description: 'Desktop documentation for the Glossa translation workflow.',
      themeConfig: {
        nav: [
          { text: 'Start here', link: '/en/intro/getting-started' },
          { text: 'Workflow', link: '/en/guides/document-pipeline' },
          { text: 'Reference', link: '/en/reference/pipeline-config' },
          { text: 'GitHub', link: 'https://github.com/nikazzio/glossa' },
        ],
        sidebar: {
          '/en/': sidebarEn,
        },
        outline: {
          level: [2, 3],
          label: 'On this page',
        },
        socialLinks: [{ icon: 'github', link: 'https://github.com/nikazzio/glossa' }],
        footer: {
          message: 'Public documentation for the Glossa desktop app',
          copyright: `Copyright (c) ${new Date().getFullYear()} Glossa`,
        },
      },
    },
  },
  themeConfig: {
    logo: '/glossa-mark.svg',
  },
});
