const fs = require("fs");
const path = require("path");

const TEMPLATE_DIR = path.join(__dirname, "templates");
const DATA_FILE = path.join(__dirname, "data", "profiles.json");
const OUTPUT_FILE = path.join(__dirname, "reviews.html");

const reviewsPerPage = 20;

// Load template and data
const template = fs.readFileSync(path.join(TEMPLATE_DIR, "reviews-template.html"), "utf8");
const profiles = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

console.log(`📚 Loaded ${profiles.length} Kenyan escort profiles`);

// Collect all reviews with profile context
let allReviews = [];
profiles.forEach(profile => {
  if (!profile.reviews || profile.reviews.length === 0) return;
  profile.reviews.forEach(review => {
    allReviews.push({
      profileName: profile.name,
      profileSlug: profile.slug,
      profileCity: profile.city,
      rating: review.rating,
      author: review.author,
      comment: review.comment,
      date: review.date,
    });
  });
});

// Sort by date (newest first)
allReviews.sort((a, b) => new Date(b.date) - new Date(a.date));

// Calculate overall stats
const totalReviews = allReviews.length;
const averageRating = totalReviews > 0
  ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
  : 0;

// Rating distribution
const ratingCounts = {1:0, 2:0, 3:0, 4:0, 5:0};
allReviews.forEach(r => ratingCounts[r.rating]++);

// Calculate percentages (as integers)
const ratingPercent = {};
for (let i = 1; i <= 5; i++) {
  ratingPercent[i] = totalReviews > 0 ? Math.round((ratingCounts[i] / totalReviews) * 100) : 0;
}

// Escape HTML helper
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Format date for Kenyan display
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Paginate reviews
const pageCount = Math.ceil(totalReviews / reviewsPerPage);
let pagesHtml = [];

for (let page = 1; page <= pageCount; page++) {
  const start = (page - 1) * reviewsPerPage;
  const end = start + reviewsPerPage;
  const pageReviews = allReviews.slice(start, end);

  let reviewsHtml = "";
  pageReviews.forEach(r => {
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    const formattedDate = formatDate(r.date);
    reviewsHtml += `
      <div class="review-card">
        <div class="review-header">
          <div class="reviewer-info">
            <strong class="profile-name"><a href="profiles/${r.profileSlug}.html">${escapeHtml(r.profileName)}</a></strong>
            <span class="profile-city">${escapeHtml(r.profileCity)}</span>
          </div>
          <div class="review-rating">${stars}</div>
        </div>
        <div class="review-comment">“${escapeHtml(r.comment)}”</div>
        <div class="review-footer">
          <span class="review-author">— Verified client</span>
          <span class="review-date">${formattedDate}</span>
        </div>
      </div>
    `;
  });

  pagesHtml.push(`
    <div class="reviews-page" data-page="${page}" style="${page === 1 ? 'display: block;' : 'display: none;'}">
      <div class="reviews-grid">
        ${reviewsHtml}
      </div>
    </div>
  `);
}

// Pagination buttons HTML
let paginationHtml = '';
if (pageCount > 1) {
  let pageNumbersHtml = '';
  for (let i = 1; i <= pageCount; i++) {
    pageNumbersHtml += `<button class="page-num ${i === 1 ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  paginationHtml = `
    <div class="pagination-controls">
      <button class="page-prev" disabled>← Prev</button>
      <div class="page-numbers">
        ${pageNumbersHtml}
      </div>
      <button class="page-next">Next →</button>
    </div>
  `;
}

// Generate JSON-LD structured data for reviews
const reviewsList = allReviews.slice(0, 10).map(r => ({
  "@type": "Review",
  "author": r.author,
  "datePublished": r.date,
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": r.rating,
    "bestRating": "5"
  },
  "reviewBody": r.comment,
  "itemReviewed": {
    "@type": "Person",
    "name": r.profileName,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": r.profileCity
    }
  }
}));

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Client Reviews - FineEscorts Kenya",
  "description": `Verified client reviews for escorts in Kenya. ${totalReviews} authentic testimonials.`,
  "numberOfItems": totalReviews,
  "itemListElement": reviewsList.map((review, idx) => ({
    "@type": "ListItem",
    "position": idx + 1,
    "item": review
  })),
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": parseFloat(averageRating),
    "reviewCount": totalReviews,
    "bestRating": "5",
    "worstRating": "1"
  }
};

// Render template
const context = {
  totalReviews: totalReviews,
  averageRating: averageRating,
  ratingPercent5: ratingPercent[5],
  ratingPercent4: ratingPercent[4],
  ratingPercent3: ratingPercent[3],
  ratingPercent2: ratingPercent[2],
  ratingPercent1: ratingPercent[1],
  ratingCount5: ratingCounts[5],
  ratingCount4: ratingCounts[4],
  ratingCount3: ratingCounts[3],
  ratingCount2: ratingCounts[2],
  ratingCount1: ratingCounts[1],
  reviewsHtml: pagesHtml.join('\n'),
  paginationHtml: paginationHtml,
  reviewsList: JSON.stringify(reviewsList),
  jsonld: JSON.stringify(jsonLd, null, 2)
};

// Simple string replacement
let page = template;
Object.keys(context).forEach(key => {
  const regex = new RegExp(`{{${key}}}`, 'g');
  page = page.replace(regex, context[key]);
});

// Also handle conditional JSON-LD insertion if the template has {{#if reviewsList}}
if (page.includes('{{#if reviewsList}}')) {
  page = page.replace('{{#if reviewsList}}', '');
  page = page.replace('{{/if}}', '');
}

// Write output
fs.writeFileSync(OUTPUT_FILE, page);
console.log(`\n✅ Reviews page generated successfully!`);
console.log(`📊 Statistics:`);
console.log(`   • Total reviews: ${totalReviews}`);
console.log(`   • Average rating: ${averageRating} ★`);
console.log(`   • Pages: ${pageCount}`);
console.log(`   • Reviews per page: ${reviewsPerPage}`);
console.log(`\n⭐ Rating Distribution:`);
console.log(`   • 5 stars: ${ratingCounts[5]} reviews (${ratingPercent[5]}%)`);
console.log(`   • 4 stars: ${ratingCounts[4]} reviews (${ratingPercent[4]}%)`);
console.log(`   • 3 stars: ${ratingCounts[3]} reviews (${ratingPercent[3]}%)`);
console.log(`   • 2 stars: ${ratingCounts[2]} reviews (${ratingPercent[2]}%)`);
console.log(`   • 1 star:  ${ratingCounts[1]} reviews (${ratingPercent[1]}%)`);
console.log(`\n📁 Output file: ${OUTPUT_FILE}`);
