// sync-static-profiles.js
// Syncs photos/description/identity fields from data/profiles.json into MongoDB.
// ONLY touches profiles whose slug exists in profiles.json. Real escorts are never touched.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

(async () => {
  const DRY_RUN = process.argv.includes('--dry-run');

  const uri = process.env.MONGO_URL;
  if (!uri) {
    console.error('❌ MONGO_URL missing from .env');
    process.exit(1);
  }

  const jsonPath = path.join(__dirname, 'data', 'profiles.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ data/profiles.json not found');
    process.exit(1);
  }

  const staticProfiles = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`📚 Loaded ${staticProfiles.length} static profiles from profiles.json`);
  if (DRY_RUN) console.log('🧪 DRY RUN — no writes will be made\n');

  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db('fineescorts').collection('profiles');
  console.log('✅ Connected to MongoDB Atlas\n');

  let updated = 0, unchanged = 0, missing = 0;

  for (const p of staticProfiles) {
    const setFields = {
      photos:      p.photos || p.images || [],
      images:      p.images || p.photos || [],
      description: p.description,
      name:        p.name,
      displayName: p.displayName || p.name,
      city:        p.city,
      location:    p.location || p.city,
      age:         p.age,
      ethnicity:   p.ethnicity,
      languages:   p.languages,
      phone:       p.phone,
      fullNumber:  p.fullNumber || p.phone
    };

    // Drop undefined fields so we don't wipe data
    Object.keys(setFields).forEach(k => {
      if (setFields[k] === undefined) delete setFields[k];
    });

    if (DRY_RUN) {
      const exists = await col.findOne({ slug: p.slug }, { projection: { _id: 1 } });
      if (!exists) { missing++; console.log(`⚠️  not in DB: ${p.slug}`); }
      else { updated++; console.log(`✏️  would update: ${p.slug}`); }
      continue;
    }

    const res = await col.updateOne(
      { slug: p.slug },
      { $set: setFields }
    );

    if (res.matchedCount === 0) { missing++; continue; }
    if (res.modifiedCount > 0)  { updated++; }
    else                        { unchanged++; }
  }

  console.log('\n──────────────────────────────────────');
  if (DRY_RUN) {
    console.log(`🧪 Would update: ${updated}`);
  } else {
    console.log(`✅ Updated:   ${updated}`);
    console.log(`➖ Unchanged: ${unchanged}`);
  }
  console.log(`⚠️  Missing (not in DB): ${missing}`);
  console.log('ℹ️  Real escorts were not touched.');
  console.log('──────────────────────────────────────');

  await client.close();
})();