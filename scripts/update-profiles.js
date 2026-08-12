// ─── scripts/update-profiles.js ──────────────────────────────────────
// Run this script ONCE to mark all profiles as approved
// Usage: node scripts/update-profiles.js

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URL = process.env.MONGO_URL || 'mongodb+srv://johnrwandanembassy_db_user:GvET1EsXZEj4tjgt@cluster0.h7kww1w.mongodb.net/?appName=Cluster0&tlsAllowInvalidCertificates=true';
const DB_NAME = 'fineescorts';

async function updateProfiles() {
    console.log('🚀 Connecting to MongoDB...');
    
    const client = new MongoClient(MONGO_URL);
    
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB Atlas!');
        
        const db = client.db(DB_NAME);
        const profiles = db.collection('profiles');
        
        // Count total profiles
        const total = await profiles.countDocuments();
        console.log(`📊 Found ${total} profiles in database`);
        
        // Update ALL profiles to approved
        const result = await profiles.updateMany(
            {}, // Match all documents
            { 
                $set: { 
                    isApproved: true, 
                    status: 'approved' 
                } 
            }
        );
        
        console.log(`✅ Updated ${result.modifiedCount} profiles to APPROVED`);
        console.log(`✅ ${result.upsertedCount} new documents inserted`);
        
        // Verify the update
        const approvedCount = await profiles.countDocuments({ isApproved: true });
        console.log(`📊 Now have ${approvedCount} approved profiles`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
        console.log('🔒 MongoDB connection closed');
    }
}

updateProfiles();