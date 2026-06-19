const path = require('path');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'CASA Documentation',
  tagline: 'Техническая документация сайта CASA Token',
  favicon: 'img/casa-icon-180.png',
  url: 'http://127.0.0.1:4173',
  baseUrl: '/',
  organizationName: 'casa-token',
  projectName: 'casa-documentation',
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn'
    }
  },
  i18n: {
    defaultLocale: 'ru',
    locales: ['ru']
  },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          routeBasePath: '/',
          editUrl: undefined,
          showLastUpdateTime: false
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css')
        }
      }
    ]
  ],
  themeConfig: {
    image: 'img/casa-social-card.svg',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true
    },
    navbar: {
      title: 'CASA Docs',
      logo: {
        alt: 'CASA Token',
        src: 'img/casa-icon.svg'
      },
      items: [
        { to: '/', label: 'Документация', position: 'left' },
        { to: '/api/overview', label: 'API', position: 'left' },
        { to: '/frontend/main-js', label: 'main.js', position: 'left' }
      ]
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Разработка',
          items: [
            { label: 'Архитектура', to: '/architecture' },
            { label: 'Frontend', to: '/frontend/main-js' },
            { label: 'REST API', to: '/api/overview' }
          ]
        },
        {
          title: 'Интеграции',
          items: [
            { label: 'TON Connect', to: '/integrations/ton-connect' },
            { label: 'Swap', to: '/integrations/swap' }
          ]
        }
      ],
      copyright: `Copyright © ${new Date().getFullYear()} CASA Token`
    },
    prism: {
      additionalLanguages: ['bash', 'json']
    }
  },
  plugins: [
    function sourceAliases() {
      return {
        name: 'source-aliases',
        configureWebpack() {
          return {
            resolve: {
              alias: {
                '@project': path.resolve(__dirname, '..')
              }
            }
          };
        }
      };
    }
  ]
};

module.exports = config;
