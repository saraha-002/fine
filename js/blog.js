// ========== BLOG PAGE – FineEscorts Kenya Edition ==========
(function() {
  // ---------- Configuration ----------
  const DEFAULT_IMAGE = 'https://placehold.co/600x400/1a1a1a/c9a45c?text=No+Image';
  let allPosts = [];
  let currentCategory = 'all';
  let currentPage = 1;
  const postsPerPage = 12;
  let isLoading = false;

  // Helper to escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  // Get valid image URL
  function getValidImageUrl(url) {
    if (!url || url === '' || url.includes('placeholder')) return DEFAULT_IMAGE;
    return url;
  }

  // Format date (YYYY-MM-DD to "25 May 2025")
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Update category counts in sidebar
  function updateCategoryCounts() {
    const counts = {
      kitengela: 0, syokimau: 0, mlolongo: 0, 'imara daima': 0, 'athiriver': 0
    };
    for (const post of allPosts) {
      const cat = post.category;
      if (counts[cat] !== undefined) counts[cat]++;
    }
    document.getElementById('kitengelaCount') && (document.getElementById('kitengelaCount').textContent = counts.kitengela);
    document.getElementById('syokimauCount') && (document.getElementById('syokimauCount').textContent = counts.syokimau);
    document.getElementById('mlolongoCount') && (document.getElementById('mlolongoCount').textContent = counts.mlolongo);
    document.getElementById('imaraDaimaCount') && (document.getElementById('imaraDaimaCount').textContent = counts['imara daima']);
    document.getElementById('athiRiverCount') && (document.getElementById('athiRiverCount').textContent = counts['athiriver']);
  }

  // Render blog grid and pagination
  function renderPosts() {
    let filtered = allPosts;
    if (currentCategory !== 'all') {
      filtered = allPosts.filter(p => p.category === currentCategory);
    }
    const totalPages = Math.ceil(filtered.length / postsPerPage);
    const start = (currentPage - 1) * postsPerPage;
    const paginated = filtered.slice(start, start + postsPerPage);
    const blogGrid = document.getElementById('blogGrid');
    const paginationDiv = document.getElementById('pagination');

    if (paginated.length === 0) {
      blogGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px;">
        <i class="fas fa-newspaper" style="font-size:48px; color:var(--gold); opacity:0.5; margin-bottom:20px;"></i>
        <h3>No posts found</h3>
      </div>`;
      paginationDiv.style.display = 'none';
      return;
    }

    blogGrid.innerHTML = paginated.map(post => `
      <a href="blog/${post.slug}.html" class="blog-card">
        <img src="${getValidImageUrl(post.image)}" alt="${escapeHtml(post.title)}" class="blog-image" loading="lazy">
        <div class="blog-content">
          <span class="blog-category">${(post.category || '').toUpperCase()}</span>
          <h3 class="blog-title">${escapeHtml(post.title)}</h3>
          <p class="blog-excerpt">${escapeHtml((post.excerpt || '').substring(0, 120))}${(post.excerpt || '').length > 120 ? '...' : ''}</p>
          <div class="blog-meta">
            <span><i class="far fa-calendar-alt"></i> ${formatDate(post.date)}</span>
            <span><i class="far fa-clock"></i> ${post.readTime || '5 min read'}</span>
            <span class="read-more">Read More <i class="fas fa-arrow-right"></i></span>
          </div>
        </div>
      </a>
    `).join('');

    // Pagination
    if (totalPages <= 1) {
      paginationDiv.style.display = 'none';
      return;
    }
    let paginationHtml = '';
    if (currentPage > 1) paginationHtml += `<a href="#" class="page-link" data-page="${currentPage-1}"><i class="fas fa-chevron-left"></i></a>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i >= currentPage-2 && i <= currentPage+2) {
        paginationHtml += `<a href="#" class="page-link ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</a>`;
      } else if (i === 1 || i === totalPages) {
        paginationHtml += `<a href="#" class="page-link" data-page="${i}">${i}</a>`;
      } else if (i === currentPage-3 || i === currentPage+3) {
        paginationHtml += `<span class="page-dots">...</span>`;
      }
    }
    if (currentPage < totalPages) paginationHtml += `<a href="#" class="page-link" data-page="${currentPage+1}"><i class="fas fa-chevron-right"></i></a>`;
    paginationDiv.innerHTML = paginationHtml;
    paginationDiv.style.display = 'flex';
  }

  // Load posts from JSON
  async function loadPosts() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const blogGrid = document.getElementById('blogGrid');
    try {
      const res = await fetch('/data/posts.json');
      if (!res.ok) throw new Error('Failed to load posts');
      allPosts = await res.json();
      console.log(`✅ Loaded ${allPosts.length} blog posts`);
      loadingSpinner.style.display = 'none';
      blogGrid.style.display = 'grid';
      updateCategoryCounts();
      renderPosts();
    } catch (error) {
      console.error('Error loading posts:', error);
      loadingSpinner.innerHTML = `<div style="text-align:center;"><i class="fas fa-exclamation-circle" style="font-size:48px;color:var(--gold);margin-bottom:20px;"></i><h3>Unable to load blog posts</h3><p>Please refresh the page.</p></div>`;
    }
  }

  // ---------- PAGINATION EVENT HANDLER (FIX) ----------
  function initPagination() {
    const paginationDiv = document.getElementById('pagination');
    if (!paginationDiv) return;
    paginationDiv.addEventListener('click', (e) => {
      const link = e.target.closest('.page-link');
      if (!link) return;
      e.preventDefault();
      const page = parseInt(link.dataset.page);
      if (isNaN(page) || page === currentPage) return;
      currentPage = page;
      renderPosts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Category filter buttons
  function initFilters() {
    const categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        categoryBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.dataset.category;
        currentPage = 1;
        renderPosts();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    const categoryLinks = document.querySelectorAll('#categoryList a');
    categoryLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const cat = link.dataset.category;
        categoryBtns.forEach(btn => {
          if (btn.dataset.category === cat) btn.click();
        });
      });
    });
  }

  // Search functionality
  function initSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    let timeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const term = e.target.value.toLowerCase().trim();
        if (term === '') {
          renderPosts();
          return;
        }
        let filtered = allPosts;
        if (currentCategory !== 'all') filtered = filtered.filter(p => p.category === currentCategory);
        const searched = filtered.filter(p => p.title.toLowerCase().includes(term) || (p.excerpt && p.excerpt.toLowerCase().includes(term)));
        const blogGrid = document.getElementById('blogGrid');
        const paginationDiv = document.getElementById('pagination');
        if (searched.length === 0) {
          blogGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;"><i class="fas fa-search" style="font-size:48px;color:var(--gold);opacity:0.5;margin-bottom:20px;"></i><h3>No results for "${escapeHtml(term)}"</h3></div>`;
          paginationDiv.style.display = 'none';
        } else {
          const sliced = searched.slice(0, postsPerPage);
          blogGrid.innerHTML = sliced.map(post => `
            <a href="blog/${post.slug}.html" class="blog-card">
              <img src="${getValidImageUrl(post.image)}" alt="${escapeHtml(post.title)}" class="blog-image" loading="lazy">
              <div class="blog-content">
                <span class="blog-category">${(post.category || '').toUpperCase()}</span>
                <h3 class="blog-title">${escapeHtml(post.title)}</h3>
                <p class="blog-excerpt">${escapeHtml((post.excerpt || '').substring(0, 120))}...</p>
                <div class="blog-meta">
                  <span><i class="far fa-calendar-alt"></i> ${formatDate(post.date)}</span>
                  <span><i class="far fa-clock"></i> ${post.readTime || '5 min'}</span>
                  <span class="read-more">Read More <i class="fas fa-arrow-right"></i></span>
                </div>
              </div>
            </a>
          `).join('');
          paginationDiv.style.display = 'none';
        }
      }, 300);
    });
  }

  // Mobile menu (if your HTML has .hamburger)
  function initMobileMenu() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.querySelector('.nav-links');
    const overlay = document.getElementById('menuOverlay');
    if (!hamburger) return;
    function closeMenu() {
      navMenu.classList.remove('active');
      hamburger.classList.remove('active');
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
    function openMenu() {
      navMenu.classList.add('active');
      hamburger.classList.add('active');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (navMenu.classList.contains('active')) closeMenu();
      else openMenu();
    });
    overlay.addEventListener('click', closeMenu);
    document.querySelectorAll('.nav-links a').forEach(link => link.addEventListener('click', closeMenu));
  }

  // Popular posts (top 3 by views – you can update views manually in posts.json)
  function renderPopularPosts() {
    const popular = [...allPosts].sort((a,b) => (b.views || 0) - (a.views || 0)).slice(0,3);
    const container = document.getElementById('popularPosts');
    if (!container) return;
    if (popular.length === 0) { container.innerHTML = '<p>No posts yet</p>'; return; }
    container.innerHTML = popular.map(post => `
      <a href="blog/${post.slug}.html" class="popular-post">
        <img src="${getValidImageUrl(post.image)}" alt="${escapeHtml(post.title)}" loading="lazy">
        <div>
          <h4>${escapeHtml(post.title.length > 50 ? post.title.substring(0,50)+'...' : post.title)}</h4>
          <p>${formatDate(post.date)} · ${post.readTime || '5 min'}</p>
        </div>
      </a>
    `).join('');
  }

  // Initialize everything
  document.addEventListener('DOMContentLoaded', async () => {
    initMobileMenu();
    await loadPosts();
    initFilters();
    initSearch();
    initPagination();          // ← ADDED: enables pagination clicks
    renderPopularPosts();

    // Dynamic year in footer
    const yearSpan = document.getElementById('year');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
  });
})();
