const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Configuration
const URLS_FILE = process.argv[2] || 'urls.txt';
const DAILY_LIMIT = 200;
const CREDENTIALS_FILE = 'oauth-credentials.json';
const TOKEN_FILE = 'token.json';

// OAuth 2.0 setup – using your own Google account
if (!fs.existsSync(CREDENTIALS_FILE)) {
  console.error(`❌ Missing ${CREDENTIALS_FILE}. Please download OAuth credentials from Google Cloud Console.`);
  process.exit(1);
}

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE));
const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

// Load or request token
if (fs.existsSync(TOKEN_FILE)) {
  const token = JSON.parse(fs.readFileSync(TOKEN_FILE));
  oAuth2Client.setCredentials(token);
  console.log('✅ Loaded existing token');
  startIndexing();
} else {
  getAccessToken();
}

function getAccessToken() {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/indexing'],
  });
  console.log('🔐 Authorize this app by visiting this URL:\n', authUrl);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('\nEnter the code from that page: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(token));
      console.log('✅ Token stored in token.json');
      startIndexing();
    });
  });
}

async function startIndexing() {
  const indexing = google.indexing({ version: 'v3', auth: oAuth2Client });

  // Read URLs
  if (!fs.existsSync(URLS_FILE)) {
    console.error(`❌ File not found: ${URLS_FILE}`);
    process.exit(1);
  }
  const urls = fs.readFileSync(URLS_FILE, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('http'));

  console.log(`📄 Loaded ${urls.length} URLs from ${URLS_FILE}`);
  const toProcess = urls.slice(0, DAILY_LIMIT);
  console.log(`🚀 Sending ${toProcess.length} URLs to Indexing API`);

  let success = 0, fail = 0;
  for (let i = 0; i < toProcess.length; i++) {
    const url = toProcess[i];
    try {
      await indexing.urlNotifications.publish({
        requestBody: { url, type: 'URL_UPDATED' },
      });
      console.log(`✅ [${i+1}/${toProcess.length}] ${url}`);
      success++;
    } catch (err) {
      console.error(`❌ [${i+1}/${toProcess.length}] ${url}: ${err.message}`);
      fail++;
      if (err.message.includes('quota') || err.message.includes('429')) {
        console.log('⚠️ Daily quota reached. Stopping.');
        break;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`\n📊 Summary: ${success} succeeded, ${fail} failed.`);
}
