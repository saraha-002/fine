const fs = require("fs");
const path = require("path");

// Configuration
const DOMAIN = 'https://fineescorts.co.ke';
const ROOT_DIR = __dirname;
const OUTPUT_FILE = path.join(ROOT_DIR, 'sitemap.xml');
const ROBOTS_FILE = path.join(ROOT_DIR, 'robots.txt');

// Helper to get last modified date (use current date if file doesn't exist)
function getLastMod(filePath) {
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    return stats.mtime.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

function getPriority(url) {
  if (url === '/index.html') return '1.0';
  // Pillar pages get highest priority (0.9)
  if (url.includes('ultimate-guide.html')) return '0.9';
  if (url.match(/\/([a-z\-]+)-escorts\.html/)) return '0.9';
  if (url.includes('/profiles/')) return '0.8';
  if (url.includes('/blog/')) return '0.7';
  if (url === '/blog.html' || url === '/reviews.html') return '0.8';
  if (url.match(/\/(contact|about|advertise|privacy|terms|dmca|reportabuse|reporttrafficking|lawenforcement)\.html/)) return '0.5';
  return '0.6';
}

function getChangefreq(url) {
  if (url === '/index.html') return 'daily';
  if (url.includes('ultimate-guide.html')) return 'weekly';
  if (url.match(/\/([a-z\-]+)-escorts\.html/)) return 'weekly';
  if (url.includes('/profiles/')) return 'weekly';
  if (url.includes('/blog/')) return 'monthly';
  if (url === '/blog.html') return 'monthly';
  if (url === '/reviews.html') return 'weekly';
  return 'monthly';
}

// ========== 1. Load profiles.json to get real cities ==========
const profilesPath = path.join(ROOT_DIR, 'data', 'profiles.json');
let profiles = [];
try {
  const raw = fs.readFileSync(profilesPath, 'utf8');
  profiles = JSON.parse(raw);
  console.log(`📚 Loaded ${profiles.length} profiles from profiles.json`);
} catch (err) {
  console.warn(`⚠️ Could not load profiles.json: ${err.message}`);
}

// ========== 2. Build city page URLs from unique cities in profiles ==========
const uniqueCities = [...new Set(profiles.map(p => p.city).filter(Boolean))];
const cityUrls = uniqueCities.map(city => {
  const citySlug = city.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '');
  const filePath = path.join(ROOT_DIR, `${citySlug}-escorts.html`);
  return {
    url: `/${citySlug}-escorts.html`,
    lastmod: getLastMod(filePath),
    priority: '0.9',
    changefreq: 'weekly'
  };
});

// ========== 3. Pillar pages (Ultimate Guides) – ADD MANUALLY ==========
const pillarPagesList = [
  'kitengela-ultimate-guide.html',
  'syokimau-ultimate-guide.html',
  'mlolongo-ultimate-guide.html',
  'athiriver-ultimate-guide.html',
  'imara-daima-ultimate-guide.html'
];
const pillarUrls = pillarPagesList.map(file => {
  const filePath = path.join(ROOT_DIR, file);
  return {
    url: `/${file}`,
    lastmod: getLastMod(filePath),
    priority: '0.9',
    changefreq: 'weekly'
  };
});

// ========== 4. Build profile page URLs from profiles.json ==========
const profileUrls = profiles.map(profile => ({
  url: `/profiles/${profile.slug}.html`,
  lastmod: getLastMod(path.join(ROOT_DIR, 'profiles', `${profile.slug}.html`)),
  priority: '0.8',
  changefreq: 'weekly'
}));

// ========== 5. Static HTML files (only essential ones) ==========
const essentialStatic = [
  'index.html', 'blog.html', 'reviews.html', 'contact.html', 
  'about.html', 'advertise.html', 'privacy.html', 'terms.html', 
  'dmca.html', 'reportabuse.html', 'reporttrafficking.html', 'lawenforcement.html'
];
const staticUrls = essentialStatic.map(file => ({
  url: `/${file}`,
  lastmod: getLastMod(path.join(ROOT_DIR, file)),
  priority: getPriority(`/${file}`),
  changefreq: getChangefreq(`/${file}`)
}));

// ========== 6. Blog posts from /blog/ folder ==========
const blogDir = path.join(ROOT_DIR, 'blog');
const blogUrls = [];
if (fs.existsSync(blogDir)) {
  const blogFiles = fs.readdirSync(blogDir).filter(f => f.endsWith('.html'));
  blogFiles.forEach(file => {
    blogUrls.push({
      url: `/blog/${file}`,
      lastmod: getLastMod(path.join(blogDir, file)),
      priority: '0.7',
      changefreq: 'monthly'
    });
  });
  console.log(`📝 Found ${blogFiles.length} blog posts`);
}

// ========== 7. Combine all URLs ==========
let allUrls = [
  ...staticUrls,
  ...blogUrls,
  ...cityUrls,
  ...pillarUrls,
  ...profileUrls
];

// Remove duplicates (by URL)
allUrls = allUrls.filter((url, index, self) =>
  index === self.findIndex(u => u.url === url.url)
);

// Sort alphabetically
allUrls.sort((a, b) => a.url.localeCompare(b.url));

// ========== 8. Generate sitemap.xml ==========
let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
allUrls.forEach(({ url, lastmod, priority, changefreq }) => {
  sitemap += `  <url>
    <loc>${DOMAIN}${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>
`;
});
sitemap += `</urlset>`;

fs.writeFileSync(OUTPUT_FILE, sitemap);
console.log(`\n✅ Sitemap generated with ${allUrls.length} URLs.`);

// ========== 9. Generate robots.txt (FIXED: removed /css/, /js/ blocks) ==========
const robots = `# FineEscorts Kenya - Robots.txt
# Last updated: ${new Date().toISOString().split('T')[0]}

User-agent: *
Allow: /
Disallow: /templates/
Disallow: /data/
Disallow: /images/
Disallow: /ficha.html

# Sitemap location
Sitemap: ${DOMAIN}/sitemap.xml

Crawl-delay: 1

User-agent: Googlebot
Allow: /
Crawl-delay: 0.5

User-agent: Bingbot
Allow: /
Crawl-delay: 0.5
`;
fs.writeFileSync(ROBOTS_FILE, robots);
console.log(`✅ robots.txt generated (CSS/JS now allowed)`);

// ========== 10. Summary ==========
console.log('\n📊 SITEMAP SUMMARY');
console.log('='.repeat(40));
console.log(`🌐 Domain: ${DOMAIN}`);
console.log(`📄 Total URLs: ${allUrls.length}`);
console.log(`   • Profile pages: ${profileUrls.length}`);
console.log(`   • City pages (from profiles): ${cityUrls.length}`);
console.log(`   • Pillar pages (ultimate guides): ${pillarUrls.length}`);
console.log(`   • Blog posts: ${blogUrls.length}`);
console.log(`   • Static pages: ${staticUrls.length}`);
