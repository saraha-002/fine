const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, 'blog');
const FAVICON_PATH = '/fineescorts-favicon.webp'; // absolute path from site root

// Get all HTML files in blog directory
const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html'));

// The favicon link to insert
const faviconLink = `<link rel="icon" type="image/webp" href="${FAVICON_PATH}">`;

let count = 0;

for (const file of files) {
  const filePath = path.join(BLOG_DIR, file);
  let html = fs.readFileSync(filePath, 'utf8');

  // Skip if favicon already exists
  if (html.includes('rel="icon"') && html.includes('fineescorts-favicon')) {
    console.log(`⏭️  Already has favicon: ${file}`);
    continue;
  }

  // Insert favicon link inside <head> after <meta charset> or at the beginning
  // Find position to insert (after <head> or after first meta)
  let insertPos = html.indexOf('<head>');
  if (insertPos === -1) {
    console.log(`⚠️  No <head> tag in ${file} – skipping`);
    continue;
  }
  insertPos += 6; // after '<head>'
  
  // Add a newline then the favicon link
  html = html.slice(0, insertPos) + '\n  ' + faviconLink + html.slice(insertPos);
  
  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`✅ Added favicon to ${file}`);
  count++;
}

console.log(`\n🎉 Done. Favicon added to ${count} blog files.`);
