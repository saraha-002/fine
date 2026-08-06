const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, 'blog');
const BACKUP_DIR = path.join(__dirname, 'blog_backup_' + Date.now());

// Create backup
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`📁 Backup created at ${BACKUP_DIR}`);
}

const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html'));

let modifiedCount = 0;

for (const file of files) {
  const filePath = path.join(BLOG_DIR, file);
  let html = fs.readFileSync(filePath, 'utf8');

  // Backup original
  fs.copyFileSync(filePath, path.join(BACKUP_DIR, file));

  // Find the featured image closing tag
  const featuredImageRegex = /<div\s+class="blog-featured-image">[\s\S]*?<\/div>/i;
  const featuredMatch = html.match(featuredImageRegex);
  if (!featuredMatch) {
    console.log(`⚠️ No featured image div in ${file} – skipping`);
    continue;
  }

  // Find the existing relatedEscorts block (the one with id="relatedEscorts")
  const relatedEscortsRegex = /<div\s+id="relatedEscorts"\s+class="related-section">[\s\S]*?<\/div>\s*(?=<!--\s*2\. CITY CTA|<!--\s*3\. RELATED BLOGS|$)/i;
  const escortsMatch = html.match(relatedEscortsRegex);
  if (!escortsMatch) {
    console.log(`⚠️ No relatedEscorts block in ${file} – skipping`);
    continue;
  }

  // Remove the original escorts block
  let newHtml = html.replace(escortsMatch[0], '');

  // Insert it right after the featured image
  const featuredImageTag = featuredMatch[0];
  const insertionPoint = newHtml.indexOf(featuredImageTag) + featuredImageTag.length;
  newHtml = newHtml.slice(0, insertionPoint) + '\n\n' + escortsMatch[0] + '\n\n' + newHtml.slice(insertionPoint);

  // Write the modified file
  fs.writeFileSync(filePath, newHtml, 'utf8');
  modifiedCount++;
  console.log(`✅ Moved relatedEscorts in ${file}`);
}

console.log(`\n🎉 Done. Modified ${modifiedCount} files. Backup saved to ${BACKUP_DIR}`);
