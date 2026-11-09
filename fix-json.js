const fs = require('fs');
const path = 'data/profiles.json';

let content = fs.readFileSync(path, 'utf8');

try {
    JSON.parse(content);
    console.log('✅ JSON already valid — nothing to do');
    process.exit(0);
} catch (e) {
    console.log('❌ JSON invalid:', e.message);
    console.log('   Scanning for trailing commas...\n');
}

function fixTrailingCommas(text) {
    let result = '';
    let inString = false;
    let escaped = false;
    let i = 0;
    let fixes = 0;
    let fixLocations = [];

    while (i < text.length) {
        const ch = text[i];

        if (inString) {
            result += ch;
            if (escaped) { escaped = false; }
            else if (ch === '\\') { escaped = true; }
            else if (ch === '"') { inString = false; }
            i++;
            continue;
        }

        if (ch === '"') {
            inString = true;
            result += ch;
            i++;
            continue;
        }

        if (ch === ',') {
            let j = i + 1;
            while (j < text.length && /\s/.test(text[j])) j++;
            if (j < text.length && (text[j] === ']' || text[j] === '}')) {
                const lineNum = result.split('\n').length;
                fixLocations.push(lineNum);
                fixes++;
                i++;
                continue;
            }
        }

        result += ch;
        i++;
    }

    return { text: result, fixes, fixLocations };
}

const { text: fixed, fixes, fixLocations } = fixTrailingCommas(content);

if (fixes === 0) {
    console.log('⚠️  No trailing commas found.');
    console.log('   The error is something else. Open data/profiles.json in VS Code');
    console.log('   and look for the red squiggly. Check for missing commas BETWEEN items,');
    console.log('   unclosed strings, or unescaped quotes.');
    process.exit(1);
}

console.log(`Found ${fixes} trailing comma(s) at lines:`);
console.log('  ' + fixLocations.join(', '));

try {
    JSON.parse(fixed);
    fs.writeFileSync(path, fixed);
    console.log(`\n✅ Fixed ${fixes} comma(s). JSON is now valid.`);
} catch (e) {
    console.log(`\n❌ Still invalid after removing commas: ${e.message}`);
    console.log('   There is another syntax error. Open the file in VS Code.');
    fs.writeFileSync(path + '.fixed', fixed);
    console.log(`   Partial fix saved to ${path}.fixed — compare with original.`);
    process.exit(1);
}