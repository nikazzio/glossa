import { defineConfig } from 'vitepress';

const sidebar = [
  {
    text: 'Getting started',
    items: [{ text: 'Getting started', link: '/intro/getting-started' }],
  },
  {
    text: 'Guides',
    items: [
      { text: 'Document pipeline', link: '/guides/document-pipeline' },
      { text: 'Annotations', link: '/guides/annotations' },
      { text: 'Phrase memory', link: '/guides/phrase-memory' },
      { text: 'Keyboard shortcuts', link: '/guides/keyboard-shortcuts' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'Pipeline config', link: '/reference/pipeline-config' },
      { text: 'Provider support', link: '/reference/provider-support' },
    ],
  },
  {
    text: 'Project',
    items: [{ text: 'Changelog', link: '/project/changelog' }],
  },
];

export default defineConfig({
  title: 'Glossa',
  description: 'Public documentation for Glossa.',
  base: '/glossa/',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Start here', link: '/intro/getting-started' },
      { text: 'Docs', link: '/guides/document-pipeline' },
      { text: 'GitHub', link: 'https://github.com/nikazzio/glossa' },
    ],
    sidebar: {
      '/': sidebar,
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/nikazzio/glossa' }],
    footer: {
      message: 'Public documentation for Glossa',
      copyright: `Copyright (c) ${new Date().getFullYear()} Glossa`,
    },
  },
});
