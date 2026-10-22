/**
 * robots.txt + sitemap.xml for every domain this site serves (each lab has its own subdomain),
 * so links always use the domain the crawler opened. Lists public pages only (the rest need login).
 *  GET /robots.txt   GET /sitemap.xml
 */
const PAGES = ['/', '/book', '/track', '/login', '/privacy', '/terms'];
const FALLBACK = 'srisai-diagnostics.spreadapps.in';

export default async (req: Request) => {
  const url = new URL(req.url);
  const host = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.spreadapps\.in$/.test(url.hostname) ? url.hostname : FALLBACK;
  const base = `https://${host}`;
  if (url.pathname === '/robots.txt') {
    return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`, { headers: headers('text/plain; charset=utf-8') });
  }
  const today = new Date().toISOString().slice(0, 10);
  const urls = PAGES.map(
    (p, i) =>
      `  <url>\n    <loc>${base}${p}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${i === 0 ? 'weekly' : 'monthly'}</changefreq>\n    <priority>${i === 0 ? '1.0' : '0.6'}</priority>\n  </url>`,
  ).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: headers('application/xml; charset=utf-8'),
  });
};

function headers(type: string) {
  return { 'content-type': type, 'Cache-Control': 'public, max-age=3600', 'Netlify-Vary': 'header=Host' };
}

export const config = { path: ['/robots.txt', '/sitemap.xml'] };
