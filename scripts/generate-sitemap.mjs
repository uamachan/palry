// sitemap.xml / robots.txt をビルド前に自動生成する。
// 公開ルートは下記 routes を単一の真実とし、ルート追加時の更新漏れを防ぐ。
// lastmod はビルド日時を自動付与（手動更新不要）。
//
// 使い方: node scripts/generate-sitemap.mjs
// 環境変数 SITE_URL でドメインを上書き可能（既定: https://palry.onrender.com）。

import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = resolve(projectRoot, 'client', 'public');

const SITE_URL = (process.env.SITE_URL || 'https://palry.onrender.com').replace(/\/$/, '');

// 公開（インデックス対象）ルート。新しい公開ページを足したらここに追加する。
const routes = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
];

const lastmod = new Date().toISOString().slice(0, 10);

const urls = routes
  .map((r) => [
    '  <url>',
    `    <loc>${SITE_URL}${r.path}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${r.changefreq}</changefreq>`,
    `    <priority>${r.priority}</priority>`,
    '  </url>',
  ].join('\n'))
  .join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;

await writeFile(resolve(publicDir, 'sitemap.xml'), sitemap, 'utf8');
await writeFile(resolve(publicDir, 'robots.txt'), robots, 'utf8');

console.log(`[sitemap] generated ${routes.length} url(s) for ${SITE_URL} (lastmod ${lastmod})`);
