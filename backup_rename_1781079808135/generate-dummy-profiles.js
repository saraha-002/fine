const fs = require("fs");

// ==================== CONFIGURATION ====================
const TOTAL_PROFILES = 100;

// ✅ TARGET CITIES WITH EXACT DISTRIBUTION
const CITY_DISTRIBUTION = [
  { name: "Syokimau", weight: 50 },
  { name: "Kitengela", weight: 30 },
  { name: "Mlolongo", weight: 10 },
  { name: "Imara Daima", weight: 5 },
  { name: "Athi River", weight: 5 }
];

// Pre‑compute cumulative weights for random selection
let cumulativeWeights = [];
let totalWeight = 0;
for (const city of CITY_DISTRIBUTION) {
  totalWeight += city.weight;
  cumulativeWeights.push(totalWeight);
}

function generateCity() {
  const rand = Math.random() * totalWeight;
  for (let i = 0; i < cumulativeWeights.length; i++) {
    if (rand < cumulativeWeights[i]) {
      return CITY_DISTRIBUTION[i].name;
    }
  }
  return "Syokimau"; // fallback
}

// Capitalise city names (first letter of each word)
function capitalizeCity(city) {
  return city.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// ========== REMAINING CONFIGURATION (unchanged) ==========
const FEMALE_NAMES = [
  "Sophia", "Isabella", "Camila", "Valeria", "Natalia", "Bianca", "Alina", "Chloe",
  "Luna", "Victoria", "Scarlett", "Amelia", "Aurora", "Elena", "Mia", "Olivia",
  "Layla", "Ariana", "Diana", "Angelina", "Gabriela", "Sofia", "Emma", "Charlotte",
  "Mila", "Eva", "Lucia", "Sara", "Daniela", "Mariana", "Alexa", "Nicole",
  "Andrea", "Paula", "Julia", "Clara", "Martina", "Laura", "Valentina", "Ximena",
  "Ashley", "Samantha", "Brittany", "Jessica", "Jennifer", "Lisa", "Monica", "Patricia",
  "Linda", "Elizabeth"
];

const MALE_NAMES = [
  "James", "Michael", "David", "Daniel", "Christopher"
];

const TRANS_NAMES = [
  "Alex", "Jordan", "Riley", "Avery", "Casey"
];

const ETHNICITIES = [
  "Kikuyu", "Luo", "Luhya", "Kalenjin", "Kamba", "Kisii", "Meru", "Mijikenda",
  "Somali", "Swahili", "Mixed", "Asian Kenyan", "European Kenyan"
];

const LANGUAGES = [
  "English, Swahili",
  "English, Swahili, Kikuyu",
  "English, Swahili, Luo",
  "English, Swahili, Luhya",
  "English, Swahili, Kamba",
  "English, Swahili, French",
  "English, Swahili, German",
  "English, Swahili, Arabic",
  "English, Swahili, Somali"
];

const ALL_SERVICES = [
  "Escorts", "Affairs", "Intimate Companionship", "Luxury Erotic Massage",
  "Sensual Bodywork", "Private Sessions", "Role Play", "Couples Experience",
  "Video Call", "Overnight", "Weekend Getaway", "Dinner Date",
  "Travel Companion", "Beach Getaway"
];

const CORE_SERVICES = ["Escorts", "Private Sessions", "Luxury Erotic Massage", "Intimate Companionship"];

const PHONE_PREFIXES = [
  "0712", "0713", "0714", "0715", "0716", "0717", "0718", "0719",
  "0720", "0721", "0722", "0723", "0724", "0725", "0726", "0727", "0728", "0729",
  "0730", "0731", "0732", "0733", "0734", "0735", "0736", "0737", "0738", "0739",
  "0740", "0741", "0742", "0743", "0744", "0745", "0746", "0747", "0748", "0749",
  "0750", "0751", "0752", "0753", "0754", "0755", "0756", "0757", "0758", "0759",
  "0768", "0769", "0770", "0771", "0772", "0773", "0774", "0775", "0776", "0777",
  "0778", "0779", "0780", "0781", "0782", "0783", "0784", "0785", "0786", "0787",
  "0788", "0789", "0790", "0791", "0792", "0793", "0794", "0795", "0796", "0797",
  "0798", "0799"
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomBoolean(percentTrue) {
  return Math.random() * 100 < percentTrue;
}

function generateFullPhone() {
  const prefix = randomItem(PHONE_PREFIXES);
  const lastSix = randomInt(100000, 999999);
  return `${prefix}${lastSix}`;
}

function maskPhone(fullNumber) {
  if (!fullNumber || fullNumber.length !== 10) return fullNumber;
  return fullNumber.slice(0, 4) + '***' + fullNumber.slice(7);
}

function generateAge() {
  const r = Math.random() * 100;
  if (r < 80) {
    const under25 = Math.random() < 2/3;
    return under25 ? randomInt(19, 24) : randomInt(25, 29);
  } else if (r < 95) return randomInt(30, 35);
  else return randomInt(36, 45);
}

function generateServices() {
  let services = [...CORE_SERVICES];
  const extraCount = randomInt(1, 3);
  const otherServices = ALL_SERVICES.filter(s => !CORE_SERVICES.includes(s));
  for (let i = 0; i < extraCount; i++) {
    const extra = randomItem(otherServices);
    if (!services.includes(extra)) services.push(extra);
  }
  return services;
}

function generateReviews(name, city) {
  const reviews = [];
  const reviewCount = randomInt(2, 3);
  const reviewers = ["James", "Michael", "David", "John", "Robert", "William", "Peter", "Paul", "Kevin", "Brian"];
  const reviewTemplates = [
    `Amazing experience with ${name} in ${capitalizeCity(city)}. Very professional and discreet. Highly recommended!`,
    `One of the best companions I've met in ${capitalizeCity(city)}. ${name} is truly elegant and classy.`,
    `Had a wonderful evening with ${name}. Great conversation and even better company.`,
    `Very responsive and punctual. The time spent with ${name} was absolutely worth it.`,
    `Professional, beautiful, and intelligent. ${name} exceeded all my expectations.`,
    `Will definitely book again! ${name} made me feel comfortable from the first minute.`,
    `Top-tier companion in ${capitalizeCity(city)}. Everything was perfect from start to finish.`,
    `${name} is a gem! Discreet, charming, and absolutely stunning.`
  ];
  for (let i = 0; i < reviewCount; i++) {
    reviews.push({
      author: randomItem(reviewers),
      rating: randomInt(4, 5),
      comment: randomItem(reviewTemplates),
      date: `202${randomInt(4, 6)}-${randomInt(1, 12)}-${randomInt(1, 28)}`
    });
  }
  return reviews;
}

function generateDescription(name, city, ethnicity, languages, age, gender) {
  const cityDisplay = capitalizeCity(city);
  const genderLower = gender.toLowerCase();
  const templates = [
    `${name} is an elegant ${ethnicity.toLowerCase()} ${genderLower} available in ${cityDisplay}, offering sophisticated companionship and premium experiences. Fluent in ${languages}.`,
    `Meet ${name}, a stunning ${age}-year-old ${ethnicity.toLowerCase()} beauty ready to make your time in ${cityDisplay} unforgettable. Speaks ${languages}.`,
    `${name} brings exotic charm and intelligence to every encounter. Based in ${cityDisplay}, this ${ethnicity.toLowerCase()} ${genderLower} is fluent in ${languages}.`,
    `Experience the ultimate in luxury companionship with ${name}. Available for discerning clients in ${cityDisplay}. ${ethnicity} beauty, ${age} years young.`
  ];
  return randomItem(templates);
}

function generateImages(i) {
  const images = [];
  for (let imgIdx = 1; imgIdx <= 5; imgIdx++) {
    images.push(`https://source.unsplash.com/random/800x1000/?portrait,model,beauty,fashion&sig=${i * 5 + imgIdx}`);
  }
  return images;
}

// ==================== GENERATE PROFILES ====================
const profiles = [];
let femaleCount = 0, maleCount = 0, transCount = 0;

for (let i = 1; i <= TOTAL_PROFILES; i++) {
  let gender, name;
  
  if (maleCount < 5 && (TOTAL_PROFILES - i) < (5 - maleCount) + (5 - transCount)) {
    gender = "Male";
    name = MALE_NAMES[maleCount];
    maleCount++;
  } else if (transCount < 5 && (TOTAL_PROFILES - i) < (5 - transCount)) {
    gender = "Transgender";
    name = TRANS_NAMES[transCount];
    transCount++;
  } else if (femaleCount < 90 && (maleCount >= 5 || transCount >= 5 || Math.random() < 0.9)) {
    gender = "Female";
    name = randomItem(FEMALE_NAMES);
    femaleCount++;
  } else if (maleCount < 5) {
    gender = "Male";
    name = MALE_NAMES[maleCount];
    maleCount++;
  } else if (transCount < 5) {
    gender = "Transgender";
    name = TRANS_NAMES[transCount];
    transCount++;
  } else {
    gender = "Female";
    name = randomItem(FEMALE_NAMES);
    femaleCount++;
  }

  const city = generateCity();
  const cityDisplay = capitalizeCity(city);
  const age = generateAge();
  const ethnicity = randomItem(ETHNICITIES);
  const languages = randomItem(LANGUAGES);
  const verified = true;
  const available_today = randomBoolean(95);
  const vip = randomBoolean(20);
  const services = generateServices();
  const reviews = generateReviews(name, city);
  const fullNumber = generateFullPhone();
  const maskedNumber = maskPhone(fullNumber);
  const images = generateImages(i);
  const description = generateDescription(name, city, ethnicity, languages, age, gender);
  const slug = `${name.toLowerCase()}-${city.toLowerCase().replace(/ /g, '-')}-${i}`;

  profiles.push({
    slug,
    name,
    city: cityDisplay,
    gender,
    age,
    ethnicity,
    languages,
    verified,
    available_today,
    vip,
    description,
    fullNumber,
    maskedNumber,
    images,
    services,
    reviews
  });
}

// Statistics
console.log(`\n📊 Gender Distribution:`);
console.log(`   Female: ${femaleCount} profiles`);
console.log(`   Male: ${maleCount} profiles`);
console.log(`   Transgender: ${transCount} profiles`);
console.log(`   Total: ${profiles.length} profiles`);

const cityStats = {};
profiles.forEach(p => cityStats[p.city] = (cityStats[p.city] || 0) + 1);
console.log(`\n📍 City Distribution:`);
Object.entries(cityStats).sort((a,b) => b[1]-a[1]).forEach(([city, count]) => {
  console.log(`   ${city}: ${count} profiles (${((count/TOTAL_PROFILES)*100).toFixed(1)}%)`);
});

fs.writeFileSync("data/profiles.json", JSON.stringify(profiles, null, 2));
console.log(`\n✅ Generated ${TOTAL_PROFILES} Kenyan escort profiles.`);
console.log(`📁 File saved to: data/profiles.json`);
