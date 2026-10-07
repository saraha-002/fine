// make-admin.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

(async () => {
  const email = process.argv[2];
  if (!email) { console.error('Usage: node make-admin.js <email>'); process.exit(1); }

  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  const usersCol = client.db('fineescorts').collection('users');

  const result = await usersCol.updateOne(
    { email: email.toLowerCase().trim() },
    { $set: { role: 'admin' } }
  );

  if (result.matchedCount === 0) console.log(`❌ No user found: ${email}`);
  else if (result.modifiedCount === 0) console.log(`ℹ️  Already admin: ${email}`);
  else console.log(`✅ Promoted ${email} to admin`);

  await client.close();
})();