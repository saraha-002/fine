// diagnose-images.js — checks photo coverage in MongoDB vs profiles.json
require('dotenv').config();
const fs = require('fs');
const { MongoClient } = require('mongodb');

(async () => {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  const col = client.db('fineescorts').collection('profiles');

  // ─── DB stats ──────────────────────────────────────────────
  const total = await col.countDocuments();
  const withPhotos = await col.countDocuments({ 'photos.0': { $exists: true } });
  const withImages = await col.countDocuments({ 'images.0': { $exists: true } });
  const withEither = await col.countDocuments({
    $or: [
      { 'photos.0': { $exists: true } },
      { 'images.0': { $exists: true } }
    ]
  });

  console.log('══════ DB COVERAGE ══════');
  console.log('Total profiles:              ', total);
  console.log('Have photos[0]:              ', withPhotos);
  console.log('Have images[0]:              ', withImages);
  console.log('Have either (renders image): ', withEither);
  console.log('MISSING all images:          ', total - withEither);
  console.log('');

  // ─── List profiles with NO images ─────────────────────────
  const noImage = await col.find(
    {
      $and: [
        { 'photos.0': { $exists: false } },
        { 'images.0': { $exists: false } }
      ]
    },
    { projection: { slug: 1, displayName: 1, name: 1, city: 1, location: 1 } }
  ).toArray();

  if (noImage.length > 0) {
    console.log('══════ PROFILES WITH NO IMAGES ══════');
    noImage.forEach((p, i) => {
      console.log(`${i + 1}. ${p.slug} | ${p.displayName || p.name} | ${p.city || p.location}`);
    });
    console.log('');
  } else {
    console.log('✅ Every profile in DB has at least one image URL\n');
  }

  // ─── Compare DB vs profiles.json ──────────────────────────
  const json = JSON.parse(fs.readFileSync('data/profiles.json', 'utf8'));
  const jsonNoImages = json.filter(p => {
    const ph = Array.isArray(p.photos) ? p.photos.filter(Boolean) : [];
    const im = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
    return ph.length === 0 && im.length === 0;
  });

  console.log('══════ JSON COVERAGE ══════');
  console.log('Total profiles in JSON:      ', json.length);
  console.log('MISSING all images in JSON:  ', jsonNoImages.length);

  if (jsonNoImages.length > 0) {
    console.log('\nProfiles missing images in JSON:');
    jsonNoImages.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.slug} | ${p.displayName || p.name}`);
    });
  }

  // ─── Cross-check: JSON has images but DB doesn't ──────────
  const jsonSlugsWithImages = new Set(
    json.filter(p => {
      const ph = Array.isArray(p.photos) ? p.photos.filter(Boolean) : [];
      const im = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
      return ph.length > 0 || im.length > 0;
    }).map(p => p.slug)
  );

  const dbSlugsWithImages = new Set(
    (await col.find(
      {
        $or: [
          { 'photos.0': { $exists: true } },
          { 'images.0': { $exists: true } }
        ]
      },
      { projection: { slug: 1 } }
    ).toArray()).map(p => p.slug)
  );

  const inJsonButNotDb = [...jsonSlugsWithImages].filter(s => !dbSlugsWithImages.has(s));

  console.log('\n══════ MISMATCH: JSON HAS IMAGES BUT DB DOESN\'T ══════');
  if (inJsonButNotDb.length === 0) {
    console.log('✅ DB is in sync with JSON for all profiles with images');
  } else {
    console.log(`❌ ${inJsonButNotDb.length} profiles out of sync:`);
    inJsonButNotDb.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    console.log('\n→ Fix: run `node sync-static-profiles.js`');
  }

  await client.close();
})();