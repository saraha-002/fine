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

  // Make a backup of the original file
  fs.copyFileSync(filePath, path.join(BACKUP_DIR, file));

  // Find the featured image closing tag (or the element itself)
  // We'll place the escorts section right after </div> of .blog-featured-image
  const featuredImageRegex = /(<div\s+class="blog-featured-image">[\s\S]*?<\/div>)/i;
  const featuredMatch = html.match(featuredImageRegex);

  if (!featuredMatch) {
    console.log(`⚠️ No featured image div found in ${file} – skipping`);
    continue;
  }

  // Find the existing related-escorts section (if any)
  const escortsSectionRegex = /<section\s+class="related-escorts">[\s\S]*?<\/section>/i;
  const escortsMatch = html.match(escortsSectionRegex);

  if (!escortsMatch) {
    console.log(`⚠️ No related-escorts section found in ${file} – skipping`);
    continue;
  }

  // Remove the original escorts section from wherever it is
  let newHtml = html.replace(escortsSectionRegex, '');

  // Insert it right after the featured image div
  const featuredImageTag = featuredMatch[0];
  const insertionPoint = newHtml.indexOf(featuredImageTag) + featuredImageTag.length;
  newHtml = newHtml.slice(0, insertionPoint) + '\n\n' + escortsMatch[0] + '\n\n' + newHtml.slice(insertionPoint);

  // Write the modified file
  fs.writeFileSync(filePath, newHtml, 'utf8');
  modifiedCount++;
  console.log(`✅ Moved escorts section in ${file}`);
}

console.log(`\n🎉 Done. Modified ${modifiedCount} files. Backup saved to ${BACKUP_DIR}`);
