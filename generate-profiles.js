const fs = require("fs");
const path = require("path");

// ─── Format phone for WhatsApp ────────────────────────────────────
function formatWhatsAppNumber(phone) {
    if (!phone) return '';
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    // If starts with 0, replace with 254
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.substring(1);
    }
    // If doesn't start with 254, add it
    if (!cleaned.startsWith('254')) {
        cleaned = '254' + cleaned;
    }
    return cleaned;
}
// ---------- Split description into preview (180 words) + full text ----------
function splitDescription(text, wordLimit = 35) {
    if (!text) return { preview: '', full: '', hasMore: false };
    const words = text.trim().split(/\s+/);
    if (words.length <= wordLimit) {
        return { preview: text, full: '', hasMore: false };
    }
    
    // Take the first wordLimit words
    const previewWords = words.slice(0, wordLimit);
    let preview = previewWords.join(' ');
    
    // Try to cut at the last period, comma, or space within the limit
    const cutPoints = ['. ', ', ', '? ', '! ', ' - ', ' – ', ' '];
    let bestCut = preview.length;
    for (const point of cutPoints) {
        const idx = preview.lastIndexOf(point);
        if (idx > 0 && idx < preview.length - 2) {
            bestCut = idx + point.length;
            break;
        }
    }
    // If we found a good cut point, use it; otherwise use the full word limit
    if (bestCut < preview.length) {
        preview = preview.substring(0, bestCut).trim();
    }
    
    const fullWords = words.slice(wordLimit);
    return {
        preview: preview + ' ...',
        full: fullWords.join(' '),
        hasMore: true
    };
}


const BASE_URL = "https://fineescorts.co.ke/";
const TEMPLATE_DIR = path.join(__dirname, "templates");
const DATA_FILE = path.join(__dirname, "data", "profiles.json");
const BLOG_FILE = path.join(__dirname, "data", "blog-posts.json");
const PROFILES_OUTPUT_DIR = path.join(__dirname, "profiles");
const CITY_PAGES_OUTPUT_DIR = __dirname;

if (!fs.existsSync(PROFILES_OUTPUT_DIR)) fs.mkdirSync(PROFILES_OUTPUT_DIR, { recursive: true });

const profileTemplate = fs.readFileSync(path.join(TEMPLATE_DIR, "profile-template.html"), "utf8");
const cityTemplate = fs.readFileSync(path.join(TEMPLATE_DIR, "city-template.html"), "utf8");
let profiles = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
let blogPosts = [];
try {
  blogPosts = JSON.parse(fs.readFileSync(BLOG_FILE, "utf8"));
  console.log(`📚 Loaded ${blogPosts.length} blog posts`);
} catch (err) {
  console.warn("⚠️ Could not load blog-posts.json – related articles will be omitted");
}

// ---------- Normalise city names ----------
const cityNameCorrections = {
  "athiriver": "Athiriver",
  "kitengela": "Kitengela",
  "syokimau": "Syokimau",
  "mlolongo": "Mlolongo",
  "imara daima": "Imara Daima"
};

profiles = profiles.map(profile => {
  const rawCity = profile.city?.trim().toLowerCase() || "";
  const correctedCity = cityNameCorrections[rawCity] || (profile.city?.charAt(0).toUpperCase() + profile.city?.slice(1).toLowerCase());
  return {
    ...profile,
    city: correctedCity,
    slug: profile.slug.toLowerCase()
  };
});

console.log(`📚 Loaded ${profiles.length} Kenyan escort profiles (normalised)`);

// ---------- Helpers ----------
function slugify(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '').replace(/-+/g, '-');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m] || m));
}

function sanitizeName(name) {
  if (!name) return '';
  return name.replace(/[\u{1F600}-\u{1F64F}]/gu, '').replace(/[^\w\s\-']/g, '').trim();
}

function isGenericDescription(desc) {
  if (!desc) return true;
  const genericPatterns = [
    /offering sophisticated companionship and premium experiences/i,
    /Meet .*, a stunning .*-year-old .* beauty/i,
    /brings exotic charm and intelligence to every encounter/i,
    /Experience the ultimate in luxury companionship with/i,
    /is an elegant .* available in/i,
    /Available for discerning clients in/i
  ];
  return genericPatterns.some(pattern => pattern.test(desc));
}

function render(template, context) {
  let result = template;
  for (const [key, value] of Object.entries(context)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value !== undefined ? value : '');
  }
  return result;
}

function seededHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function generateGallery(images, name, city) {
  if (!images?.length) return `<div class="thumbs"><div class="thumb">No images</div></div><div class="main-image"><div class="main active">No images</div></div>`;
  let thumbs = "", mains = "";
  images.forEach((src, idx) => {
    const active = idx === 0 ? "active" : "";
    thumbs += `<img src="${src}" class="thumb ${active}" alt="${escapeHtml(name)} - ${escapeHtml(city)} escort photo ${idx+1}" width="80" height="80" loading="lazy">\n`;
    mains += `<img src="${src}" class="main ${active}" alt="${escapeHtml(name)} - verified escort in ${escapeHtml(city)}" width="400" height="500" loading="${idx === 0 ? 'eager' : 'lazy'}">\n`;
  });
  return `<div class="thumbs">${thumbs}</div><div class="main-image">${mains}</div>`;
}

// ---------- Improved reviews with realism ----------
function isGenericReview(comment) {
  const genericPhrases = [
    /Will definitely book again/i,
    /Very professional and discreet/i,
    /Highly recommended/i,
    /Truly elegant and classy/i
  ];
  return genericPhrases.some(p => p.test(comment));
}

function generateReviews(reviews, profile) {
  if (!reviews?.length) return '<div class="review-card"><p>No reviews yet. Be the first to review!</p></div>';
  const realisticComments = [
    "Very responsive and punctual. Communication was smooth and easy.",
    "One of the most genuine companions I’ve met. Photos matched perfectly.",
    "Had a great dinner date together. Very charming and easy to talk to.",
    "The meetup felt relaxed and natural. Highly recommended.",
    "Professional, beautiful, and intelligent. Exceeded all my expectations.",
    "Will definitely book again! Made me feel comfortable from the first minute.",
    "Very discreet and respectful. A true professional.",
    "Great conversation and even better company. Worth every shilling.",
    "Punctual, attractive, and genuine – exactly as described.",
    "Top-tier companion. Everything was perfect from start to finish.",
    "Friendly, warm, and very easy to arrange with. Would repeat.",
    "An amazing experience – thoughtful, engaging, and discreet.",
    "Okay but not exceptional – communication was a bit slow.",
    "Average experience, might try someone else next time."
  ];
  const authors = [
    "James","Michael","David","John","Robert","William","Peter","Paul",
    "Kevin","Brian","Daniel","Mark","Chris","Joseph","Eric","Steve",
    "Alex","Dennis","Anthony","Sam","Victor","Martin","Andrew","George",
    "Tony","Patrick","Leon","Collins","Jeff","Nick"
  ];

  const hash = seededHash(profile.slug);
  // Keep real reviews if they exist and are not generic
  if (reviews.length > 0 && !isGenericReview(reviews[0].comment)) {
    return reviews.map(r => {
      const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
      return `<div class="review-card"><div class="review-stars">${stars}</div><div class="review-text">"${escapeHtml(r.comment)}"</div><div class="review-author">${escapeHtml(r.author)} <span>• Verified client</span></div></div>`;
    }).join('');
  } else {
    const reviewCount = 2 + (hash % 3); // 2,3,4
    let html = '';
    for (let i = 0; i < reviewCount; i++) {
      let comment = realisticComments[(hash + i) % realisticComments.length];
      const author = authors[(hash + i) % authors.length];
      let rating;
      // occasional 3-star (≈14%), otherwise 4 or 5
      if ((hash + i) % 7 === 0) rating = 3;
      else if ((hash + i) % 5 === 0) rating = 5;
      else rating = 4;
      // 30% chance to omit "Verified client"
      const showVerified = ((hash + i) % 10) < 7;
      const verifiedHtml = showVerified ? '<span>• Verified client</span>' : '';
      // 20% chance to shorten comment
      if ((hash + i) % 5 === 0 && comment.length > 40) {
        comment = comment.slice(0, 50) + '...';
      }
      const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
      html += `<div class="review-card"><div class="review-stars">${stars}</div><div class="review-text">"${escapeHtml(comment)}"</div><div class="review-author">${escapeHtml(author)} ${verifiedHtml}</div></div>`;
    }
    return html;
  }
}

// ---------- Expanded city landmarks (multiple per city, for rotation) ----------
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
    "within easy reach of Gateway Mall",
    "eastern corridor of Nairobi"
  ],
  "Mlolongo": [
    "close to Mlolongo town centre and the Jomo Kenyatta International Airport",
    "near JKIA and the Expressway",
    "along Mombasa Road near the airport",
    "convenient for airport transfers and hotels"
  ],
  "Imara Daima": [
    "in the Imara Daima estate, near Signature Mall and T-Mall",
    "off Mombasa Road near the Eastern Bypass",
    "close to major hotels and the SGR",
    "residential area with easy highway access"
  ],
  "Athiriver": [
    "along Mombasa Road, near Athiriver town and the Industrial Area",
    "close to the Athiriver township",
    "near the junction of Mombasa Road and the Eastern Bypass",
    "convenient for business and leisure travelers"
  ]
};
const defaultLandmark = "in secure, central locations";

// ---------- Intro, location, personality, closing variants (unchanged) ----------
const introVariants = [
  p => `is an elegant ${p.ethnicity} ${p.gender.toLowerCase()} companion`,
  p => `is a stunning ${p.age}-year-old ${p.ethnicity.toLowerCase()} beauty`,
  p => `brings exotic charm and intelligence to every encounter`,
  p => `offers sophisticated companionship and premium experiences`,
  p => `is a verified, high-class companion`,
  p => `has a warm, engaging personality and a genuine passion for making clients feel at ease`
];

const locationVariants = [
  p => `available for incalls in secure, upscale locations ${cityLandmarksList[p.city]?.[0] || defaultLandmark}`,
  p => `serves discerning clients in ${p.city} and nearby areas, ${cityLandmarksList[p.city]?.[0] || ''}`,
  p => `welcomes you to her private incall ${cityLandmarksList[p.city]?.[0] || `in ${p.city}`}`,
  p => `offers discreet outcalls to reputable hotels in ${p.city} and surrounding neighbourhoods`
];

const personalityVariants = [
  "She is known for her discretion, professionalism, and ability to make any occasion special.",
  "Her style blends sensuality with intelligence – perfect for dinner dates or private evenings.",
  "Clients appreciate her relaxed, down‑to‑earth demeanour and genuine conversation.",
  "She takes pride in creating a comfortable, judgement‑free atmosphere."
];

const closingVariants = [
  "Clients appreciate her relaxed personality, discretion, and genuine conversation.",
  "She values privacy, punctuality, and creating a comfortable, judgement‑free atmosphere.",
  "Whether you're a local or visiting, she provides an unforgettable experience.",
  "Your satisfaction and discretion are her top priorities.",
  "Many describe her as the perfect companion for dinner dates or private evenings.",
  "She looks forward to making your time together relaxed and enjoyable.",
  "Known for her warmth and professionalism – a truly memorable companion.",
  "Don't miss the chance to experience genuine companionship in a stress‑free environment."
];

function buildEnhancedDescription(profile) {
  const hash = seededHash(profile.slug);
  const introIdx = hash % introVariants.length;
  const locationIdx = Math.floor(hash / introVariants.length) % locationVariants.length;
  const personalityIdx = Math.floor(hash / (introVariants.length * locationVariants.length)) % personalityVariants.length;
  const closingIdx = Math.floor(hash / (introVariants.length * locationVariants.length * personalityVariants.length)) % closingVariants.length;

  const intro = introVariants[introIdx](profile);
  const location = locationVariants[locationIdx](profile);
  const personality = personalityVariants[personalityIdx];
  const closing = closingVariants[closingIdx];

  return `${profile.name} ${intro}, ${location}. ${personality} ${closing}`;
}

// ---------- FAQ pools (10 pools) ----------
const faqPools = [
 [ // Pool 0: standard
    { q: "Is {{name}} a verified escort in {{city}}?", a: "Yes, {{name}} has completed our identity verification process and is a verified companion in {{city}}." },
    { q: "Where in {{city}} is {{name}} available?", a: "{{name}} is available for incalls in secure, upscale locations within {{city}} and nearby areas. Outcalls to reputable hotels in {{city}} are also welcome." },
    { q: "Does {{name}} offer overnight or travel companionship?", a: "{{name}} offers overnight stays and can accompany you on weekend getaways around {{city}} or Nairobi. Please discuss during booking." },
    { q: "How do I book {{name}}?", a: "Simply visit {{name}}'s profile, view her contact details, and reach out directly via call or WhatsApp. All profiles are verified and ready to connect." } // ✅ NEW
],
 [ // Pool 1: privacy & discretion
    { q: "Is my privacy guaranteed when booking {{name}}?", a: "Absolutely. Discretion is {{name}}'s top priority. All communications are confidential." },
    { q: "Can I request a specific meetup location in {{city}}?", a: "Yes, outcalls to reputable hotels in {{city}} are welcome. Please discuss preferences during booking." },
    { q: "What is {{name}}’s cancellation policy?", a: "Please give at least 2 hours' notice if you need to cancel or reschedule." },
    { q: "How do I contact {{name}}?", a: "Simply visit {{name}}'s profile and use the Call or WhatsApp buttons to reach her directly." } // ✅ NEW
],
  [ // Pool 2: luxury/high-end
    { q: "Is {{name}} available for upscale events in {{city}}?", a: "Yes, {{name}} is well‑suited for luxury dinners, social events, and weekend retreats." },
    { q: "What kind of experiences does {{name}} specialise in?", a: "Luxury companionship, fine dining, travel, and private evenings." },
    { q: "Does {{name}} offer VIP packages?", a: "Please inquire during booking for exclusive arrangements." },
    { q: "How can I be sure {{name}} is genuine?", a: "{{name}} is fully verified through our ID and photo verification process." }
  ],
  [ // Pool 3: travel companion focus
    { q: "Is {{name}} available for travel outside {{city}}?", a: "Yes, {{name}} can accompany you on weekend getaways to Nairobi or other nearby destinations." },
    { q: "What are the travel conditions?", a: "All travel expenses (transport, accommodation) are covered by the client." },
    { q: "Does {{name}} offer overnight stays?", a: "Absolutely, overnight and extended dates are available upon request." },
    { q: "How to book a multi‑day trip?", a: "Contact {{name}} directly after unlocking the number to discuss the details." }
  ],
 [ // Pool 4: first‑time client
    { q: "I’ve never booked an escort before. What should I expect?", a: "{{name}} is very friendly and will guide you through the process. Just be polite and clear about your preferences." },
    { q: "Is it safe to meet {{name}} in {{city}}?", a: "Yes, {{name}} only accepts meetings in safe, public, or reputable private locations." },
    { q: "How do I know the photos are real?", a: "All images are verified by our team. You can also request a live verification call." },
    { q: "How do I book {{name}}?", a: "Simply visit {{name}}'s profile, view her contact details, and reach out directly via call or WhatsApp." } // ✅ NEW
],
  [ // Pool 5: nightlife/party
    { q: "Is {{name}} comfortable with nightlife outings in {{city}}?", a: "Yes, {{name}} enjoys exploring clubs, lounges, and bars in {{city}}." },
    { q: "Can {{name}} accompany me to a private party?", a: "Absolutely, {{name}} is sociable and discreet in group settings." },
    { q: "What is the best time to book for a night out?", a: "Evenings from 8 PM onwards are ideal. Please book in advance." },
    { q: "Does {{name}} offer services for couples?", a: "Yes, {{name}} is open to couples with prior arrangement." }
  ],
  [ // Pool 6: massage & wellness
    { q: "Does {{name}} offer professional massage?", a: "{{name}} is trained in relaxing full‑body massage and sensual bodywork." },
    { q: "What is included in the massage session?", a: "A private, unhurried session focused on stress relief and relaxation." },
    { q: "Do I need to bring anything?", a: "Just yourself. Towels and oils are provided." },
    { q: "How long are the massage sessions?", a: "Usually 1 or 2 hours. Extended sessions can be arranged." }
  ],
  [ // Pool 7: business traveler
    { q: "Is {{name}} available for dinner dates with business clients?", a: "Yes, {{name}} is well‑spoken, punctual, and comfortable in formal settings." },
    { q: "Can {{name}} meet at my hotel near {{city}}?", a: "Yes, outcalls to reputable hotels in {{city}} are welcome." },
    { q: "Does {{name}} offer daytime availability?", a: "Daytime availability is limited. Please ask when booking." },
    { q: "What languages does {{name}} speak?", a: "{{name}} speaks {{languages}}." }
  ],
  [ // Pool 8: local tips
    { q: "What are good meeting spots in {{city}}?", a: "Popular choices include {{landmark1}} and {{landmark2}}. {{name}} can also suggest a secure incall." },
    { q: "Is public transport accessible?", a: "Yes, {{city}} is well‑connected by matatus and taxis." },
    { q: "Can I park near the incall?", a: "Yes, secure parking is available." },
    { q: "Are there any hotels you recommend?", a: "There are several reputable hotels in {{city}} that welcome discreet meetings." }
  ],
  [ // Pool 9: introverted/private companion
    { q: "Is {{name}} more introverted or extroverted?", a: "{{name}} values meaningful connection and quiet, intimate settings – perfect for relaxed evenings." },
    { q: "Are there any noise restrictions?", a: "Discretion is important. The incall is in a calm, private neighborhood." },
    { q: "Does {{name}} prefer conversation over activities?", a: "Both are welcome, but {{name}} truly shines in deep conversation and genuine connection." },
    { q: "What should I expect during a first meeting?", a: "A relaxed, no‑pressure atmosphere where you can be yourself." }
  ]
];

function getRandomFaqs(profile, poolCount = 4) {
  const hash = seededHash(profile.slug);
  const poolIndex = hash % faqPools.length;
  const pool = faqPools[poolIndex];
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (hash + i) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, Math.min(poolCount, shuffled.length));
  // Get a rotated landmark for the FAQ
  const landmarks = cityLandmarksList[profile.city] || ["secure location", "the area"];
  const landmark1 = landmarks[hash % landmarks.length];
  const landmark2 = landmarks[(hash + 1) % landmarks.length];
  return selected.map(faq => {
    let question = faq.q
      .replace(/{{name}}/g, profile.name)
      .replace(/{{city}}/g, profile.city)
      .replace(/{{languages}}/g, profile.languages || "English, Swahili")
      .replace(/{{landmark1}}/g, landmark1)
      .replace(/{{landmark2}}/g, landmark2);
    let answer = faq.a
      .replace(/{{name}}/g, profile.name)
      .replace(/{{city}}/g, profile.city)
      .replace(/{{languages}}/g, profile.languages || "English, Swahili")
      .replace(/{{landmark1}}/g, landmark1)
      .replace(/{{landmark2}}/g, landmark2);
    return `<div class="faq-item"><h3>${escapeHtml(question)}</h3><p>${escapeHtml(answer)}</p></div>`;
  }).join('');
}

// ---------- Service clusters ----------
const serviceClusters = {
  luxury: ["Fine Dining Companion", "Executive Social Events", "Weekend Retreats", "Luxury Travel Companion", "VIP Evenings"],
  relaxed: ["Casual Meetups", "Friendly Company", "Lounge Dates", "Conversation & Coffee", "Private Evenings"],
  massage: ["Sensual Massage", "Relaxation Sessions", "Couples Massage", "Bodywork & Touch", "Stress Relief"],
  travel: ["Airport Meetups", "Weekend Travel", "Hotel Visits", "Business Trip Companion", "Overnight Stays"],
  social: ["Dinner Dates", "Party Companion", "Event Attendance", "Social Outings", "Club Nights"]
};

function getServiceCluster(profile) {
  const hash = seededHash(profile.slug);
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

// ---------- JSON-LD (unchanged) ----------
function generateProfileJsonLd(profile, citySlug, avgRating, heroImage, currentDate, descriptionText) {
  const profileUrl = `${BASE_URL}profiles/${profile.slug}.html`;
  const cityPageUrl = `${BASE_URL}${citySlug}-escorts.html`;
  const landmark = cityLandmarksList[profile.city]?.[0] || defaultLandmark;

  const person = {
    "@type": "Person",
    "name": profile.name,
    "url": profileUrl,
    "description": descriptionText,
    "image": heroImage,
    "address": { "@type": "PostalAddress", "addressLocality": profile.city },
    "knowsLanguage": profile.languages || "English, Swahili",
    "gender": profile.gender,
    "dateModified": currentDate
  };
  if (profile.reviews?.length) {
    person.aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": avgRating.toFixed(1),
      "reviewCount": profile.reviews.length,
      "bestRating": "5",
      "worstRating": "1"
    };
    person.review = profile.reviews.map(r => ({
      "@type": "Review",
      "author": r.author,
      "datePublished": r.date,
      "reviewRating": { "@type": "Rating", "ratingValue": r.rating },
      "reviewBody": r.comment
    }));
  }

  const profilePage = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "name": `${profile.name} - ${profile.city} Escort`,
    "description": descriptionText,
    "url": profileUrl,
    "dateModified": currentDate,
    "mainEntity": person,
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": BASE_URL },
        { "@type": "ListItem", "position": 2, "name": `${profile.city} Escorts`, "item": cityPageUrl },
        { "@type": "ListItem", "position": 3, "name": profile.name, "item": profileUrl }
      ]
    },
    "primaryImageOfPage": {
      "@type": "ImageObject",
      "contentUrl": heroImage,
      "name": `${profile.name} - ${profile.city} escort`
    }
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": `Is ${profile.name} a verified escort in ${profile.city}?`,
        "acceptedAnswer": { "@type": "Answer", "text": `Yes, ${profile.name} has completed our identity verification process and is a verified companion in ${profile.city}.` }
      },
      {
        "@type": "Question",
        "name": `Where in ${profile.city} is ${profile.name} available?`,
        "acceptedAnswer": { "@type": "Answer", "text": `${profile.name} is available for incalls ${landmark}. Outcalls to reputable hotels in ${profile.city} are also welcome.` }
      },
      {
        "@type": "Question",
        "name": `Does ${profile.name} offer overnight or travel companionship?`,
        "acceptedAnswer": { "@type": "Answer", "text": `${profile.name} offers overnight stays and can accompany you on weekend getaways around ${profile.city} or Nairobi. Please discuss during booking.` }
      },
      {
        "@type": "Question",
        "name": "How does the verification and payment work?",
        "acceptedAnswer": { "@type": "Answer", "text": "You pay a small verification fee of 50 KES via M-Pesa. Once confirmed, you instantly receive the escort's full phone number." }
      }
    ]
  };

  return JSON.stringify([profilePage, faqPage], null, 2);
}

// ---------- Related blogs ----------
function getRelatedBlogsForProfile(profile) {
  if (!blogPosts.length) return '';
  const cityBlogs = blogPosts.filter(post => post.city && post.city.toLowerCase() === profile.city.toLowerCase());
  if (cityBlogs.length === 0) return '';

  const hash = seededHash(profile.slug);
  const shuffled = [...cityBlogs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (hash + i) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, 5);
  const unique = [];
  const seen = new Set();
  for (const post of selected) {
    if (!seen.has(post.slug)) {
      seen.add(post.slug);
      unique.push(post);
      if (unique.length === 3) break;
    }
  }
  const blogsHtml = unique.map(post => `
    <div class="related-blog-card">
      <a href="../blog/${post.slug}.html">
        <img src="${post.image}" alt="${escapeHtml(post.title)}" loading="lazy">
        <h3>${escapeHtml(post.title)}</h3>
      </a>
    </div>
  `).join('');

  return `
    <section class="related-blogs">
      <h2>Related Articles About ${profile.city}</h2>
      <div class="related-blogs-grid">
        ${blogsHtml}
      </div>
    </section>
  `;
}

// ---------- Footer helpers ----------
function getTopCityLinksForProfile() {
  const cities = [...new Set(profiles.map(p => p.city).filter(Boolean))];
  const sorted = cities.sort();
  return sorted.map(city => {
    const slug = slugify(city);
    return `<a href="../${slug}-escorts.html">${escapeHtml(city)} Escorts</a>`;
  }).join('\n');
}

function getTopCityLinksForRoot() {
  const cities = [...new Set(profiles.map(p => p.city).filter(Boolean))];
  const sorted = cities.sort();
  return sorted.map(city => {
    const slug = slugify(city);
    return `<a href="${slug}-escorts.html">${escapeHtml(city)} Escorts</a>`;
  }).join('\n');
}

function getRelatedProfilesForProfile(profile) {
  const sameCity = profiles.filter(p => p.city === profile.city && p.slug !== profile.slug);
  const hash = seededHash(profile.slug);
  const shuffled = [...sameCity];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (hash + i) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, 6);
  return selected.map(p => `<a href="${p.slug}.html">${escapeHtml(sanitizeName(p.name))}</a>`).join('\n');
}

// ---------- Generate profile pages ----------
console.log("\n📄 Generating profile pages...");
let profileCount = 0;
const cityGroups = {};
profiles.forEach(p => {
  if (!p.city) return;
  if (!cityGroups[p.city]) cityGroups[p.city] = [];
  cityGroups[p.city].push(p);
});

const currentDate = new Date().toISOString().split('T')[0];

// ---------- Gender term variations ----------
const genderTerms = {
  Female: ["Female", "Ladies", "Women"],
  Male: ["Male", "Gentleman", "Men"],
  Transgender: ["Transgender", "Trans", "Trans Companion"]
};

// ---------- Rich title templates ----------
const titleFormats = [
  (name, city, gender) => `${name} ${city} Escort – Verified ${gender} Companion | FineEscorts Kenya`,
  (name, city, gender) => `${name} – Premium ${city} ${gender} Escort | FineEscorts Kenya`,
  (name, city, gender) => `${name} ${city} Companion – Private & Verified | FineEscorts Kenya`,
  (name, city, gender) => `${name} – Luxury ${gender} Escort in ${city} | FineEscorts Kenya`,
  (name, city, gender) => `${name} ${city} Escort Services – VIP Companion | FineEscorts Kenya`,
  (name, city, gender) => `${name} – Independent ${city} Escort | FineEscorts Kenya`,
  (name, city, gender) => `${name} ${city} Escort – Discreet Private Companion | FineEscorts Kenya`,
  (name, city, gender) => `${name} – Call Girl in ${city} | FineEscorts Kenya`
];

function getGenderTerm(profile, variants) {
  const hash = seededHash(profile.slug);
  const index = hash % variants.length;
  return variants[index];
}

// ---------- Meta description patterns ----------
const metaPrefixes = [
  (name, city) => `Discover ${name}, an independent private companion available for upscale meetings in ${city}.`,
  (name, city) => `Looking for a verified companion in ${city}? ${name} offers premium private sessions and travel companionship.`,
  (name, city) => `${name} provides elegant companionship services in ${city}, including discreet hotel visits and dinner dates.`,
  (name, city) => `${name} is a discreet private companion available for relaxed encounters and luxury evenings in ${city}.`,
  (name, city) => `Find ${name}, a trusted ${city} companion known for genuine conversation and comfortable, judgement‑free meetups.`,
  (name, city) => `${name} is a call girl in ${city} offering private companionship, social events, and weekend getaways.`,
  (name, city) => `Experience upscale companionship with ${name} – available now for incalls and outcalls in ${city}.`,
  (name, city) => `${name} is a verified escort in ${city}, ready for dinner dates, private sessions, and travel companionship.`,
  (name, city) => `Meet ${name}, a professional companion in ${city} who values discretion, punctuality, and genuine connection.`,
  (name, city) => `${name} brings warmth and sophistication to every meeting – available for private encounters in ${city}.`,
  (name, city) => `Seeking a relaxed, down‑to‑earth companion in ${city}? ${name} is here to make your time memorable.`,
  (name, city) => `${name} offers a premium experience – from intimate evenings to social outings – in ${city}.`,
  (name, city) => `Verified and reviewed, ${name} is a top‑rated escort in ${city} ready for your booking.`,
  (name, city) => `${name} is the perfect companion for business travel, romantic dinners, or private relaxation in ${city}.`,
  (name, city) => `Discover ${name}, an elegant ${city} companion who values your privacy and satisfaction.`
];

// ---------- Loop over profiles ----------
for (const profile of profiles) {
  if (!profile.city) continue;
  const citySlug = slugify(profile.city);
  let avgRating = 0;
  if (profile.reviews?.length) avgRating = profile.reviews.reduce((s,r)=>s+r.rating,0)/profile.reviews.length;

  const maskedNumber = profile.maskedNumber || "0712***456";
  const fullNumber = profile.fullNumber || "";

  const hash = seededHash(profile.slug);
  const titleFormatIdx = hash % titleFormats.length;
  const metaPrefixIdx = Math.floor(hash / titleFormats.length) % metaPrefixes.length;

  const genderTermVariants = genderTerms[profile.gender] || [profile.gender];
  const genderTerm = getGenderTerm(profile, genderTermVariants);
  
  const title = titleFormats[titleFormatIdx](profile.name, profile.city, genderTerm);
  const metaPrefix = metaPrefixes[metaPrefixIdx](profile.name, profile.city);
  const metaDescription = `${metaPrefix} Offering premium companionship, private sessions, and luxury experiences. Book now.`;

  let finalDescription;
  if (profile.description && !isGenericDescription(profile.description)) {
    finalDescription = profile.description;
  } else {
    finalDescription = buildEnhancedDescription(profile);
  }

  // --- Personality vibe ---
  const vibeOptions = [
    "Nightlife oriented – loves clubs and social events.",
    "Quiet & intellectual – great for deep conversation and relaxed evenings.",
    "Business traveler friendly – punctual, professional, and easy to coordinate.",
    "Foodie – enjoys dinner dates and trying new restaurants.",
    "Wellness focused – offers massage, relaxation, and stress relief.",
    "Social companion – shines at parties, group events, and outings.",
    "Luxury oriented – perfect for high‑end hotels and exclusive venues.",
    "Introverted & private – values low‑key, intimate encounters."
  ];
  const vibe = vibeOptions[hash % vibeOptions.length];

  // --- Trust badges (0-2 badges, excluding duplicate with verified) ---
  const badgeOptions = [
    { name: "VIP", icon: "⭐" },
    { name: "Top Rated", icon: "🏆" },
    { name: "Premium", icon: "💎" },
    { name: "Elite", icon: "👑" },
    { name: "Recommended", icon: "👍" },
    { name: "Available Today", icon: "📅" }
  ];
  const numBadges = (Math.floor(hash / 7) % 4) % 3; // 0,1,2
  const usedNames = new Set();
  const selectedBadges = [];
  for (let i = 0; i < numBadges; i++) {
    let idx = (hash + i) % badgeOptions.length;
    let badge = badgeOptions[idx];
    if (!usedNames.has(badge.name) && badge.name !== "Verified") {
      usedNames.add(badge.name);
      selectedBadges.push(`<span>${badge.icon} ${badge.name}</span>`);
    }
  }
  const trustBadgesHtml = selectedBadges.join('\n');

  // --- Local tip (30% chance) ---
  const localTipChance = (Math.floor(hash / 13) % 100) < 30;
  let localTipHtml = '';
  if (localTipChance) {
    const landmarks = cityLandmarksList[profile.city] || ["the area"];
    const tipLandmark = landmarks[hash % landmarks.length];
    const tipPool = [
      `Popular meeting hotels in ${profile.city} include Acacia Premier and Yukos. The area is well‑connected via Namanga Road.`,
      `Many clients prefer the convenience of the ${profile.city} Expressway – easy access from Nairobi and Athiriver.`,
      `${profile.city} has several discreet lounges and restaurants perfect for a dinner date.`,
      `If you're flying in, JKIA is just 10–15 minutes from ${profile.city}.`,
      `Late‑night meetings are easier with 24‑hour security in most ${profile.city} estates.`,
      `Remember to confirm your meeting spot ahead of time – ${tipLandmark} is a popular reference point.`
    ];
    const tip = tipPool[hash % tipPool.length];
    localTipHtml = `<div class="local-tip">💡 Local tip: ${tip}</div>`;
  }

  // --- Hero image, badges, etc. ---
  const heroImage = profile.images?.[0] || "";
  const ogImage = heroImage;

  const isVip = (hash % 5) === 0;
  const vipBadge = isVip ? '<span>⭐ VIP</span>' : '';
  
  const showEthnicity = (Math.floor(hash / 5) % 2) === 0;
  const ethnicityPart = showEthnicity ? ` · ${profile.ethnicity}` : '';

  const verifiedBadge = profile.verified
    ? '<span class="verified-badge" title="ID &amp; Photo Verified"><i class="fas fa-check-circle"></i> Verified</span>'
    : '';

  const relatedBlogsHtml = getRelatedBlogsForProfile(profile);
  const faqHtml = getRandomFaqs(profile, 4);

  // ----- TRUST PLACEHOLDERS (single block) -----
  const lastUpdated = Math.floor(Math.random() * 7) + 1; // 1–7 days

  let topReviewsHtml = '';
  if (profile.reviews && profile.reviews.length > 0) {
    const topReviews = profile.reviews.slice(0, 3);
    topReviewsHtml = topReviews.map(review => `
      <div class="preview-review-item">
        <div class="preview-review-stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
        <div>"${escapeHtml(review.comment)}"</div>
        <div style="font-size:0.7rem; color:#888;">— ${escapeHtml(review.author)}</div>
      </div>
    `).join('');
  }

  const totalReviews = profile.reviews ? profile.reviews.length : 0;
  const totalSiteUnlocks = 1247; // Replace with real count later

  // Profile stats (deterministic, realistic)
  const profileViews = (hash % 5000) + 200;           // 200–5200 views
  const memberSince = new Date(Date.now() - (hash % 365) * 24 * 60 * 60 * 1000).toLocaleString('default', { month: 'long', year: 'numeric' });

 // ---- Split description ----
// ---- Split description ----
// ---- Split description ----
const descParts = splitDescription(finalDescription, 35);

// Build the bio HTML (visible preview + hidden FULL description + toggle button)
// Inside generate-profiles.js, in the loop where you build bioHtml
let bioHtml = `<div class="bio-preview" id="preview-${profile.slug}">${escapeHtml(descParts.preview)}</div>`;
if (descParts.hasMore) {
    bioHtml += `<div class="bio-full" id="full-${profile.slug}" style="display: none;">${escapeHtml(finalDescription)}</div>`;
    // ⬇️ THIS LINE CHANGED: use data-slug instead of onclick
    bioHtml += `<button class="toggle-bio-btn" data-slug="${profile.slug}">▼ Read More</button>`;
}

const context = {
    ...profile,
    baseUrl: BASE_URL,
    title: title,
    metaDescription: metaDescription,
    gallery: generateGallery(profile.images, profile.name, profile.city),
    reviews: generateReviews(profile.reviews, profile),
    services: getServiceCluster(profile),
    citySlug: citySlug,
    averageRating: avgRating,
    firstName: profile.name.split(' ')[0] || profile.name,
    lastName: profile.name.split(' ').slice(1).join(' ') || '',
    socialMedia: [],
    topCityLinks: getTopCityLinksForProfile(),
    relatedProfiles: getRelatedProfilesForProfile(profile),
    relatedBlogs: relatedBlogsHtml,
    jsonLd: generateProfileJsonLd(profile, citySlug, avgRating, heroImage, currentDate, finalDescription),
    today: currentDate,
    maskedNumber: maskedNumber,
    fullNumber: fullNumber,
    waNumber: formatWhatsAppNumber(fullNumber),  // ⬅️ ADD THIS LINE
    escortId: profile.slug.replace(/-/g, '_').toUpperCase(),
    verifiedBadge: verifiedBadge,
    vipBadge: vipBadge,
    ethnicityPart: ethnicityPart,
    heroImage: heroImage,
    ogImage: ogImage,
    bioHtml: bioHtml,
    name: sanitizeName(profile.name),
    vibe: vibe,
    trustBadgesHtml: trustBadgesHtml,
    localTipHtml: localTipHtml,
    faqHtml: faqHtml,
    lastUpdated: lastUpdated,
    topReviewsHtml: topReviewsHtml,
    totalReviews: totalReviews,
    totalSiteUnlocks: totalSiteUnlocks,
    profileViews: profileViews,
    memberSince: memberSince
};

  let page = render(profileTemplate, context);
  fs.writeFileSync(path.join(PROFILES_OUTPUT_DIR, `${profile.slug}.html`), page);
  profileCount++;
  if (profileCount % 20 === 0) console.log(`   📄 Generated ${profileCount}/${profiles.length} profiles...`);
}
console.log(`   ✅ Generated ${profileCount} profile pages`);

// ---------- Generate city pages ----------
// ---------- Generate city pages (Dynamic - ALL cities) ----------
console.log("\n🏙️ Generating city pages for all locations...");

// Get all unique cities from profiles
const allCities = [...new Set(profiles.map(p => p.city).filter(Boolean))];
let cityCount = 0;

allCities.forEach(city => {
    const citySlug = slugify(city);
    const cityProfiles = profiles.filter(p => p.city === city);
    
    let profilesHtml = "";
    for (const p of cityProfiles) {
        profilesHtml += `
            <div class="escort-card">
                <img class="escort-card-image" src="${p.images?.[0] || ''}" alt="${escapeHtml(p.name)} verified escort in ${escapeHtml(p.city)}" loading="lazy">
                <div class="escort-card-content">
                    <div class="escort-card-name">${escapeHtml(sanitizeName(p.name))}</div>
                    <div class="escort-card-location">${escapeHtml(p.city)}</div>
                    <a href="profiles/${p.slug}.html" class="view-profile-btn">View Profile</a>
                </div>
            </div>`;
    }
    
    const context = {
        baseUrl: BASE_URL,
        city: city,
        citySlug: citySlug,
        profileCount: cityProfiles.length,
        profiles: profilesHtml,
        jsonld: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "name": `${city} Escorts`,
            "description": `List of premium escort companions available in ${city}, Kenya.`,
            "url": `${BASE_URL}${citySlug}-escorts.html`,
            "numberOfItems": cityProfiles.length,
            "itemListElement": cityProfiles.map((p, idx) => ({
                "@type": "ListItem",
                "position": idx+1,
                "url": `${BASE_URL}profiles/${p.slug}.html`,
                "name": sanitizeName(p.name)
            }))
        }, null, 2),
        topCityLinks: getTopCityLinksForRoot(),
        relatedProfiles: getRelatedProfilesForProfile(cityProfiles[0])
    };
    
    const page = render(cityTemplate, context);
    fs.writeFileSync(path.join(CITY_PAGES_OUTPUT_DIR, `${citySlug}-escorts.html`), page);
    cityCount++;
    console.log(`   📄 Generated city page: ${city} (${cityProfiles.length} profiles)`);
});

console.log(`   ✅ Generated ${cityCount} city pages`);

console.log("\n" + "=".repeat(50));
console.log("✅ ALL PAGES GENERATED SUCCESSFULLY");
console.log("=".repeat(50));
console.log(`\n📊 SUMMARY:`);
console.log(`   • Total profiles: ${profiles.length}`);
console.log(`   • Profile pages: ${profileCount}`);
console.log(`   • City pages: ${cityCount}`);
console.log(`   • Cities covered: ${Object.keys(cityGroups).length}`);
