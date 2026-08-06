const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const FAVICON_PATH = '/fineescorts-favicon.webp';
const faviconLink = `<link rel="icon" type="image/webp" href="${FAVICON_PATH}">`;

// Folders to exclude (no need to scan node_modules, backup folders, etc.)
const EXCLUDE_DIRS = ['node_modules', 'blog_backup', 'blog_corrupted_backup', '.git', '.vscode'];

// File extensions to process
const EXT = '.html';

// Walk through all directories recursively
function getAllHtmlFiles(dir, baseDir = ROOT_DIR) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(item)) {
        results = results.concat(getAllHtmlFiles(fullPath, baseDir));
      }
    } else if (stat.isFile() && path.extname(item) === EXT) {
      results.push(fullPath);
    }
  }
  return results;
}

// Add favicon to a single HTML file
function addFaviconToFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  
  // Skip if favicon already exists (any rel="icon" that includes the word)
  if (html.includes('rel="icon"') && (html.includes('fineescorts-favicon') || html.includes('/favicon'))) {
    return false; // already has favicon
  }
  
  // Find <head> tag
  let insertPos = html.indexOf('<head>');
  if (insertPos === -1) {
    console.log(`⚠️  No <head> tag in ${path.relative(ROOT_DIR, filePath)} – skipping`);
    return false;
  }
  
  insertPos += 6; // after '<head>'
  html = html.slice(0, insertPos) + '\n  ' + faviconLink + html.slice(insertPos);
  fs.writeFileSync(filePath, html, 'utf8');
  return true;
}

// Main
console.log('🔍 Scanning for HTML files...');
const allFiles = getAllHtmlFiles(ROOT_DIR);
console.log(`Found ${allFiles.length} HTML files.\n`);

let count = 0;
for (const file of allFiles) {
  const added = addFaviconToFile(file);
  if (added) {
    console.log(`✅ Added favicon to ${path.relative(ROOT_DIR, file)}`);
    count++;
  } else {
    // Skip silent – too noisy; uncomment if you want to see skips
    // console.log(`⏭️  Already has favicon: ${path.relative(ROOT_DIR, file)}`);
  }
}

console.log(`\n🎉 Done. Favicon added to ${count} files.`);
