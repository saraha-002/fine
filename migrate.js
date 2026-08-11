// ─── migrate.js ──────────────────────────────────────────────────────
// Run this script ONCE to convert plain-text passwords to bcrypt hashes
// Usage: node migrate.js

const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URL = process.env.MONGO_URL || 'mongodb+srv://johnrwandanembassy_db_user:GvET1EsXZEj4tjgt@cluster0.h7kww1w.mongodb.net/?appName=Cluster0';

async function migratePasswords() {
    console.log('🔍 Starting password migration...');
    
    const client = new MongoClient(MONGO_URL);
    await client.connect();
    const db = client.db('fineescorts');
    const users = db.collection('users');
    
    const allUsers = await users.find({}).toArray();
    console.log(`📊 Found ${allUsers.length} users to check`);
    
    let migratedCount = 0;
    
    for (const user of allUsers) {
        // Check if password is already hashed (starts with $2b$)
        if (!user.password.startsWith('$2b$')) {
            const hashed = await bcrypt.hash(user.password, 10);
            await users.updateOne(
                { _id: user._id },
                { $set: { password: hashed } }
            );
            console.log(`✅ Migrated user: ${user.email}`);
            migratedCount++;
        } else {
            console.log(`⏭️ Already hashed: ${user.email}`);
        }
    }
    
    console.log(`✅ Migration complete! ${migratedCount} users migrated.`);
    client.close();
}

migratePasswords().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
