const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

// Folders to exclude
const excludeDirs = [
  'node_modules',
  '.git',
  '.vscode',
  'blog_backup',
  'backup_before_favicon',
  'profiles',     // we'll update profiles.json, but not the generated HTML files? Actually we should update generated profile HTML too.
  // We'll process all .html files anyway, so no need to exclude profiles folder
];

// File extensions to process
const extensions = ['.html', '.js', '.json', '.txt', '.css', '.md'];

// Backup all modified files
const backupDir = path.join(rootDir, 'backup_rename_' + Date.now());
fs.mkdirSync(backupDir, { recursive: true });
console.log(`📁 Backup directory: ${backupDir}`);

// Helper to walk directory
function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!excludeDirs.some(ex => fullPath.includes(ex))) {
        walkDir(fullPath, callback);
      }
    } else if (extensions.includes(path.extname(fullPath))) {
      callback(fullPath);
    }
  }
}

let fileCount = 0;
let replaceCount = 0;

// Replacements
const replacements = [
  // File name in links
  { from: /athi-river-escorts\.html/g, to: 'athiriver-escorts.html' },
  // Slug in URLs (e.g., /blog/athi-river-...)
  { from: /athi-river/g, to: 'athiriver' },
  // Capitalised city name in text (optional – careful not to break titles)
  { from: /Athi River/g, to: 'Athiriver' },
  // Lowercase in text
  { from: /athi river/g, to: 'athiriver' },
];

walkDir(rootDir, (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;
  let changed = false;

  for (const rep of replacements) {
    if (rep.from.test(newContent)) {
      newContent = newContent.replace(rep.from, rep.to);
      changed = true;
    }
  }

  if (changed) {
    // Backup original
    const relPath = path.relative(rootDir, filePath);
    const backupPath = path.join(backupDir, relPath);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, content, 'utf8');
    // Write new content
    fs.writeFileSync(filePath, newContent, 'utf8');
    fileCount++;
    replaceCount++;
    console.log(`✅ Updated: ${relPath}`);
  }
});

// Rename the actual file athi-river-escorts.html → athiriver-escorts.html if it exists
const oldFile = path.join(rootDir, 'athi-river-escorts.html');
const newFile = path.join(rootDir, 'athiriver-escorts.html');
if (fs.existsSync(oldFile)) {
  fs.renameSync(oldFile, newFile);
  console.log(`📄 Renamed file: athi-river-escorts.html → athiriver-escorts.html`);
} else {
  console.log(`ℹ️ File athi-river-escorts.html not found – skipping rename.`);
}

console.log(`\n🎉 Done. Modified ${fileCount} files. Backup saved to ${backupDir}`);
console.log(`   Total replacements: ${replaceCount}`);
