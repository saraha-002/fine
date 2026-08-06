const fs = require("fs");
const path = require("path");

const BLOG_DIR = path.join(__dirname, "blog");
const OUTPUT_JSON = path.join(__dirname, "data", "posts.json");
const OUTPUT_HTML = path.join(__dirname, "blog.html");

function getMetaContent(html, property) {
  const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match = html.match(regex);
  return match ? match[1] : '';
}

function getTitle(html) {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  if (match) return match[1].replace(/\s*\|\s*FineEscorts Kenya$/, '').trim();
  return '';
}

function getCity(html, filename) {
  const spanMatch = html.match(/<span id="currentCity"[^>]*>([^<]*)<\/span>/i);
  if (spanMatch) return spanMatch[1].trim();
  const lower = filename.toLowerCase();
  const cities = ['kitengela', 'syokimau', 'mlolongo', 'imara daima', 'athiriver'];
  for (const city of cities) {
    if (lower.includes(city)) {
      return city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }
  return 'General';
}

function getDate(html, filePath) {
  const metaDate = getMetaContent(html, 'article:published_time');
  if (metaDate) return metaDate;
  const stats = fs.statSync(filePath);
  return stats.mtime.toISOString().split('T')[0];
}

function getImage(html) {
  return getMetaContent(html, 'og:image') || '';
}

function getExcerpt(html) {
  return getMetaContent(html, 'description') || '';
}

function estimateReadTime(html) {
  const text = html.replace(/<[^>]*>/g, '');
  const wordCount = text.split(/\s+/).length;
  const minutes = Math.max(2, Math.ceil(wordCount / 200));
  return `${minutes} min read`;
}

const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html'));
const posts = [];

for (const file of files) {
  const filePath = path.join(BLOG_DIR, file);
  const html = fs.readFileSync(filePath, 'utf8');
  const slug = file.replace('.html', '');
  const title = getTitle(html);
  if (!title) continue;
  const city = getCity(html, file);
  const date = getDate(html, filePath);
  const image = getImage(html);
  const excerpt = getExcerpt(html);
  const readTime = estimateReadTime(html);
  posts.push({
    title,
    slug,
    category: city.toLowerCase(),
    date,
    image,
    excerpt: excerpt.slice(0, 160),
    readTime,
    views: 0
  });
}

posts.sort((a, b) => new Date(b.date) - new Date(a.date));

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(OUTPUT_JSON, JSON.stringify(posts, null, 2));
console.log(`✅ Generated ${posts.length} posts in ${OUTPUT_JSON}`);

// Generate blog.html with premium rentspace classes
const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
  <title>FineEscorts Kenya Blog | Premium Insights & City Guides</title>
  <meta name="description" content="Local nightlife guides, escort tips, and city insights for Kitengela, Syokimau, Mlolongo, Imara Daima & Athiriver.">
  <link rel="icon" type="image/webp" href="/fineescorts-favicon.webp">
  <link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
  <link rel="stylesheet" href="css/blog.css">
</head>
<body>

  <!-- Executive Navbar (matches rentspace classes) -->
  <nav class="exec-nav">
    <a href="index.html" class="nav-logo">Fine<span>Escorts</span> Kenya</a>
    <ul class="nav-links">
      <li><a href="index.html">Escorts</a></li>
      <li><a href="massage.html">Massage</a></li>
      <li><a href="dildos.html">Dildos</a></li>
      <li><a href="reviews.html">Reviews</a></li>
      <li><a href="blog.html" class="active">Blog</a></li>
      <li><a href="contact.html">Contact</a></li>
    </ul>
    <a href="advertise.html" class="nav-cta">Advertise</a>
    <div class="hamburger" id="hamburger">
      <span></span>
      <span></span>
      <span></span>
    </div>
  </nav>
  <div class="menu-overlay" id="menuOverlay"></div>

  <!-- Blog Header (rentspace style) -->
  <header class="blog-header">
    <div class="header-bg"></div>
    <div class="header-container">
      <div class="header-left">
        <div class="page-subtitle">EXPERT INSIGHTS</div>
        <h1 class="page-title">The <span>FineEscorts</span> Journal</h1>
      </div>
      <div class="header-right">
        <p class="page-description">
          Your guide to nightlife, discreet companionship, and local culture in Kenya's top satellite towns.
        </p>
        <div class="header-accent-line"></div>
      </div>
    </div>
  </header>

  <!-- Category Filters (based on your cities) -->
  <div class="category-filters" id="categoryFilters">
    <button class="category-btn active" data-category="all">All</button>
    <button class="category-btn" data-category="kitengela">Kitengela</button>
    <button class="category-btn" data-category="syokimau">Syokimau</button>
    <button class="category-btn" data-category="mlolongo">Mlolongo</button>
    <button class="category-btn" data-category="imara daima">Imara Daima</button>
    <button class="category-btn" data-category="athiriver">Athiriver</button>
  </div>

  <!-- Blog Layout -->
  <div class="blog-layout">
    <div>
      <div class="loading-spinner" id="loadingSpinner">
        <div class="spinner"></div>
      </div>
      <div class="blog-grid" id="blogGrid" style="display: none;"></div>
      <div class="pagination" id="pagination" style="display: none;"></div>
    </div>

    <aside class="sidebar">
      <div class="sidebar-widget">
        <h3>Search</h3>
        <input type="text" class="search-box" id="searchInput" placeholder="Search articles...">
      </div>
      <div class="sidebar-widget">
        <h3>Popular Reads</h3>
        <div id="popularPosts"></div>
      </div>
      <div class="sidebar-widget">
        <h3>Explore by Area</h3>
        <ul class="category-list" id="categoryList">
          <li><a href="#" data-category="kitengela">Kitengela <span id="kitengelaCount">0</span></a></li>
          <li><a href="#" data-category="syokimau">Syokimau <span id="syokimauCount">0</span></a></li>
          <li><a href="#" data-category="mlolongo">Mlolongo <span id="mlolongoCount">0</span></a></li>
          <li><a href="#" data-category="imara daima">Imara Daima <span id="imaraDaimaCount">0</span></a></li>
          <li><a href="#" data-category="athiriver">Athiriver <span id="athiRiverCount">0</span></a></li>
        </ul>
      </div>
    </aside>
  </div>

  <!-- Premium Footer -->
  <footer class="premium-footer">
    <div class="footer-grid">
      <div class="footer-col">
        <h4>FineEscorts Kenya</h4>
        <p>Discreet, verified companionship in Nairobi's most sought‑after areas.</p>
      </div>
      <div class="footer-col">
        <h4>Explore</h4>
        <a href="index.html">Escorts</a>
        <a href="reviews.html">Reviews</a>
        <a href="blog.html">Blog</a>
      </div>
      <div class="footer-col">
        <h4>Legal</h4>
        <a href="privacy.html">Privacy Policy</a>
        <a href="terms.html">Terms & Conditions</a>
        <a href="contact.html">Contact</a>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© <span id="year"></span> FineEscorts Kenya — All Rights Reserved</p>
      <p>Designed for discretion & elegance.</p>
    </div>
  </footer>

  <div class="mobile-bottom-nav">
    <a href="index.html"><i class="fas fa-home"></i> Home</a>
    <a href="index.html"><i class="fas fa-search"></i> Escorts</a>
    <a href="reviews.html"><i class="fas fa-star"></i> Reviews</a>
    <a href="blog.html" class="active"><i class="fas fa-newspaper"></i> Blog</a>
   
  </div>

  <script src="js/blog.js"></script>
</body>
</html>`;

fs.writeFileSync(OUTPUT_HTML, htmlTemplate);
console.log(`✅ Generated blog.html with premium rentspace styling.`);
