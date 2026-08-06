(async function() {

/* ===============================
COMMON FEATURES
================================ */

// Back to top button
const backBtn = document.getElementById('backToTop')
if (backBtn) {
  window.addEventListener('scroll', () => {
    backBtn.style.display = window.scrollY > 300 ? "flex" : "none"
  })
  backBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

/* ===============================
AGE VERIFICATION (18+)
================================ */
const ageVerifyOverlay = document.getElementById('age-verification');
if (ageVerifyOverlay) {
  if (sessionStorage.getItem('ageVerified') === 'true') {
    ageVerifyOverlay.style.display = 'none';
  } else {
    ageVerifyOverlay.style.display = 'flex';
    const enterBtn = document.getElementById('age-enter');
    if (enterBtn) {
      enterBtn.addEventListener('click', () => {
        sessionStorage.setItem('ageVerified', 'true');
        ageVerifyOverlay.style.display = 'none';
      });
    }
  }
}

/* ===============================
INDEX PAGE ONLY – check for profile grid
================================ */
const profileGrid = document.getElementById('profileGrid')
if (!profileGrid) {
  return
}

/* ===============================
GLOBAL STATE (index only)
================================ */
let allProfiles = []
let filteredProfiles = []
let currentPage = 1
const profilesPerPage = 24
let rotationIntervals = []

/* ===============================
LOAD PROFILES
================================ */
async function loadProfiles() {
  try {
    const res = await fetch("data/profiles.json")
    if (!res.ok) throw new Error(`HTTP error ${res.status}`)
    allProfiles = await res.json()
    console.log(`✅ Loaded ${allProfiles.length} Kenyan escort profiles`)
    filteredProfiles = [...allProfiles]
    renderProfiles()
    renderPagination()
  } catch (err) {
    console.error("Failed to load profiles:", err)
    profileGrid.innerHTML = '<div class="error-message">Failed to load profiles. Please refresh the page.</div>'
  }
}

/* ===============================
RENDER PROFILES (NO RATES - KENYA VERSION)
================================ */
function renderProfiles() {
  profileGrid.innerHTML = ""

  const start = (currentPage - 1) * profilesPerPage
  const end = start + profilesPerPage
  const visibleProfiles = filteredProfiles.slice(start, end)

  visibleProfiles.forEach(profile => {
    if (!profile) return

    const card = document.createElement("div")
    card.className = "profile-card"

    const profileImage = profile.images && profile.images.length > 0 
      ? profile.images[0] 
      : "https://via.placeholder.com/400x500?text=No+Image"

    card.innerHTML = `
      <div class="card-image" data-images='${JSON.stringify(profile.images || [])}'>
        <div class="image-layer lazy-image"
             data-src="${profileImage}"
             style="opacity:1; background-image: url('${profileImage}'); background-size: cover; background-position: center;">
        </div>
      </div>
      <div class="card-content">
        <div class="escort-info">
          <div class="escort-name">${escapeHtml(profile.name)}</div>
          <div class="escort-location">${escapeHtml(profile.city)}</div>
        </div>
        <div class="action-row">
          <a href="profiles/${profile.slug}.html" class="view-profile">View Profile</a>
        </div>
      </div>
    `

    profileGrid.appendChild(card)
  })

  setupImageLayers()
  initLazyImages()
  startRotation()
}

function escapeHtml(str) {
  if (!str) return ''
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;'
    if (m === '<') return '&lt;'
    if (m === '>') return '&gt;'
    return m
  })
}

/* ===============================
PAGINATION
================================ */
function renderPagination() {
  const container = document.getElementById("pagination")
  if (!container) return
  container.innerHTML = ""

  const pageCount = Math.ceil(filteredProfiles.length / profilesPerPage)
  if (pageCount <= 1) return

  for (let i = 1; i <= pageCount; i++) {
    const btn = document.createElement("button")
    btn.textContent = i
    if (i === currentPage) btn.classList.add("active")
    btn.onclick = () => {
      currentPage = i
      renderProfiles()
      renderPagination()
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
    container.appendChild(btn)
  }
}

/* ===============================
FILTERING – NO PRICE FILTER (Kenya Version)
================================ */
function filterProfiles() {
  const search = document.getElementById('searchInput')?.value.toLowerCase().trim() || ''
  const city = document.getElementById('cityFilter')?.value || ''
  const companionType = document.getElementById('companionFilter')?.value || ''
  const service = document.getElementById('serviceFilter')?.value || ''

  filteredProfiles = allProfiles.filter(profile => {
    if (!profile) return false

    // Search match
    let searchMatch = true
    if (search) {
      const searchableText = [
        profile.name || '',
        profile.city || '',
        profile.gender || '',
        profile.description || ''
      ].join(' ').toLowerCase()
      searchMatch = searchableText.includes(search)
    }

    // City filter
    const cityMatch = !city || profile.city === city

    // Companion type filter
    let typeMatch = false
    if (companionType === "") {
      typeMatch = true
    } else if (["Female", "Male", "Transgender", "Couple"].includes(companionType)) {
      typeMatch = profile.gender === companionType
    } else if (companionType === "VIP") {
      typeMatch = profile.vip === true
    } else if (companionType === "Available") {
      typeMatch = profile.available_today === true
    }

    // Service filter
    const serviceMatch = !service || (profile.services && profile.services.includes(service))

    return searchMatch && cityMatch && typeMatch && serviceMatch
  })

  currentPage = 1
  renderProfiles()
  renderPagination()
}

/* ===============================
CREATE IMAGE LAYERS
================================ */
function setupImageLayers() {
  document.querySelectorAll('.profile-card').forEach(card => {
    const imageContainer = card.querySelector('.card-image')
    if (!imageContainer) return
    try {
      const images = JSON.parse(imageContainer.dataset.images || '[]')
      if (images && images.length > 1) {
        images.slice(1).forEach(src => {
          const layer = document.createElement("div")
          layer.className = "image-layer lazy-image"
          layer.dataset.src = src
          layer.style.opacity = "0"
          imageContainer.appendChild(layer)
        })
      }
    } catch(e) {}
  })
}

/* ===============================
LAZY LOAD IMAGES
================================ */
function initLazyImages() {
  const lazyImages = document.querySelectorAll(".lazy-image")
  if (!lazyImages.length) return
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target
        if (el.dataset.src) {
          el.style.backgroundImage = `url('${el.dataset.src}')`
          delete el.dataset.src
        }
        obs.unobserve(el)
      }
    })
  }, { rootMargin: "200px" })
  lazyImages.forEach(img => observer.observe(img))
}

/* ===============================
IMAGE ROTATION
================================ */
function startRotation() {
  rotationIntervals.forEach(clearInterval)
  rotationIntervals = []
  document.querySelectorAll(".profile-card").forEach(card => {
    const layers = card.querySelectorAll(".image-layer")
    if (layers.length <= 1) return
    let current = 0
    const intervalId = setInterval(() => {
      layers[current].style.opacity = "0"
      current = (current + 1) % layers.length
      layers[current].style.opacity = "1"
    }, 3000)
    rotationIntervals.push(intervalId)
  })
}

/* ===============================
RESET FILTERS
================================ */
function resetFilters() {
  const searchInput = document.getElementById('searchInput')
  const cityFilter = document.getElementById('cityFilter')
  const companionFilter = document.getElementById('companionFilter')
  const serviceFilter = document.getElementById('serviceFilter')
  
  if (searchInput) searchInput.value = ''
  if (cityFilter) cityFilter.value = ''
  if (companionFilter) companionFilter.value = ''
  if (serviceFilter) serviceFilter.value = ''
  
  filteredProfiles = [...allProfiles]
  currentPage = 1
  renderProfiles()
  renderPagination()
}

/* ===============================
ATTACH EVENT LISTENERS
================================ */
const searchInput = document.getElementById('searchInput')
if (searchInput) searchInput.addEventListener('input', filterProfiles)

const cityFilter = document.getElementById('cityFilter')
if (cityFilter) cityFilter.addEventListener('change', filterProfiles)

const companionFilter = document.getElementById('companionFilter')
if (companionFilter) companionFilter.addEventListener('change', filterProfiles)

const serviceFilter = document.getElementById('serviceFilter')
if (serviceFilter) serviceFilter.addEventListener('change', filterProfiles)

const resetBtn = document.getElementById('resetFiltersBtn')
if (resetBtn) resetBtn.addEventListener('click', resetFilters)

/* ===============================
START
================================ */
loadProfiles()

})()
