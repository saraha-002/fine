const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Get filename from command line argument
const args = process.argv.slice(2);
const URLS_FILE = args[0] || 'urls.txt';

console.log(`🔍 Looking for file: ${URLS_FILE}`);

if (!fs.existsSync(URLS_FILE)) {
  console.error(`❌ File not found: ${URLS_FILE}`);
  console.log('Usage: node indexing.js <filename.txt>');
  process.exit(1);
}

// Read the raw content
const rawContent = fs.readFileSync(URLS_FILE, 'utf8');
console.log(`📄 Raw file length: ${rawContent.length} characters`);
console.log(`📄 First 100 chars: ${rawContent.substring(0, 100)}`);

// Split and filter
const lines = rawContent.split('\n');
console.log(`📄 Total lines read: ${lines.length}`);

const urls = lines
  .map(line => line.trim())
  .filter(line => line.length > 0 && line.startsWith('http'));

console.log(`📄 Valid URLs found: ${urls.length}`);

if (urls.length === 0) {
  console.log(`⚠️ No valid URLs found. First few lines (raw):`);
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    console.log(`   Line ${i+1}: "${lines[i]}"`);
  }
  process.exit(0);
}

// Load service account credentials
const KEY_FILE = 'service-account-key.json';
if (!fs.existsSync(KEY_FILE)) {
  console.error(`❌ Service account key not found: ${KEY_FILE}`);
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  keyFile: KEY_FILE,
  scopes: ['https://www.googleapis.com/auth/indexing'],
});

const indexing = google.indexing({ version: 'v3', auth });

const DAILY_LIMIT = 200;
const toProcess = urls.slice(0, DAILY_LIMIT);
console.log(`🚀 Sending ${toProcess.length} URLs to Indexing API (daily limit: ${DAILY_LIMIT})`);

let successCount = 0;
let failCount = 0;

(async () => {
  for (let i = 0; i < toProcess.length; i++) {
    const url = toProcess[i];
    try {
      await indexing.urlNotifications.publish({
        requestBody: {
          url: url,
          type: 'URL_UPDATED',
        },
      });
      console.log(`✅ [${i+1}/${toProcess.length}] ${url}`);
      successCount++;
    } catch (err) {
      console.error(`❌ [${i+1}/${toProcess.length}] ${url} failed: ${err.message}`);
      failCount++;
      if (err.message.includes('quota') || err.message.includes('429')) {
        console.log('⚠️ Daily quota reached. Stopping.');
        break;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  console.log(`\n📊 Summary: ${successCount} succeeded, ${failCount} failed.`);
})();
