// ========== BLOG COMMON FUNCTIONALITY – FIXED FOR RELATED BLOGS ==========
(function() {
  'use strict';

  // Back to top button
  const backBtn = document.getElementById('backToTop');
  if (backBtn) {
    window.addEventListener('scroll', () => {
      backBtn.classList.toggle('show', window.scrollY > 300);
    });
    backBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Age verification
  const ageVerify = document.getElementById('age-verification');
  if (ageVerify) {
    if (sessionStorage.getItem('ageVerified') === 'true') {
      ageVerify.style.display = 'none';
    } else {
      ageVerify.style.display = 'flex';
      const enterBtn = document.getElementById('age-enter');
      if (enterBtn) {
        enterBtn.addEventListener('click', () => {
          sessionStorage.setItem('ageVerified', 'true');
          ageVerify.style.display = 'none';
        });
      }
    }
  }

  // Dynamic year in footer
  const yearSpan = document.getElementById('year');
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  // ---------- Determine current city ----------
  function detectCurrentCity() {
    // 1) Hidden span
    const citySpan = document.getElementById('currentCity');
    if (citySpan && citySpan.textContent.trim()) {
      return citySpan.textContent.trim();
    }
    // 2) Breadcrumbs
    const breadcrumbLink = document.querySelector('.breadcrumbs a[href$="-escorts.html"]');
    if (breadcrumbLink) {
      const text = breadcrumbLink.textContent.replace(' Escorts', '').trim();
      if (text) return text;
    }
    // 3) URL fallback
    const path = window.location.pathname;
    const match = path.match(/(kitengela|syokimau|mlolongo|imara[-\s]daima|athi[-\s]river)/i);
    if (match) {
      let raw = match[1].toLowerCase();
      if (raw === 'imara-daima' || raw === 'imara daima') return 'Imara Daima';
      if (raw === 'athiriver' || raw === 'athiriver') return 'Athiriver';
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return null;
  }

  const currentCity = detectCurrentCity();
  if (!currentCity) {
    console.warn('❌ Could not detect city – related content disabled');
    return;
  }
  console.log(`📍 Detected city: "${currentCity}"`);

  // Helper: shuffle array
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // ---------- Load posts.json and profiles.json ----------
  Promise.all([
    fetch('/data/posts.json').then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }).catch(err => {
      console.error('❌ Failed to load posts.json:', err);
      return [];
    }),
    fetch('/data/profiles.json').then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }).catch(err => {
      console.error('❌ Failed to load profiles.json:', err);
      return [];
    })
  ]).then(([allPosts, allProfiles]) => {
    const cityLower = currentCity.toLowerCase();
    
    // ----- Filter posts by city (category field in posts.json) -----
    console.log(`📚 Total posts loaded: ${allPosts.length}`);
    const sameCityPosts = allPosts.filter(post => {
      const postCity = post.category ? post.category.toLowerCase().trim() : '';
      return postCity === cityLower;
    });
    console.log(`📊 Found ${sameCityPosts.length} blog posts for "${currentCity}"`);
    
    // Exclude current post
    const currentSlug = window.location.pathname.split('/').pop().replace('.html', '');
    console.log(`🔗 Current slug: "${currentSlug}"`);
    const otherPosts = sameCityPosts.filter(post => post.slug !== currentSlug);
    console.log(`📊 After excluding current: ${otherPosts.length} posts`);
    
    // Log the first few post slugs for debugging
    if (otherPosts.length > 0) {
      console.log(`📋 Other post slugs: ${otherPosts.slice(0, 3).map(p => p.slug).join(', ')}`);
    }
    
    // Take 3 random related posts
    const shuffledPosts = shuffleArray(otherPosts);
    const selectedPosts = shuffledPosts.slice(0, 3);
    console.log(`🎲 Displaying ${selectedPosts.length} related posts`);
    
    // Inject related blogs
    const blogsContainer = document.querySelector('#relatedBlogs .related-blogs-grid');
    if (blogsContainer) {
      if (selectedPosts.length === 0) {
        blogsContainer.innerHTML = '<p>No related articles found.</p>';
        console.warn('⚠️ No related posts available – check posts.json category values');
      } else {
        blogsContainer.innerHTML = selectedPosts.map(post => `
          <div class="related-blog-card">
            <a href="${post.slug}.html">
              <img src="${post.image || 'https://placehold.co/800x600/1a1a1a/c9a45c?text=No+Image'}" alt="${escapeHtml(post.title)}" loading="lazy">
              <h4>${escapeHtml(post.title)}</h4>
            </a>
          </div>
        `).join('');
        console.log('✅ Related blogs injected successfully');
      }
    } else {
      console.warn('⚠️ Container #relatedBlogs .related-blogs-grid not found – check HTML');
    }
    
    // ----- Escorts section (unchanged, using profiles.json) -----
    const sameCityEscorts = allProfiles.filter(profile => {
      const profileCity = profile.city ? profile.city.toLowerCase().trim() : '';
      return profileCity === cityLower;
    });
    console.log(`📊 Found ${sameCityEscorts.length} escorts for "${currentCity}"`);
    
    const shuffledEscorts = shuffleArray(sameCityEscorts);
    const selectedEscorts = shuffledEscorts.slice(0, 4);
    
    const escortsContainer = document.querySelector('#relatedEscorts .related-escorts-grid');
    if (escortsContainer) {
      if (selectedEscorts.length === 0) {
        escortsContainer.innerHTML = '<p style="color: var(--text-muted); padding: 1rem;">No escorts listed for this area yet.</p>';
      } else {
        escortsContainer.innerHTML = selectedEscorts.map(escort => `
          <div class="escort-card-small">
            <img src="${escort.images?.[0] || ''}" alt="${escapeHtml(escort.name)}" loading="lazy">
            <h4>${escapeHtml(escort.name)}</h4>
            <p>${escapeHtml(escort.city)}</p>
            <a href="../profiles/${encodeURIComponent(escort.slug)}.html">View Profile</a>
          </div>
        `).join('');
      }
    } else {
      console.warn('⚠️ Container #relatedEscorts .related-escorts-grid not found');
    }
    
    // Update city names in CTAs
    const cityName = currentCity;
    const ctaCityName = document.getElementById('ctaCityName');
    const ctaCityLink = document.getElementById('ctaCityLink');
    const citySpans = document.querySelectorAll('.related-city-name');
    const citySlug = cityName.toLowerCase().replace(/ /g, '-');
    
    if (ctaCityName) ctaCityName.textContent = cityName;
    if (ctaCityLink) {
      ctaCityLink.textContent = `Browse ${cityName} listings →`;
      ctaCityLink.href = `../${citySlug}-escorts.html`;
    }
    citySpans.forEach(span => span.textContent = cityName);
    
  }).catch(err => {
    console.error('❌ Fatal error loading posts/profiles:', err);
  });
  
  // Simple HTML escape
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }
})();
