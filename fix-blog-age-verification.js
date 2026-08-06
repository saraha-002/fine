const fs = require('fs');
const path = require('path');

const blogDir = path.join(__dirname, 'blog');
const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.html'));

// The corrected overlay div (with inline style display: none)
const correctedOverlay = `  <!-- 18+ Age Verification (crawl‑friendly: hidden by default, shown via JS) -->
  <div id="age-verification" class="age-verify-overlay" style="display: none;">
    <div class="age-verify-modal">
      <div class="logo">Fine<span>Escorts</span> Kenya</div>
      <h2>You must be 18 or older to enter.</h2>
      <p>This website contains adult content. Please confirm your age.</p>
      <div class="age-verify-buttons">
        <button id="age-enter" class="btn-primary">I am 18 or older – Enter</button>
        <a href="https://www.google.com" class="btn-secondary">Exit</a>
      </div>
    </div>
  </div>`;

// The corrected age verification script (with bot detection)
const correctedScript = `<script>
  (function() {
    const ageVerify = document.getElementById('age-verification');
    if (!ageVerify) return;

    // Detect Googlebot and other major crawlers
    const isCrawler = /Googlebot|bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot/i.test(navigator.userAgent);

    // If crawler, never show overlay – allow full access
    if (isCrawler) {
      ageVerify.style.display = 'none';
      return;
    }

    // For real humans: show overlay if not verified
    if (sessionStorage.getItem('ageVerified') !== 'true') {
      ageVerify.style.display = 'flex';
      const enterBtn = document.getElementById('age-enter');
      if (enterBtn) {
        enterBtn.addEventListener('click', function() {
          sessionStorage.setItem('ageVerified', 'true');
          ageVerify.style.display = 'none';
        });
      }
    } else {
      ageVerify.style.display = 'none';
    }
  })();
</script>`;

files.forEach(file => {
  const filePath = path.join(blogDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace the overlay div if it exists (with any inline style)
  // Look for <div id="age-verification" ...> and replace until the closing </div>
  const overlayRegex = /<div id="age-verification"[^>]*>[\s\S]*?<\/div>\s*(?=<header|<\!-- Header|<\s*header)/i;
  if (overlayRegex.test(content)) {
    content = content.replace(overlayRegex, correctedOverlay);
    console.log(`✅ Replaced overlay in ${file}`);
  } else {
    console.log(`⚠️ No age-verification div found in ${file}, skipping overlay replacement.`);
  }

  // Replace the old age verification script (if present)
  // Look for any script that contains 'age-verification' or 'ageVerified'
  const scriptRegex = /<script>[\s\S]*?age-verification[\s\S]*?<\/script>/i;
  if (scriptRegex.test(content)) {
    content = content.replace(scriptRegex, correctedScript);
    console.log(`✅ Replaced script in ${file}`);
  } else {
    // If no script found, insert before closing </body>
    if (content.includes('</body>')) {
      content = content.replace('</body>', correctedScript + '\n</body>');
      console.log(`✅ Inserted script in ${file} (no existing script found)`);
    } else {
      console.log(`❌ Could not find </body> in ${file}`);
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
});

console.log('🎉 Done processing all blog files.');
