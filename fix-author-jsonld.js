const fs = require('fs');
const path = require('path');

const PROFILES_DIR = path.join(__dirname, 'profiles');
const BACKUP_DIR = path.join(__dirname, 'profiles_backup_' + Date.now());

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`📁 Backup created at ${BACKUP_DIR}`);
}

const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.html'));

let modifiedCount = 0;

for (const file of files) {
  const filePath = path.join(PROFILES_DIR, file);
  let html = fs.readFileSync(filePath, 'utf8');

  // Backup original
  fs.copyFileSync(filePath, path.join(BACKUP_DIR, file));

  // Find the JSON-LD script block
  const scriptRegex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i;
  const match = html.match(scriptRegex);

  if (!match) {
    console.log(`⚠️ No JSON-LD found in ${file} – skipping`);
    continue;
  }

  const originalJson = match[1].trim();
  let jsonData;

  try {
    jsonData = JSON.parse(originalJson);
  } catch (e) {
    console.log(`❌ Invalid JSON in ${file} – skipping`);
    continue;
  }

  // jsonData is an array: [ProfilePage, FAQPage]
  if (!Array.isArray(jsonData) || jsonData.length < 1) {
    console.log(`⚠️ Unexpected JSON structure in ${file} – skipping`);
    continue;
  }

  const profilePage = jsonData[0];
  const person = profilePage.mainEntity;

  if (!person || !person.review || !Array.isArray(person.review)) {
    console.log(`ℹ️ No reviews in ${file} – skipping`);
    continue;
  }

  let changed = false;

  // Fix each review author
  for (const review of person.review) {
    if (review.author && typeof review.author === 'string') {
      review.author = {
        "@type": "Person",
        "name": review.author
      };
      changed = true;
    }
    // If author is already an object, leave it (no double-wrapping)
  }

  if (!changed) {
    console.log(`✅ ${file} – author already correct, skipping`);
    continue;
  }

  // Stringify with indentation (2 spaces) to match original style
  const newJson = JSON.stringify(jsonData, null, 2);

  // Replace the script content
  const newScript = `<script type="application/ld+json">\n${newJson}\n</script>`;
  html = html.replace(scriptRegex, newScript);

  fs.writeFileSync(filePath, html, 'utf8');
  modifiedCount++;
  console.log(`✅ Fixed ${file}`);
}

console.log(`\n🎉 Done. Modified ${modifiedCount} files. Backup saved to ${BACKUP_DIR}`);
