/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
module.exports = {
  docsSidebar: [
    'intro',
    'getting-started',
    'architecture',
    {
      type: 'category',
      label: 'Frontend',
      items: ['frontend/main-js', 'frontend/dom-contract', 'frontend/accessibility']
    },
    {
      type: 'category',
      label: 'REST API',
      items: ['api/overview', 'api/market-data', 'api/swap']
    },
    {
      type: 'category',
      label: 'Integrations',
      items: ['integrations/ton-connect', 'integrations/swap', 'integrations/telegram-bot']
    },
    'operations',
    'troubleshooting'
  ]
};
