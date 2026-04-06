import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';

cli({
  site: 'baidu',
  name: 'search',
  description: '百度搜索',
  domain: 'www.baidu.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词' },
    { name: 'limit', type: 'int', default: 10, help: '返回结果数量' },
  ],
  columns: ['rank', 'title', 'url', 'abstract'],

  func: async (page: IPage, kwargs) => {
    const query = encodeURIComponent(kwargs.query as string);
    const limit = Math.min(Number(kwargs.limit) || 10, 50);

    await page.goto(`https://www.baidu.com/s?wd=${query}&rn=${limit}`);
    await page.wait(3);

    const data = await page.evaluate(`
      (() => {
        const strip = (html) => (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#(\\d+);/g, (_, dec) => String.fromCharCode(dec)).replace(/"/g, '"').replace(/</g, '<').replace(/>/g, '>').trim();
        const results = [];
        const seen = new Set();
        const container = document.querySelector('#content_left');
        if (!container) return results;

        container.querySelectorAll('h3').forEach((h3) => {
          const linkEl = h3.querySelector('a');
          const title = strip(linkEl?.textContent || h3.textContent || '');
          const parent = h3.closest('.result, .result-op, .c-container');
          const absEl = parent?.querySelector('.c-abstract, .c-summary, .c-span-last, .content-span') || parent;
          let url = linkEl?.href || '';
          if (url && url.startsWith('/')) {
            url = 'https://www.baidu.com' + url;
          }
          const abstract = strip(absEl?.textContent || '').substring(0, 150);
          // 去重
          if (title && !title.includes('百度为您找到') && !seen.has(title)) {
            seen.add(title);
            results.push({
              rank: results.length + 1,
              title: title,
              url: url,
              abstract: abstract
            });
          }
        });
        return results;
      })()
    `);

    return (data as any[]).slice(0, limit);
  },
});
