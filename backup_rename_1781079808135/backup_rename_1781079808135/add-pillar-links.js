const fs = require('fs');
const path = require('path');

const blogDir = path.join(__dirname, 'blog');
const cityMapping = {
  kitengela: 'kitengela-ultimate-guide.html',
  syokimau: 'syokimau-ultimate-guide.html',
  mlolongo: 'mlolongo-ultimate-guide.html',
  'athi-river': 'athiriver-ultimate-guide.html',
  'imara-daima': 'imara-daima-ultimate-guide.html'
};

// Helper to detect city from filename
function detectCity(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('kitengela')) return 'kitengela';
  if (lower.includes('syokimau')) return 'syokimau';
  if (lower.includes('mlolongo')) return 'mlolongo';
  if (lower.includes('athi-river') || lower.includes('athiriver')) return 'athi-river';
  if (lower.includes('imara-daima') || lower.includes('imara-daima')) return 'imara-daima';
  return null;
}

// Generate the link HTML
function generateLinkHTML(city, pillarFile) {
  const cityName = city.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return `<div class="pillar-link-notice" style="background:#1a1a1a; padding:0.8rem; border-radius:12px; margin-bottom:1.5rem; border-left:4px solid #c9a45c;">
    <i class="fas fa-map-marked-alt"></i> <strong>Complete Guide:</strong> For everything on nightlife, safety, and accommodation, see our <a href="../${pillarFile}" style="color:#c9a45c; text-decoration:underline;">Ultimate ${cityName} Guide</a>.
  </div>`;
}

// Process each HTML file in blog folder
fs.readdir(blogDir, (err, files) => {
  if (err) return console.error('Error reading blog directory:', err);

  files.forEach(file => {
    if (!file.endsWith('.html')) return;

    const filePath = path.join(blogDir, file);
    const cityKey = detectCity(file);
    if (!cityKey) {
      console.log(`Skipping ${file}: no city detected`);
      return;
    }

    const pillarFile = cityMapping[cityKey];
    const linkHTML = generateLinkHTML(cityKey, pillarFile);

    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) return console.error(`Error reading ${file}:`, err);

      // Check if the link already exists (to avoid duplicates)
      if (data.includes('pillar-link-notice')) {
        console.log(`Skipping ${file}: already has pillar link`);
        return;
      }

      // Insert the link right after the opening <div class="blog-content"> tag
      const insertAfter = '<div class="blog-content">';
      const newData = data.replace(insertAfter, insertAfter + '\n' + linkHTML);

      if (newData !== data) {
        fs.writeFile(filePath, newData, 'utf8', err => {
          if (err) console.error(`Error writing ${file}:`, err);
          else console.log(`✅ Updated ${file}`);
        });
      } else {
        console.log(`⚠️ Could not find .blog-content div in ${file}`);
      }
    });
  });
});
