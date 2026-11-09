(async function() {

/* ===============================
COMMON FEATURES (Run on ALL pages)
================================ */

// ─── Hide Navbar on Scroll Down (Bulletproof) ──────────────────
(function() {
  let lastScroll = 0;
  const header = document.querySelector('.site-header');
  
  if (!header) {
    console.warn('⚠️ .site-header not found – scroll-away disabled');
    return;
  }

  console.log('✅ Scroll-away header initialized (class-based)');

  setTimeout(() => {
    header.classList.remove('hidden');
  }, 100);

  window.addEventListener('scroll', function() {
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

    if (currentScroll > lastScroll && currentScroll > 60) {
      if (!header.classList.contains('hidden')) {
        header.classList.add('hidden');
        console.log('⬆️ Header hidden');
      }
    } else {
      if (header.classList.contains('hidden')) {
        header.classList.remove('hidden');
        console.log('⬇️ Header shown');
      }
    }
    lastScroll = currentScroll;
  });
})(); 

// Back to top button
const backBtn = document.getElementById('backToTop');
if (backBtn) {
  window.addEventListener('scroll', () => {
    backBtn.style.display = window.scrollY > 300 ? "flex" : "none";
  });
  backBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ===============================
AGE VERIFICATION (18+)
================================ */
const ageVerifyOverlay = document.getElementById('age-verification');
if (ageVerifyOverlay) {
  if (sessionStorage.getItem('ageVerified') !== 'true') {
    ageVerifyOverlay.style.display = 'flex';
    const enterBtn = document.getElementById('age-enter');
    if (enterBtn) {
      enterBtn.addEventListener('click', () => {
        sessionStorage.setItem('ageVerified', 'true');
        ageVerifyOverlay.style.display = 'none';
      });
    }
  } else {
    ageVerifyOverlay.style.display = 'none';
  }
}

/* ===============================
INDEX PAGE ONLY – check for profile grid
================================ */
const profileGrid = document.getElementById('profileGrid');
if (!profileGrid) {
  console.log('ℹ️ Not on index page – profile features skipped');
  return;
}

/* ===============================
GLOBAL STATE
================================ */
let allProfiles = [];
let filteredProfiles = [];
let currentPage = 1;
const profilesPerPage = 24;
let rotationIntervals = [];

/* ===============================
LOAD PROFILES
================================ */
async function loadProfiles() {
    try {
        const res = await fetch('/api/profiles');
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        allProfiles = await res.json();
        filteredProfiles = [...allProfiles];
        populateCityFilter(allProfiles);
        renderProfiles();
        renderPagination();
    } catch (err) {
        console.error("Failed to load profiles from API:", err);
        fallbackToStatic();
    }
}

async function fallbackToStatic() {
    try {
        const res = await fetch("data/profiles.json");
        allProfiles = await res.json();
        filteredProfiles = [...allProfiles];
        populateCityFilter(allProfiles);
        renderProfiles();
        renderPagination();
    } catch (err) {
        profileGrid.innerHTML = '<div class="error-message">Failed to load profiles. Please refresh the page.</div>';
    }
}

/* ===============================
HELPERS
================================ */
// Extract a clean list of image URLs from a profile.
// Prefers `photos` (new profiles), falls back to `images` (older).
// Filters out null/empty entries so we never try to load an empty src.
function getImageUrls(profile) {
    const photos = Array.isArray(profile.photos) ? profile.photos.filter(Boolean) : [];
    if (photos.length > 0) return photos;
    const images = Array.isArray(profile.images) ? profile.images.filter(Boolean) : [];
    return images;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        switch (m) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#039;';
            default: return m;
        }
    });
}

/* ===============================
RENDER PROFILES
================================ */
function renderProfiles() {
  profileGrid.innerHTML = "";

  const start = (currentPage - 1) * profilesPerPage;
  const end = start + profilesPerPage;
  const visibleProfiles = filteredProfiles.slice(start, end);

  visibleProfiles.forEach(profile => {
    if (!profile) return;

    const card = document.createElement("div");
    card.className = "profile-card";

    const imageUrls = getImageUrls(profile);
    const profileImage = imageUrls[0] || '';

    const verifiedBadge = profile.verified
      ? '<div class="verified-badge" title="ID &amp; Photo Verified"><i class="fas fa-check-circle"></i> Verified</div>'
      : '';

    // Note: no inline `background-image` anymore.
    // The preloader in initLazyImages() sets it after a successful load,
    // and shows a fallback if the URL fails. This prevents broken cards.
    card.innerHTML = `
      <div class="card-image" data-images='${JSON.stringify(imageUrls)}'>
        <div class="image-layer"
             data-src="${profileImage}"
             style="opacity:1; background-color:#1a1a1a; background-size:cover; background-position:center;"></div>
      </div>
      ${verifiedBadge}
      <div class="card-content">
        <div class="escort-info">
          <div class="escort-name">${escapeHtml(profile.name)}</div>
          <div class="escort-location">${escapeHtml(profile.city)}</div>
        </div>
        <a href="profiles/${profile.slug}.html" class="view-profile">View Profile</a>
      </div>
    `;

    profileGrid.appendChild(card);
  });

  setupImageLayers();
  initLazyImages();
  startRotation();
}

/* ===============================
POPULATE CITY FILTER (Dynamic)
================================ */
function populateCityFilter(profiles) {
    const cityFilter = document.getElementById('cityFilter');
    if (!cityFilter) return;

    const cities = [...new Set(profiles.map(p => p.city).filter(Boolean))].sort();

    const defaultOption = cityFilter.querySelector('option[value=""]');
    cityFilter.innerHTML = '';
    if (defaultOption) cityFilter.appendChild(defaultOption);

    cities.forEach(city => {
        const option = document.createElement('option');
        option.value = city;
        option.textContent = city;
        cityFilter.appendChild(option);
    });

    console.log(`📍 Loaded ${cities.length} cities into filter`);
}

/* ===============================
PAGINATION
================================ */
function renderPagination() {
  const container = document.getElementById("pagination");
  if (!container) return;
  container.innerHTML = "";

  const pageCount = Math.ceil(filteredProfiles.length / profilesPerPage);
  if (pageCount <= 1) return;

  for (let i = 1; i <= pageCount; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    if (i === currentPage) btn.classList.add("active");
    btn.addEventListener('click', () => {
      currentPage = i;
      renderProfiles();
      renderPagination();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    container.appendChild(btn);
  }
}

/* ===============================
FILTERING
================================ */
function filterProfiles() {
  const search = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  const city = document.getElementById('cityFilter')?.value || '';
  const companionType = document.getElementById('companionFilter')?.value || '';
  const service = document.getElementById('serviceFilter')?.value || '';

  filteredProfiles = allProfiles.filter(profile => {
    if (!profile) return false;

    let searchMatch = true;
    if (search) {
      const searchableText = [
        profile.name || '',
        profile.city || '',
        profile.gender || '',
        profile.description || ''
      ].join(' ').toLowerCase();
      searchMatch = searchableText.includes(search);
    }

    const cityMatch = !city || profile.city === city;

    let typeMatch = false;
    if (companionType === "") {
      typeMatch = true;
    } else if (["Female", "Male", "Transgender", "Couple"].includes(companionType)) {
      typeMatch = profile.gender === companionType;
    } else if (companionType === "VIP") {
      typeMatch = profile.vip === true;
    } else if (companionType === "Available") {
      typeMatch = profile.available_today === true;
    }

    const serviceMatch = !service || (profile.services && profile.services.includes(service));

    return searchMatch && cityMatch && typeMatch && serviceMatch;
  });

  currentPage = 1;
  renderProfiles();
  renderPagination();
}

/* ===============================
IMAGE LAYERS (rotation)
================================ */
function setupImageLayers() {
  document.querySelectorAll('.profile-card').forEach(card => {
    const imageContainer = card.querySelector('.card-image');
    if (!imageContainer) return;

    try {
      const images = JSON.parse(imageContainer.dataset.images || '[]');
      if (images && images.length > 1) {
        images.slice(1).forEach(src => {
          if (!src) return;
          const layer = document.createElement("div");
          layer.className = "image-layer";
          layer.dataset.src = src;
          layer.style.opacity = "0";
          layer.style.backgroundSize = "cover";
          layer.style.backgroundPosition = "center";
          layer.style.backgroundColor = "#1a1a1a";
          imageContainer.appendChild(layer);
        });
      }
    } catch (e) {
      console.warn('Failed to parse image list for card:', e.message);
    }
  });
}

/* ===============================
LAZY LOAD IMAGES (with preload + fallback)
================================ */
// For each .image-layer with a data-src:
//  1. Only trigger when scrolled into view (IntersectionObserver)
//  2. Preload via new Image() with referrerPolicy='no-referrer'
//     → bypasses hotlink protection on remote image hosts
//  3. On success, set background-image
//  4. On error, show 'Image unavailable' placeholder (or hide silently
//     for non-primary rotation layers so they don't flash during rotation)
function initLazyImages() {
  const layers = document.querySelectorAll('.image-layer[data-src]');
  if (!layers.length) return;

  const showImageFallback = (el) => {
    el.style.backgroundImage = 'none';
    el.style.backgroundColor = '#1a1a1a';
    el.dataset.failed = 'true';

    const card = el.closest('.profile-card');
    const isPrimary = card && el === card.querySelector('.image-layer');

    if (isPrimary) {
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.color = '#555';
      el.style.fontSize = '12px';
      el.style.textAlign = 'center';
      el.textContent = 'Image unavailable';
    } else {
      // Rotation layers: just hide, don't show a placeholder
      el.style.opacity = '0';
    }
  };

  const loadLayer = (el) => {
    const url = el.dataset.src;
    delete el.dataset.src;

    if (!url) {
      showImageFallback(el);
      return;
    }

    const preloader = new Image();
    preloader.referrerPolicy = 'no-referrer';
    preloader.onload = () => {
      el.style.backgroundImage = `url('${url}')`;
      el.dataset.loaded = 'true';
    };
    preloader.onerror = () => {
      showImageFallback(el);
    };
    preloader.src = url;
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          loadLayer(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '200px' });

    layers.forEach(el => observer.observe(el));
  } else {
    // Fallback for very old browsers
    layers.forEach(loadLayer);
  }
}

/* ===============================
IMAGE ROTATION
================================ */
function startRotation() {
  rotationIntervals.forEach(clearInterval);
  rotationIntervals = [];

  document.querySelectorAll(".profile-card").forEach(card => {
    const layers = card.querySelectorAll(".image-layer");
    if (layers.length <= 1) return;

    const primary = layers[0];
    let current = 0;

    const intervalId = setInterval(() => {
      // If the primary image failed, stop rotating this card entirely
      // (keeps the "Image unavailable" placeholder stable)
      if (primary.dataset.failed === 'true') {
        clearInterval(intervalId);
        return;
      }

      // Skip failed rotation layers — never show them
      const visibleLayers = Array.from(layers).filter(
        l => l.dataset.failed !== 'true'
      );
      if (visibleLayers.length <= 1) return;

      const curLayer = visibleLayers[current % visibleLayers.length];
      if (curLayer) curLayer.style.opacity = '0';

      current = (current + 1) % visibleLayers.length;

      const nextLayer = visibleLayers[current];
      if (nextLayer) nextLayer.style.opacity = '1';
    }, 3000);

    rotationIntervals.push(intervalId);
  });
}

/* ===============================
RESET FILTERS
================================ */
function resetFilters() {
  const searchInput = document.getElementById('searchInput');
  const cityFilter = document.getElementById('cityFilter');
  const companionFilter = document.getElementById('companionFilter');
  const serviceFilter = document.getElementById('serviceFilter');

  if (searchInput) searchInput.value = '';
  if (cityFilter) cityFilter.value = '';
  if (companionFilter) companionFilter.value = '';
  if (serviceFilter) serviceFilter.value = '';

  filteredProfiles = [...allProfiles];
  currentPage = 1;
  renderProfiles();
  renderPagination();
}

/* ===============================
ATTACH EVENT LISTENERS
================================ */
document.getElementById('searchInput')?.addEventListener('input', filterProfiles);

document.getElementById('cityFilter')?.addEventListener('change', function() {
    const city = this.value;
    if (city) {
        const slug = city.toLowerCase().replace(/ /g, '-');
        window.location.href = `/${slug}-escorts.html`;
    }
});

document.getElementById('companionFilter')?.addEventListener('change', filterProfiles);
document.getElementById('serviceFilter')?.addEventListener('change', filterProfiles);
document.getElementById('resetFiltersBtn')?.addEventListener('click', resetFilters);

/* ===============================
START
================================ */
loadProfiles();

})();