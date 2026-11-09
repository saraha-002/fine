// update-admin-password.js
// Reads ADMIN_EMAIL + ADMIN_PASSWORD from .env and syncs the hash in MongoDB.
require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

(async () => {
  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const mongoUrl = process.env.MONGO_URL;

  if (!email || !password || !mongoUrl) {
    console.error('❌ ADMIN_EMAIL, ADMIN_PASSWORD, or MONGO_URL missing from .env');
    process.exit(1);
  }

  const client = new MongoClient(mongoUrl);
  await client.connect();
  const usersCol = client.db('fineescorts').collection('users');

  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await usersCol.updateOne(
    { email: email.toLowerCase().trim() },
    { $set: { password: hashedPassword, role: 'admin' } }
  );

  if (result.matchedCount === 0) {
    console.log(`❌ No user with email: ${email}`);
    console.log('   Server bootstrap will create one on next start.');
  } else if (result.modifiedCount === 0) {
    console.log(`ℹ️  Password unchanged for: ${email}`);
  } else {
    console.log(`✅ Updated password for: ${email}`);
  }

  await client.close();
})();