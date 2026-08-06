const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, 'blog');
const BACKUP_DIR = path.join(__dirname, 'blog_backup_' + Date.now());

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`📁 Backup created at ${BACKUP_DIR}`);
}

const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html'));

function findMatchingCloseDiv(html, startIndex) {
  let count = 1;
  let i = startIndex;
  while (i < html.length && count > 0) {
    if (html[i] === '<' && html.substring(i, i + 4) === '<div') {
      count++;
      i += 4;
    } else if (html[i] === '<' && html.substring(i, i + 6) === '</div>') {
      count--;
      i += 6;
    } else {
      i++;
    }
  }
  return i;
}

let modifiedCount = 0;

for (const file of files) {
  const filePath = path.join(BLOG_DIR, file);
  let html = fs.readFileSync(filePath, 'utf8');

  // Backup
  fs.copyFileSync(filePath, path.join(BACKUP_DIR, file));

  // Find the featured image closing tag
  const featuredImageRegex = /<div\s+class="blog-featured-image">[\s\S]*?<\/div>/i;
  const featuredMatch = html.match(featuredImageRegex);
  if (!featuredMatch) {
    console.log(`⚠️ No featured image in ${file}`);
    continue;
  }

  // Find the start of the relatedEscorts block
  const startMatch = html.match(/<div\s+id="relatedEscorts"\s+class="related-section">/i);
  if (!startMatch) {
    console.log(`⚠️ No relatedEscorts block in ${file}`);
    continue;
  }

  const startIndex = startMatch.index;
  const closeIndex = findMatchingCloseDiv(html, startIndex + startMatch[0].length);
  const escortsBlock = html.substring(startIndex, closeIndex);

  // Remove the original block
  let newHtml = html.substring(0, startIndex) + html.substring(closeIndex);

  // Insert it right after the featured image
  const featuredImageTag = featuredMatch[0];
  const insertionPoint = newHtml.indexOf(featuredImageTag) + featuredImageTag.length;
  newHtml = newHtml.slice(0, insertionPoint) + '\n\n' + escortsBlock + '\n\n' + newHtml.slice(insertionPoint);

  fs.writeFileSync(filePath, newHtml, 'utf8');
  modifiedCount++;
  console.log(`✅ Moved relatedEscorts in ${file}`);
}

console.log(`\n🎉 Done. Modified ${modifiedCount} files. Backup saved to ${BACKUP_DIR}`);
