// ─── Fetch polyfill for older Node versions ──────────────────────
if (!global.fetch) {
    const fetch = require('node-fetch');
    global.fetch = fetch;
}

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');

// ─── Load Environment Variables ──────────────────────────────────
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('.'));

// ─── MongoDB Connection ──────────────────────────────────────────
const MONGO_URL = process.env.MONGO_URL;
let db = null;
let client = null;

async function connectDB() {
    try {
        if (!MONGO_URL) {
            console.error('❌ MONGO_URL environment variable is not set!');
            console.log('📁 Falling back to file-based storage...');
            return false;
        }
        client = new MongoClient(MONGO_URL);
        await client.connect();
        db = client.db('fineescorts');
        console.log('✅ Connected to MongoDB Atlas successfully!');

        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);

        if (!collectionNames.includes('users')) {
            await db.createCollection('users');
            console.log('📁 Created "users" collection');
        }
        if (!collectionNames.includes('profiles')) {
            await db.createCollection('profiles');
            console.log('📁 Created "profiles" collection');
        }
        if (!collectionNames.includes('subscriptions')) {
            await db.createCollection('subscriptions');
            console.log('📁 Created "subscriptions" collection');
        }
        if (!collectionNames.includes('reviews')) {
            await db.createCollection('reviews');
            console.log('📁 Created "reviews" collection');
        }

        await migrateProfiles();
        return true;
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        console.log('📁 Falling back to file-based storage...');
        return false;
    }
}

// ─── Migration: Seed profiles from profiles.json ──────────────────
async function migrateProfiles() {
    try {
        const profilesCollection = db.collection('profiles');
        const count = await profilesCollection.countDocuments();
        if (count === 0) {
            console.log('📁 Seeding profiles from profiles.json...');
            const jsonPath = path.join(__dirname, 'data', 'profiles.json');
            if (fs.existsSync(jsonPath)) {
                const profiles = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                if (profiles.length > 0) {
                    const result = await profilesCollection.insertMany(profiles);
                    console.log(`✅ Seeded ${result.insertedCount} profiles from profiles.json`);
                }
            } else {
                console.warn('⚠️ profiles.json not found, skipping seed');
            }
        } else {
            console.log(`✅ Already have ${count} profiles in database`);
        }
    } catch (err) {
        console.error('⚠️ Migration error:', err.message);
    }
}

// ─── reCAPTCHA Verification ────────────────────────────────────────
async function verifyRecaptcha(token) {
    if (!token) return false;
    try {
        const secret = process.env.RECAPTCHA_SECRET_KEY || '6LcKDGEtAAAAAIcEmbFQqPmxoOLrK51_AdD2dqen';
        const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${secret}&response=${token}`
        });
        const data = await response.json();
        console.log('🔍 reCAPTCHA full response:', JSON.stringify(data, null, 2));
        if (data.success === true) {
            console.log('✅ reCAPTCHA verification PASSED');
        } else {
            console.log('❌ reCAPTCHA verification FAILED:', data['error-codes'] || 'No error codes');
        }
        return data.success === true;
    } catch (error) {
        console.error('reCAPTCHA error:', error);
        return false;
    }
}

// ─── Database Helpers ─────────────────────────────────────────────
function getCollection(name) {
    if (db) {
        return db.collection(name);
    }
    return null;
}

// ─── File-Based Fallback ──────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file, defaultVal = []) {
    try {
        const filePath = path.join(DATA_DIR, file);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        return defaultVal;
    } catch (e) {
        console.warn(`⚠️ Error reading ${file}:`, e.message);
        return defaultVal;
    }
}

function writeJSON(file, data) {
    try {
        fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`❌ Error writing ${file}:`, e.message);
    }
}

// ─── Helper Functions ─────────────────────────────────────────────
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
}

function sanitizeName(name) {
    if (!name) return '';
    return name.replace(/[\u{1F600}-\u{1F64F}]/gu, '').replace(/[^\w\s\-']/g, '').trim();
}

function formatWhatsAppNumber(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.substring(1);
    }
    if (!cleaned.startsWith('254')) {
        cleaned = '254' + cleaned;
    }
    return cleaned;
}

function seededHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function render(template, context) {
    let result = template;
    for (const [key, value] of Object.entries(context)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value !== undefined ? value : '');
    }
    return result;
}

// ─── City Landmarks ────────────────────────────────────────────────
const cityLandmarksList = {
    "Kitengela": [
        "near Yukos, Milimani, Acacia, and along Namanga Road",
        "close to Acacia Premier Hotel",
        "off Namanga Road near Gateway Mall",
        "within reach of Kitengela town centre",
        "convenient for travelers on Mombasa Road"
    ],
    "Syokimau": [
        "near Kings Gate Estate, Syokimau Railway Station, and the Expressway",
        "close to the Expressway and JKIA",
        "off Mombasa Road near SGR station",
        "within easy reach of Gateway Mall"
    ],
    "Mlolongo": [
        "close to Mlolongo town centre and the Jomo Kenyatta International Airport",
        "near JKIA and the Expressway",
        "along Mombasa Road near the airport"
    ],
    "Imara Daima": [
        "in the Imara Daima estate, near Signature Mall and T-Mall",
        "off Mombasa Road near the Eastern Bypass",
        "close to major hotels and the SGR"
    ],
    "Athiriver": [
        "along Mombasa Road, near Athiriver town and the Industrial Area",
        "close to the Athiriver township",
        "near the junction of Mombasa Road and the Eastern Bypass"
    ]
};
const defaultLandmark = "in secure, central locations";

// ─── Service Clusters ──────────────────────────────────────────────
const serviceClusters = {
    luxury: ["Fine Dining Companion", "Executive Social Events", "Weekend Retreats", "Luxury Travel Companion", "VIP Evenings"],
    relaxed: ["Casual Meetups", "Friendly Company", "Lounge Dates", "Conversation & Coffee", "Private Evenings"],
    massage: ["Sensual Massage", "Relaxation Sessions", "Couples Massage", "Bodywork & Touch", "Stress Relief"],
    travel: ["Airport Meetups", "Weekend Travel", "Hotel Visits", "Business Trip Companion", "Overnight Stays"],
    social: ["Dinner Dates", "Party Companion", "Event Attendance", "Social Outings", "Club Nights"]
};

function getServiceCluster(profile) {
    const hash = seededHash(profile.slug || 'default');
    const clusterNames = Object.keys(serviceClusters);
    const cluster = clusterNames[hash % clusterNames.length];
    const services = serviceClusters[cluster];
    const shuffled = [...services];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (hash + i) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 4).map(s => `<span class="service">${escapeHtml(s)}</span>`).join('');
}

// ─── FAQ Pools ─────────────────────────────────────────────────────
const faqPools = [
    [
        { q: "Is {{name}} a verified escort in {{city}}?", a: "Yes, {{name}} has completed our identity verification process and is a verified companion in {{city}}." },
        { q: "Where in {{city}} is {{name}} available?", a: "{{name}} is available for incalls in secure, upscale locations within {{city}} and nearby areas. Outcalls to reputable hotels in {{city}} are also welcome." },
        { q: "Does {{name}} offer overnight or travel companionship?", a: "{{name}} offers overnight stays and can accompany you on weekend getaways around {{city}} or Nairobi." },
        { q: "How does the verification and payment work?", a: "You pay a small verification fee of 50 KES via M-Pesa. Once confirmed, you instantly receive {{name}}'s full phone number." }
    ],
    [
        { q: "Is my privacy guaranteed when booking {{name}}?", a: "Absolutely. Discretion is {{name}}'s top priority. All communications are confidential." },
        { q: "Can I request a specific meetup location in {{city}}?", a: "Yes, outcalls to reputable hotels in {{city}} are welcome." },
        { q: "What is {{name}}'s cancellation policy?", a: "Please give at least 2 hours' notice if you need to cancel or reschedule." },
        { q: "Do I need to pay a deposit?", a: "No, only the one-time 50 KES verification fee via M-Pesa is required." }
    ],
    [
        { q: "Is {{name}} available for upscale events in {{city}}?", a: "Yes, {{name}} is well-suited for luxury dinners, social events, and weekend retreats." },
        { q: "What kind of experiences does {{name}} specialise in?", a: "Luxury companionship, fine dining, travel, and private evenings." },
        { q: "Does {{name}} offer VIP packages?", a: "Please inquire during booking for exclusive arrangements." },
        { q: "How can I be sure {{name}} is genuine?", a: "{{name}} is fully verified through our ID and photo verification process." }
    ],
    [
        { q: "Is {{name}} available for travel outside {{city}}?", a: "Yes, {{name}} can accompany you on weekend getaways to Nairobi or other nearby destinations." },
        { q: "What are the travel conditions?", a: "All travel expenses (transport, accommodation) are covered by the client." },
        { q: "Does {{name}} offer overnight stays?", a: "Absolutely, overnight and extended dates are available upon request." },
        { q: "How to book a multi-day trip?", a: "Contact {{name}} directly after unlocking the number to discuss the details." }
    ]
];

function getRandomFaqs(profile, poolCount = 4) {
    const hash = seededHash(profile.slug || 'default');
    const poolIndex = hash % faqPools.length;
    const pool = faqPools[poolIndex];
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (hash + i) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selected = shuffled.slice(0, Math.min(poolCount, shuffled.length));
    const landmarks = cityLandmarksList[profile.city] || ["secure location", "the area"];
    const landmark1 = landmarks[hash % landmarks.length];
    const landmark2 = landmarks[(hash + 1) % landmarks.length];
    return selected.map(faq => {
        let question = faq.q
            .replace(/{{name}}/g, profile.displayName || profile.name)
            .replace(/{{city}}/g, profile.city || profile.location)
            .replace(/{{languages}}/g, profile.languages || "English, Swahili")
            .replace(/{{landmark1}}/g, landmark1)
            .replace(/{{landmark2}}/g, landmark2);
        let answer = faq.a
            .replace(/{{name}}/g, profile.displayName || profile.name)
            .replace(/{{city}}/g, profile.city || profile.location)
            .replace(/{{languages}}/g, profile.languages || "English, Swahili")
            .replace(/{{landmark1}}/g, landmark1)
            .replace(/{{landmark2}}/g, landmark2);
        return `<div class="faq-item"><h3>${escapeHtml(question)}</h3><p>${escapeHtml(answer)}</p></div>`;
    }).join('');
}

// ─── Footer Helpers ───────────────────────────────────────────────
async function getAllCities() {
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        const profiles = await profilesCol.find({}).toArray();
        return [...new Set(profiles.map(p => p.city || p.location).filter(Boolean))].sort();
    }
    return [];
}

async function getTopCityLinks() {
    const cities = await getAllCities();
    return cities.map(city => {
        const slug = city.toLowerCase().replace(/ /g, '-');
        return `<a href="../${slug}-escorts.html">${escapeHtml(city)} Escorts</a>`;
    }).join('\n');
}

async function getRelatedProfiles(profile) {
    const profilesCol = getCollection('profiles');
    if (!profilesCol) return '';
    const city = profile.city || profile.location;
    const slug = profile.slug;
    const sameCity = await profilesCol.find({
        $or: [{ city: city }, { location: city }],
        slug: { $ne: slug },
        isApproved: true
    }).toArray();
    const hash = seededHash(slug || 'default');
    const shuffled = [...sameCity];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (hash + i) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selected = shuffled.slice(0, 6);
    return selected.map(p => `<a href="${p.slug}.html">${escapeHtml(sanitizeName(p.displayName || p.name))}</a>`).join('\n');
}

// ─── Auth Middleware ──────────────────────────────────────────────
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const usersCol = getCollection('users');
    if (usersCol) {
        const user = await usersCol.findOne({ token });
        if (!user) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        req.userId = user._id.toString();
        req.user = user;
        return next();
    }
    const users = readJSON('users.json', {});
    for (const [id, user] of Object.entries(users)) {
        if (user.token === token) {
            req.userId = id;
            req.user = { id, ...user };
            return next();
        }
    }
    return res.status(401).json({ message: 'Invalid token' });
}

// ─── Database Query Functions ─────────────────────────────────────
async function findUserByEmail(email) {
    const usersCol = getCollection('users');
    if (usersCol) {
        return await usersCol.findOne({ email });
    }
    const users = readJSON('users.json', {});
    for (const [id, user] of Object.entries(users)) {
        if (user.email === email) return { id, ...user };
    }
    return null;
}

async function findUserById(id) {
    const usersCol = getCollection('users');
    if (usersCol) {
        return await usersCol.findOne({ _id: new ObjectId(id) });
    }
    const users = readJSON('users.json', {});
    return users[id] ? { id, ...users[id] } : null;
}

async function findProfileByUserId(userId) {
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        return await profilesCol.findOne({ userId });
    }
    const profiles = readJSON('profiles.json', []);
    return profiles.find(p => p.userId === userId);
}

async function findProfileBySlug(slug) {
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        return await profilesCol.findOne({ slug });
    }
    const profiles = readJSON('profiles.json', []);
    return profiles.find(p => p.slug === slug);
}

async function getAllProfiles() {
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        return await profilesCol.find({}).toArray();
    }
    return readJSON('profiles.json', []);
}

async function saveProfile(profile) {
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        const result = await profilesCol.insertOne(profile);
        return { ...profile, _id: result.insertedId };
    }
    const profiles = readJSON('profiles.json', []);
    profiles.push(profile);
    writeJSON('profiles.json', profiles);
    return profile;
}

async function updateProfile(slug, updates) {
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        await profilesCol.updateOne({ slug }, { $set: updates });
        return await profilesCol.findOne({ slug });
    }
    const profiles = readJSON('profiles.json', []);
    const index = profiles.findIndex(p => p.slug === slug);
    if (index !== -1) {
        profiles[index] = { ...profiles[index], ...updates };
        writeJSON('profiles.json', profiles);
        return profiles[index];
    }
    return null;
}

// ─── Routes ────────────────────────────────────────────────────────

// ─── Auth Routes ──────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password required' });
    }
    const existing = await findUserByEmail(email);
    if (existing) {
        return res.status(409).json({ message: 'Email already registered' });
    }
    const userId = new ObjectId().toString();
    const token = generateToken();
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        _id: new ObjectId(userId),
        email,
        password: hashedPassword,
        token,
        role: 'escort',
        createdAt: new Date().toISOString()
    };
    const usersCol = getCollection('users');
    if (usersCol) {
        await usersCol.insertOne(newUser);
    } else {
        const users = readJSON('users.json', {});
        users[userId] = newUser;
        writeJSON('users.json', users);
    }
    res.status(201).json({
        message: 'Registration successful',
        token,
        userId,
        user: { email, role: 'escort' }
    });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password required' });
    }
    const user = await findUserByEmail(email);
    if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = generateToken();
    const usersCol = getCollection('users');
    if (usersCol) {
        await usersCol.updateOne({ _id: user._id }, { $set: { token } });
    } else {
        const users = readJSON('users.json', {});
        if (users[user.id]) {
            users[user.id].token = token;
            writeJSON('users.json', users);
        }
    }
    const profile = await findProfileByUserId(user._id?.toString() || user.id);
    const subStatus = profile ? { active: false } : { active: false };
    res.json({
        message: 'Login successful',
        token,
        user: { email: user.email, role: user.role || 'escort' },
        subscription: subStatus
    });
});

// ─── Profile Routes ──────────────────────────────────────────────
app.get('/api/profiles/me', authenticate, async (req, res) => {
    const profile = await findProfileByUserId(req.userId);
    if (!profile) {
        return res.status(404).json({ message: 'Profile not found' });
    }
    res.json(profile);
});

app.post('/api/profiles', authenticate, async (req, res) => {
    const { displayName, age, location, ethnicity, description, services, phone } = req.body;
    if (!displayName || !age || !location || !description || !phone) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    const existing = await findProfileByUserId(req.userId);
    if (existing) {
        return res.status(409).json({ message: 'You already have a profile' });
    }
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString().slice(-4);
    const newProfile = {
        slug,
        userId: req.userId,
        name: displayName,
        displayName,
        age: parseInt(age),
        city: location,
        location,
        ethnicity: ethnicity || '',
        description,
        services: services || [],
        phone,
        fullNumber: phone,
        photos: [],
        images: [],
        status: 'pending',
        isApproved: false,
        createdAt: new Date().toISOString(),
        profileViews: 0,
        verified: false
    };
    const saved = await saveProfile(newProfile);
    res.status(201).json({
        message: 'Profile created successfully. Awaiting admin approval.',
        profile: saved
    });
});

app.put('/api/profiles/me', authenticate, async (req, res) => {
    try {
        const { displayName, age, location, ethnicity, description, services, phone, photos } = req.body;
        const profile = await findProfileByUserId(req.userId);
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }
        const updates = {};
        if (displayName !== undefined) updates.displayName = displayName;
        if (age !== undefined) updates.age = parseInt(age);
        if (location !== undefined) updates.location = location;
        if (ethnicity !== undefined) updates.ethnicity = ethnicity;
        if (description !== undefined) updates.description = description;
        if (services !== undefined) updates.services = services;
        if (phone !== undefined) updates.phone = phone;
        if (photos !== undefined) updates.photos = photos;
        const updated = await updateProfile(profile.slug, updates);
        res.json({
            message: '✅ Profile updated successfully',
            profile: updated
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            message: 'Failed to update profile',
            error: error.message
        });
    }
});

// ─── Admin Routes ──────────────────────────────────────────────────
app.get('/api/admin/stats', authenticate, async (req, res) => {
    const user = await findUserById(req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const profiles = await getAllProfiles();
    const pending = profiles.filter(p => p.status === 'pending' || !p.isApproved).length;
    const approved = profiles.filter(p => p.status === 'approved' || p.isApproved).length;
    const rejected = profiles.filter(p => p.status === 'rejected').length;
    res.json({ pending, approved, rejected, total: profiles.length });
});

app.get('/api/admin/profiles', authenticate, async (req, res) => {
    const user = await findUserById(req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const { status } = req.query;
    let profiles = await getAllProfiles();
    if (status === 'pending') {
        profiles = profiles.filter(p => p.status === 'pending' || !p.isApproved);
    } else if (status === 'approved') {
        profiles = profiles.filter(p => p.status === 'approved' || p.isApproved);
    } else if (status === 'rejected') {
        profiles = profiles.filter(p => p.status === 'rejected');
    }
    res.json(profiles);
});

app.put('/api/admin/profiles/:slug/approve', authenticate, async (req, res) => {
    const user = await findUserById(req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const slug = req.params.slug;
    const updated = await updateProfile(slug, { isApproved: true, status: 'approved', approvedAt: new Date().toISOString() });
    if (!updated) {
        return res.status(404).json({ message: 'Profile not found' });
    }
    res.json({ message: '✅ Profile approved successfully', profile: updated });
});

app.delete('/api/admin/profiles/:slug', authenticate, async (req, res) => {
    const user = await findUserById(req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const slug = req.params.slug;
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        const result = await profilesCol.deleteOne({ slug });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Profile not found' });
        }
    } else {
        const profiles = readJSON('profiles.json', []);
        const index = profiles.findIndex(p => p.slug === slug);
        if (index === -1) {
            return res.status(404).json({ message: 'Profile not found' });
        }
        profiles.splice(index, 1);
        writeJSON('profiles.json', profiles);
    }
    res.json({ message: '❌ Profile rejected and deleted successfully' });
});

// ─── GET ALL APPROVED PROFILES ────────────────────────────────────
app.get('/api/profiles', async (req, res) => {
    try {
        const profiles = await getAllProfiles();
        const approved = profiles.filter(p => p.isApproved === true);
        res.json(approved);
    } catch (error) {
        console.error('Error fetching profiles:', error);
        res.status(500).json({ error: 'Failed to fetch profiles' });
    }
});

// ─── ACTIVATE PROFILE AFTER PAYMENT ──────────────────────────────
app.post('/api/profiles/me/activate', authenticate, async (req, res) => {
    try {
        const { tier, duration } = req.body;
        const profile = await findProfileByUserId(req.userId);
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }
        const updated = await updateProfile(profile.slug, {
            isApproved: true,
            status: 'approved',
            approvedAt: new Date().toISOString(),
            subscriptionTier: tier || 'premium',
            subscriptionDuration: duration || 'monthly'
        });
        res.json({
            success: true,
            message: '✅ Profile activated and live!',
            profile: updated
        });
    } catch (error) {
        console.error('Activation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to activate profile',
            error: error.message
        });
    }
});

// ─── INCREMENT PROFILE VIEWS ──────────────────────────────────────
app.post('/api/profiles/:slug/view', async (req, res) => {
    try {
        const slug = req.params.slug;
        const profile = await findProfileBySlug(slug);
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const views = (profile.profileViews || 0) + 1;
        await updateProfile(slug, { profileViews: views });
        res.json({ views });
    } catch (error) {
        console.error('View increment error:', error);
        res.status(500).json({ error: 'Failed to update views' });
    }
});

// ─── Payment Proxy ──────────────────────────────────────────────────
app.post('/api/pay', async (req, res) => {
    console.log('🚀 PAYMENT ROUTE HIT - VERSION 5.0 (no verification)');

    try {
        const { name, phone, amount, email } = req.body;

        let recaptchaToken = req.headers['x-recaptcha-token'] ||
            req.headers['X-Recaptcha-Token'] ||
            req.body.recaptchaToken;

        if (!recaptchaToken) {
            console.log('❌ No reCAPTCHA token found');
            return res.status(400).json({ error: 'Missing reCAPTCHA token' });
        }

        if (!phone || !amount) {
            return res.status(400).json({
                error: 'Phone number and amount are required'
            });
        }

        const response = await fetch('https://sarahapay.onrender.com/api/pay', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Secret': process.env.API_SECRET || '103e07b75c0b3d874cd4376dd0e095729f66d4f268033061aa087df169acc4ac4',
                'X-Recaptcha-Token': recaptchaToken
            },
            body: JSON.stringify({
                name: name || 'FineEscorts Payment',
                phone: phone,
                amount: Number(amount),
                email: email || '',
                recaptchaToken: recaptchaToken
            })
        });

        const data = await response.json();
        console.log('📥 Sarahapay response:', data);

        res.status(response.status).json(data);
    } catch (error) {
        console.error('❌ Payment proxy error:', error);
        res.status(500).json({
            error: 'Payment service unavailable',
            details: error.message
        });
    }
});

// ─── Transaction Status Proxy ─────────────────────────────────────
app.get('/api/transaction/:id', async (req, res) => {
    try {
        const transactionId = req.params.id;
        const response = await fetch(`https://sarahapay.onrender.com/api/transaction/${transactionId}`, {
            headers: {
                'X-API-Secret': process.env.API_SECRET || '103e07b75c0b3d874cd4376dd0e095729f66d4f268033061aa087df169acc4ac4'
            }
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Transaction status error:', error);
        res.status(500).json({
            error: 'Transaction status unavailable',
            details: error.message
        });
    }
});

// ─── Serve Pages ──────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/signup.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/reset-password.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'reset-password.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/payment.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'payment.html'));
});

// ─── DYNAMIC PROFILE PAGE ──────────────────────────────────────────
app.get('/profiles/:slug.html', async (req, res) => {
    try {
        const slug = req.params.slug;
        console.log(`🔍 Looking for profile: ${slug}`);

        const profile = await findProfileBySlug(slug);

        if (!profile) {
            console.log(`❌ Profile not found: ${slug}`);
            return res.status(404).send('Profile not found');
        }

        console.log(`✅ Found profile: ${profile.displayName}`);

        const templatePath = path.join(__dirname, 'templates', 'profile-template.html');
        let template = fs.readFileSync(templatePath, 'utf8');

        // ─── Build full context ──────────────────────────────────────
        const fullNumber = profile.fullNumber || profile.phone || '';
        const displayName = profile.displayName || profile.name || 'Unknown';
        const city = profile.city || profile.location || 'Unknown';

        // ─── Gallery with thumbnails ─────────────────────────────────
       // ─── Gallery with thumbnails ─────────────────────────────────
const images = profile.photos || profile.images || [];
        let galleryHtml = '<div class="gallery">No images</div>';
        if (images.length > 0) {
            galleryHtml = `
                <div class="thumbs">
                    ${images.map((img, idx) => `
                        <img src="${img}" class="thumb ${idx === 0 ? 'active' : ''}" alt="${escapeHtml(displayName)} - ${escapeHtml(city)} escort photo ${idx+1}" width="80" height="80" loading="lazy">
                    `).join('\n')}
                </div>
                <div class="main-image">
                    ${images.map((img, idx) => `
                        <img src="${img}" class="main ${idx === 0 ? 'active' : ''}" alt="${escapeHtml(displayName)} - verified escort in ${escapeHtml(city)}" width="400" height="500" loading="${idx === 0 ? 'eager' : 'lazy'}">
                    `).join('\n')}
                </div>
            `;
        }

        // ─── Reviews ──────────────────────────────────────────────────
        let reviewsHtml = '<p>No reviews yet. Be the first to review!</p>';
        if (profile.reviews && profile.reviews.length > 0) {
            reviewsHtml = profile.reviews.slice(0, 3).map(r => {
                const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
                return `
                    <div class="review-card">
                        <div class="review-stars">${stars}</div>
                        <div class="review-text">"${escapeHtml(r.comment)}"</div>
                        <div class="review-author">${escapeHtml(r.author)} <span>• Verified client</span></div>
                    </div>
                `;
            }).join('');
        }

        // ─── Top Reviews (preview) ──────────────────────────────────
        let topReviewsHtml = '';
        if (profile.reviews && profile.reviews.length > 0) {
            topReviewsHtml = profile.reviews.slice(0, 2).map(r => `
                <div class="preview-review-item">
                    <div class="preview-review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
                    <div>"${escapeHtml(r.comment)}"</div>
                    <div style="font-size:0.7rem; color:#888;">— ${escapeHtml(r.author)}</div>
                </div>
            `).join('');
        }

      const context = {
    // Basic profile info
    name: displayName,
    displayName: displayName,
    city: city,
    location: city,
    age: profile.age || 'N/A',
    fullNumber: fullNumber,
    maskedNumber: profile.maskedNumber || '07XX XXX XXX',
    slug: profile.slug || slug,

    // Trust signals
    lastUpdated: Math.floor(Math.random() * 7) + 1,
    profileViews: profile.profileViews || 0,
    memberSince: profile.createdAt ? new Date(profile.createdAt).toLocaleString('default', { month: 'long', year: 'numeric' }) : 'Recently',

    // Gallery
    gallery: galleryHtml,

    // Bio
    bioHtml: profile.description ?
        `<p>${escapeHtml(profile.description)}</p>` :
        '<p>No description available.</p>',

    // Services
    services: profile.services && profile.services.length > 0 ?
        profile.services.map(s => `<span class="service">${escapeHtml(s)}</span>`).join('') :
        getServiceCluster(profile),

    // Reviews
    reviews: reviewsHtml,
    topReviewsHtml: topReviewsHtml,

    // FAQ
    faqHtml: getRandomFaqs(profile, 4),

    // City links (async)
    topCityLinks: await getTopCityLinks(),

    // Related profiles (async)
    relatedProfiles: await getRelatedProfiles(profile),

    // Escort ID for JavaScript
    escortId: profile.slug ? profile.slug.replace(/-/g, '_').toUpperCase() : 'UNKNOWN',

    // Badges
    verifiedBadge: profile.verified ?
        '<span class="verified-badge" title="ID &amp; Photo Verified"><i class="fas fa-check-circle"></i> Verified</span>' :
        '',
    vipBadge: '',
    ethnicityPart: profile.ethnicity ? ` · ${profile.ethnicity}` : '',

    // WhatsApp number
    waNumber: formatWhatsAppNumber(fullNumber),

    // Trust badges
    trustBadgesHtml: '',
    localTipHtml: '',

    // Meta data
    title: `${displayName} – Verified Escort in ${city}`,
    metaDescription: profile.description ? profile.description.substring(0, 160) : 'Verified escort profile.',

    // URLs
    heroImage: images.length > 0 ? images[0] : '',
    ogImage: images.length > 0 ? images[0] : '',
    baseUrl: 'https://fine-2zxp.onrender.com',
    citySlug: city.toLowerCase().replace(/ /g, '-'),

    // JSON-LD (placeholder)
    jsonLd: '{}',

    // Today's date
    today: new Date().toISOString().split('T')[0],

    // Published date
    publishedDate: profile.createdAt || new Date().toISOString(),

    // Social media (empty)
    socialMedia: [],

    // First/last name
    firstName: displayName.split(' ')[0] || displayName,
    lastName: displayName.split(' ').slice(1).join(' ') || '',

    // ⬇️⬇️⬇️ ADD THIS LINE ⬇️⬇️⬇️
    viewCounterScript: `<script>
        (async function() {
            try {
                const slug = window.location.pathname.split('/').pop().replace('.html', '');
                await fetch('/api/profiles/' + slug + '/view', { method: 'POST' });
            } catch (e) {
                // Silently fail
            }
        })();
    </script>`,
    // ⬆️⬆️⬆️ END OF ADDITION ⬆️⬆️⬆️
};

        const html = render(template, context);
        res.send(html);

    } catch (error) {
        console.error('❌ Error serving profile:', error);
        res.status(500).send('Internal Server Error');
    }
});

// ─── Cloudinary Configuration ─────────────────────────────────────
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'fineescorts-profiles',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        transformation: [
            { width: 800, height: 1000, crop: 'limit', quality: 'auto' }
        ]
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// ─── PHOTO UPLOAD ENDPOINT ────────────────────────────────────────
app.post('/api/profiles/me/photos', authenticate, upload.array('photos', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No photos uploaded' });
        }

        const profile = await findProfileByUserId(req.userId);
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }

        const tier = profile.subscriptionTier || 'free';
        const maxPhotos = { free: 3, standard: 3, premium: 5, vip: 10 }[tier] || 5;
        const existingPhotos = profile.photos || [];

        if (existingPhotos.length + req.files.length > maxPhotos) {
            return res.status(400).json({
                message: `Maximum ${maxPhotos} photos allowed. You already have ${existingPhotos.length}.`
            });
        }

        const photoUrls = req.files.map(file => file.path);
        const allPhotos = [...existingPhotos, ...photoUrls];
        const updated = await updateProfile(profile.slug, { photos: allPhotos });

        res.json({
            message: '✅ Photos uploaded successfully',
            photos: updated.photos
        });
    } catch (error) {
        console.error('Photo upload error:', error);
        res.status(500).json({
            message: 'Failed to upload photos',
            error: error.message
        });
    }
});

// ─── DELETE PHOTO ENDPOINT ────────────────────────────────────────
app.delete('/api/profiles/me/photos', authenticate, async (req, res) => {
    try {
        const { photoUrl } = req.body;
        if (!photoUrl) {
            return res.status(400).json({ message: 'Photo URL required' });
        }

        const profile = await findProfileByUserId(req.userId);
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }

        const updatedPhotos = (profile.photos || []).filter(p => p !== photoUrl);
        const updated = await updateProfile(profile.slug, { photos: updatedPhotos });

        res.json({
            message: '✅ Photo deleted successfully',
            photos: updated.photos
        });
    } catch (error) {
        console.error('Delete photo error:', error);
        res.status(500).json({
            message: 'Failed to delete photo',
            error: error.message
        });
    }
});

// ─── Start Server ──────────────────────────────────────────────────
async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`🚀 FineEscorts Server running at http://localhost:${PORT}`);
        console.log(`📊 API endpoints at http://localhost:${PORT}/api/`);
        console.log(`📁 Database: ${db ? 'MongoDB Atlas ✅' : 'File-based storage ⚠️'}`);
    });
}

startServer();