const fs = require('fs');
const path = require('path');

const blogDir = path.join(__dirname, 'blog');
const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.html'));

const overlayHtml = `<div id="age-verification" class="age-verify-overlay" style="display: none;">
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

const botScript = `\n<script>
  (function() {
    const ageVerify = document.getElementById('age-verification');
    if (!ageVerify) return;
    const isCrawler = /Googlebot|bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot/i.test(navigator.userAgent);
    if (isCrawler) {
      ageVerify.style.display = 'none';
      return;
    }
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

for (const file of files) {
  const filePath = path.join(blogDir, file);
  let html = fs.readFileSync(filePath, 'utf8');

  // Add overlay if missing
  if (!html.includes('id="age-verification"')) {
    html = html.replace(/<body[^>]*>/, match => match + '\n' + overlayHtml);
    console.log(`➕ Added overlay to: ${file}`);
  }

  // Ensure bot script is present (remove any old version first)
  html = html.replace(/<script[^>]*>[\s\S]*?(?:ageVerify|age-verification)[\s\S]*?<\/script>/gi, '');
  if (!html.includes(botScript)) {
    html = html.replace(/<\/body>/, botScript + '\n</body>');
    console.log(`📝 Added bot script to: ${file}`);
  }

  fs.writeFileSync(filePath, html);
}

console.log('🎉 All blog posts now have overlay + bot detection.');
