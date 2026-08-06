const fs = require('fs');
const path = require('path');

const RECAPTCHA_SCRIPT = '<script src="https://www.google.com/recaptcha/api.js?render=6LcKDGEtAAAAAJKAWjXB7j5bSIPvzz94wBWapTD5"></script>';

// Walk through all directories recursively
function walkDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (file.endsWith('.html')) {
      fileList.push(fullPath);
    }
  });
  return fileList;
}

function addRecaptchaToFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Check if the script is already present (simple check)
  if (content.includes('reCAPTCHA')) {
    console.log(`✅ Already has reCAPTCHA: ${filePath}`);
    return;
  }

  // Insert the script before </head>
  const headCloseIndex = content.lastIndexOf('</head>');
  if (headCloseIndex === -1) {
    console.warn(`⚠️ No </head> tag found in ${filePath} – skipping.`);
    return;
  }

  const newContent = content.slice(0, headCloseIndex) + 
                     RECAPTCHA_SCRIPT + '\n' +
                     content.slice(headCloseIndex);
  
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log(`✅ Added reCAPTCHA to: ${filePath}`);
}

// Start from current directory (or you can pass a custom path)
const startDir = process.argv[2] || '.';
console.log(`Scanning HTML files in: ${startDir}`);

const htmlFiles = walkDir(startDir);
console.log(`Found ${htmlFiles.length} HTML files.`);

htmlFiles.forEach(file => addRecaptchaToFile(file));

console.log('🎉 Done!');