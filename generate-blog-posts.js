const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, 'blog');
const OUTPUT_FILE = path.join(__dirname, 'data', 'blog-posts.json');

// Helper to extract meta tag content
function getMetaContent(html, property) {
  const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match = html.match(regex);
  return match ? match[1] : '';
}

// Helper to extract title
function getTitle(html) {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  return match ? match[1].replace(/\s*\|\s*FineEscorts Kenya$/, '').trim() : '';
}

// Helper to extract image from og:image
function getImage(html) {
  return getMetaContent(html, 'og:image');
}

// Helper to extract date
function getDate(html) {
  const date = getMetaContent(html, 'article:published_time');
  if (date) return date;
  // fallback to file's mtime
  return '';
}

// Helper to extract city from filename
function getCityFromFilename(filename) {
  const lower = filename.toLowerCase();
  // look for city names
  const cities = ['kitengela', 'syokimau', 'mlolongo', 'imara daima', 'athiriver'];
  for (const city of cities) {
    if (lower.includes(city)) {
      // capitalise first letter
      return city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }
  return '';
}

// Read all HTML files in blog directory
const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html'));
const posts = [];

for (const file of files) {
  const filePath = path.join(BLOG_DIR, file);
  const html = fs.readFileSync(filePath, 'utf8');
  
  const slug = file.replace('.html', '');
  const title = getTitle(html);
  let city = getCityFromFilename(file);
  
  if (!city) {
    // fallback: try to extract from breadcrumbs or hidden span
    const spanMatch = html.match(/<span id="currentCity"[^>]*>([^<]*)<\/span>/i);
    if (spanMatch) city = spanMatch[1].trim();
  }
  
  if (!title || !city) {
    console.warn(`⚠️ Skipping ${file} – missing title or city`);
    continue;
  }
  
  const image = getImage(html) || 'https://fineescorts.co.ke/images/default-blog.jpg';
  const date = getDate(html) || '2025-01-01';
  
  posts.push({
    title,
    slug,
    city,
    date,
    image
  });
}

// Sort by date descending
posts.sort((a, b) => new Date(b.date) - new Date(a.date));

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(posts, null, 2));
console.log(`✅ Generated ${posts.length} blog posts in ${OUTPUT_FILE}`);
