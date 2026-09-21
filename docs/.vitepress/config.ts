import { defineConfig } from 'vitepress';

const sidebarIt = [
  {
    "text": "Per iniziare",
    "items": [
      {
        "text": "Installazione e primo progetto",
        "link": "/intro/getting-started"
      },
      {
        "text": "Workspace e progetti",
        "link": "/guides/projects-and-workspace"
      }
    ]
  },
  {
    "text": "Fonti e archiviazione",
    "items": [
      {
        "text": "Ricerca delle fonti",
        "link": "/guides/source-search"
      },
      {
        "text": "Biblioteca e lettore IIIF",
        "link": "/guides/library-discovery"
      },
      {
        "text": "Archiviazione e lavori",
        "link": "/guides/storage-and-jobs"
      },
      {
        "text": "Backup e ripristino",
        "link": "/reference/backup-and-restore"
      }
    ]
  },
  {
    "text": "Trascrizione",
    "items": [
      {
        "text": "Trascrizione di un documento",
        "link": "/guides/transcription"
      }
    ]
  },
  {
    "text": "Traduzione e revisione",
    "items": [
      {
        "text": "Traduzione di un documento",
        "link": "/guides/document-pipeline"
      },
      {
        "text": "Modello di elaborazione",
        "link": "/guides/llm-and-pipelines"
      },
      {
        "text": "Dizionari e glossario",
        "link": "/guides/glossary-and-memory"
      },
      {
        "text": "Memoria di frasi ed esempi",
        "link": "/guides/phrase-memory"
      },
      {
        "text": "Valutazione e revisione",
        "link": "/guides/audit-review"
      },
      {
        "text": "Annotazioni e note",
        "link": "/guides/annotations"
      },
      {
        "text": "Contesto e cache dei prompt",
        "link": "/guides/context-and-caching"
      }
    ]
  },
  {
    "text": "Riferimento",
    "items": [
      {
        "text": "Configurazione della pipeline",
        "link": "/reference/pipeline-config"
      },
      {
        "text": "Servizi di traduzione",
        "link": "/reference/provider-support"
      },
      {
        "text": "Importazione ed esportazione",
        "link": "/reference/import-export"
      },
      {
        "text": "Scorciatoie da tastiera",
        "link": "/guides/keyboard-shortcuts"
      },
      {
        "text": "Risoluzione dei problemi",
        "link": "/reference/troubleshooting"
      }
    ]
  },
  {
    "text": "Progetto",
    "items": [
      {
        "text": "Stato del progetto",
        "link": "/project/status"
      },
      {
        "text": "Versioni e note di rilascio",
        "link": "/project/changelog"
      }
    ]
  }
];

const sidebarEn = [
  {
    "text": "Getting started",
    "items": [
      {
        "text": "Installation and first project",
        "link": "/en/intro/getting-started"
      },
      {
        "text": "Workspaces and projects",
        "link": "/en/guides/projects-and-workspace"
      }
    ]
  },
  {
    "text": "Sources and storage",
    "items": [
      {
        "text": "Source search",
        "link": "/en/guides/source-search"
      },
      {
        "text": "Library and IIIF viewer",
        "link": "/en/guides/library-discovery"
      },
      {
        "text": "Storage and jobs",
        "link": "/en/guides/storage-and-jobs"
      },
      {
        "text": "Backup and restore",
        "link": "/en/reference/backup-and-restore"
      }
    ]
  },
  {
    "text": "Transcription",
    "items": [
      {
        "text": "Transcribing a document",
        "link": "/en/guides/transcription"
      }
    ]
  },
  {
    "text": "Translation and review",
    "items": [
      {
        "text": "Translating a document",
        "link": "/en/guides/document-pipeline"
      },
      {
        "text": "Processing model",
        "link": "/en/guides/llm-and-pipelines"
      },
      {
        "text": "Dictionaries and glossary",
        "link": "/en/guides/glossary-and-memory"
      },
      {
        "text": "Phrase memory and examples",
        "link": "/en/guides/phrase-memory"
      },
      {
        "text": "Assessment and review",
        "link": "/en/guides/audit-review"
      },
      {
        "text": "Annotations and notes",
        "link": "/en/guides/annotations"
      },
      {
        "text": "Context and prompt caching",
        "link": "/en/guides/context-and-caching"
      }
    ]
  },
  {
    "text": "Reference",
    "items": [
      {
        "text": "Pipeline configuration",
        "link": "/en/reference/pipeline-config"
      },
      {
        "text": "Translation providers",
        "link": "/en/reference/provider-support"
      },
      {
        "text": "Import and export",
        "link": "/en/reference/import-export"
      },
      {
        "text": "Keyboard shortcuts",
        "link": "/en/guides/keyboard-shortcuts"
      },
      {
        "text": "Troubleshooting",
        "link": "/en/reference/troubleshooting"
      }
    ]
  },
  {
    "text": "Project",
    "items": [
      {
        "text": "Project status",
        "link": "/en/project/status"
      },
      {
        "text": "Versions and release notes",
        "link": "/en/project/changelog"
      }
    ]
  }
];

export default defineConfig({
  title: 'Glossa',
  description: 'Documentazione tecnica di Glossa: fonti digitali, traduzione, revisione e gestione dei dati.',
  base: '/glossa/',
  cleanUrls: true,
  lastUpdated: true,
  locales: {
    root: {
      label: 'Italiano',
      lang: 'it',
      title: 'Glossa',
      description: 'Documentazione tecnica di Glossa: fonti digitali, traduzione, revisione e gestione dei dati.',
      themeConfig: {
        nav: [
          { text: 'Inizia qui', link: '/intro/getting-started' },
          { text: 'Traduzione', link: '/guides/document-pipeline' },
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
      description: 'Technical documentation for Glossa: digital sources, translation, review and data management.',
      themeConfig: {
        nav: [
          { text: 'Start here', link: '/en/intro/getting-started' },
          { text: 'Translation', link: '/en/guides/document-pipeline' },
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
