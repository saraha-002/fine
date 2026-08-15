// ─── Admin Dashboard Script ──────────────────────────────────────

const API_BASE = window.location.origin;
let currentSection = 'dashboard';
let allProfiles = [];
let isLoadingProfiles = false;
let isRendering = false;

// ─── Pagination Variables ──────────────────────────────────────
let currentPage = 1;
let itemsPerPage = 20;
let filteredProfiles = [];
let currentFilter = 'all';

// ─── Debounce Helper ──────────────────────────────────────────────
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ─── Fallback Image Data URI ──────────────────────────────────────
const FALLBACK_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"%3E%3Crect width="40" height="40" fill="%23333"/%3E%3Ctext x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="%23888" font-size="14" font-family="sans-serif"%3E?%3C/text%3E%3C/svg%3E';

// ─── Authentication ──────────────────────────────────────────────
function getToken() {
    return localStorage.getItem('token');
}

function redirectToLogin() {
    window.location.href = '/login.html';
}

// ─── API Calls ────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
    const token = getToken();
    if (!token) {
        redirectToLogin();
        return;
    }
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers,
        },
    });
    if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        redirectToLogin();
        return;
    }
    return response;
}

// ─── Navigation ──────────────────────────────────────────────────
document.querySelectorAll('.sidebar-nav a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        switchSection(section);
    });
});

function switchSection(section) {
    currentSection = section;
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    document.querySelector(`.sidebar-nav a[data-section="${section}"]`)?.classList.add('active');
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${section}`)?.classList.add('active');
    const titles = {
        dashboard: 'Dashboard',
        profiles: 'Manage Profiles',
        users: 'Manage Users',
        subscriptions: 'Subscriptions',
        email: 'Bulk Email',
        settings: 'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[section] || 'Dashboard';
    switch(section) {
        case 'dashboard': loadDashboard(); break;
        case 'profiles': loadProfiles(document.getElementById('profileFilter')?.value || 'all'); break;
        case 'users': loadUsers(); break;
        case 'subscriptions': loadSubscriptions(); break;
    }
}

// ─── Dashboard ────────────────────────────────────────────────────
// ─── Dashboard ────────────────────────────────────────────────────
async function loadDashboard() {
    try {
        const statsRes = await apiFetch('/api/admin/stats');
        if (statsRes?.ok) {
            const stats = await statsRes.json();
            document.getElementById('statTotal').textContent = stats.total || 0;
            document.getElementById('statPending').textContent = stats.pending || 0;
            document.getElementById('statApproved').textContent = stats.approved || 0;
            document.getElementById('statRejected').textContent = stats.rejected || 0;
        }
        const expiredRes = await apiFetch('/api/admin/expired');
        if (expiredRes?.ok) {
            const expired = await expiredRes.json();
            document.getElementById('statExpired').textContent = expired.length || 0;
        }
        const profilesRes = await apiFetch('/api/admin/profiles');
        if (profilesRes?.ok) {
            const profiles = await profilesRes.json();
            allProfiles = profiles; // ✅ FIX: Store in global variable
            const totalViews = profiles.reduce((sum, p) => sum + (p.profileViews || 0), 0);
            document.getElementById('statViews').textContent = totalViews || 0;
            loadTopViewedProfiles(profiles);
        }
        document.getElementById('recentActivity').innerHTML = `
            <p>✅ Site is running</p>
            <p>📧 Email system: ✅ Configured</p>
        `;
    } catch (error) {
        console.error('Dashboard load error:', error);
    }
}

// ─── Top Viewed Profiles ──────────────────────────────────────────
function loadTopViewedProfiles(profiles) {
    const container = document.getElementById('topViewedProfiles');
    if (!container) return;

    // Sort by views (highest first)
    const sorted = profiles
        .filter(p => p.isApproved)
        .sort((a, b) => (b.profileViews || 0) - (a.profileViews || 0));

    // Pagination for top viewed
    const total = sorted.length;
    const perPage = parseInt(document.getElementById('topPerPageSelect')?.value) || 10;
    const totalPages = Math.ceil(total / perPage) || 1;
    let currentPage = parseInt(document.getElementById('topCurrentPage')?.value) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * perPage;
    const end = Math.min(start + perPage, total);
    const pageItems = sorted.slice(start, end);

    // Update pagination info
    document.getElementById('topPageStart').textContent = total > 0 ? start + 1 : 0;
    document.getElementById('topPageEnd').textContent = end;
    document.getElementById('topTotalProfiles').textContent = total;

    // Render the list
    if (pageItems.length === 0) {
        container.innerHTML = '<p style="color:#888;">No profile views yet.</p>';
    } else {
        container.innerHTML = pageItems.map((p, i) => `
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #2c2c2c;">
                <span>${start + i + 1}. ${escapeHtml(p.displayName || p.name)}</span>
                <span style="color:#c7a76c; font-weight:600;">${p.profileViews || 0} views</span>
            </div>
        `).join('');
    }

    // Update pagination buttons
    renderTopPaginationButtons(totalPages);
}

// ─── Profiles (Paginated & Sorted) ──────────────────────────────
async function loadProfiles(filter = 'all') {
    if (isLoadingProfiles) return;
    isLoadingProfiles = true;
    const tbody = document.getElementById('profilesBody');
    tbody.innerHTML = '<tr><td colspan="8" class="loading">Loading profiles...</td></tr>';
    try {
        const res = await apiFetch('/api/admin/profiles');
        if (!res?.ok) {
            isLoadingProfiles = false;
            return;
        }
        allProfiles = await res.json();
        allProfiles.sort((a, b) => {
            const dateA = new Date(a.createdAt || a._id?.timestamp || 0);
            const dateB = new Date(b.createdAt || b._id?.timestamp || 0);
            return dateB - dateA;
        });
        filteredProfiles = applyFilter(allProfiles, filter);
        currentFilter = filter;
        currentPage = 1;
        renderPaginatedProfiles();
    } catch (error) {
        console.error('Profiles load error:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Error loading profiles</td></tr>';
    } finally {
        isLoadingProfiles = false;
    }
}

function applyFilter(profiles, filter) {
    if (filter === 'pending') return profiles.filter(p => !p.isApproved && p.status !== 'rejected');
    if (filter === 'approved') return profiles.filter(p => p.isApproved);
    if (filter === 'rejected') return profiles.filter(p => p.status === 'rejected');
    if (filter === 'expired') {
        const now = new Date();
        return profiles.filter(p => p.isApproved && p.subscriptionExpiry && new Date(p.subscriptionExpiry) < now);
    }
    return profiles;
}

function renderPaginatedProfiles() {
    if (isRendering) return;
    isRendering = true;

    const tbody = document.getElementById('profilesBody');
    const total = filteredProfiles.length;
    const totalPages = Math.ceil(total / itemsPerPage) || 1;

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * itemsPerPage;
    const end = Math.min(start + itemsPerPage, total);
    const pageProfiles = filteredProfiles.slice(start, end);

    document.getElementById('pageStart').textContent = total > 0 ? start + 1 : 0;
    document.getElementById('pageEnd').textContent = end;
    document.getElementById('totalProfiles').textContent = total;
    document.getElementById('profileCount').textContent = `${total} profiles`;

    if (pageProfiles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">No profiles found</td></tr>';
    } else {
        tbody.innerHTML = pageProfiles.map(p => renderProfileRow(p)).join('');
    }

    renderPaginationButtons(totalPages);
    isRendering = false;
}

function renderProfileRow(p) {
    const status = p.isApproved ? 'approved' : (p.status === 'rejected' ? 'rejected' : 'pending');
    const isExpired = p.subscriptionExpiry && new Date(p.subscriptionExpiry) < new Date();
    const displayStatus = isExpired ? 'expired' : status;
    const statusLabel = isExpired ? 'Expired' : status;

    const photo = p.photos?.[0] || p.images?.[0] || '';
    const joinedDate = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'N/A';
    const views = p.profileViews || 0;

    return `
        <tr>
            <td>
                <img src="${photo || FALLBACK_IMAGE}" 
                     alt="${escapeHtml(p.displayName || p.name)}" 
                     style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #2c2c2c;"
                     onerror="this.onerror=null; this.src='${FALLBACK_IMAGE}';">
            </td>
            <td><strong>${escapeHtml(p.displayName || p.name)}</strong></td>
            <td>${escapeHtml(p.email || 'N/A')}</td>
            <td>${escapeHtml(p.city || p.location || 'N/A')}</td>
            <td><span class="status-badge ${displayStatus}">${statusLabel}</span></td>
            <td style="text-align:center;">${views}</td>
            <td>${joinedDate}</td>
            <td>
                ${!p.isApproved && p.status !== 'rejected' ? `
                    <button class="btn-approve" onclick="approveProfile('${p.slug}')">Approve</button>
                    <button class="btn-reject" onclick="rejectProfile('${p.slug}')">Reject</button>
                ` : ''}
                ${p.isApproved ? `
                    <button class="btn-delete" onclick="deleteProfile('${p.slug}')">Delete</button>
                ` : ''}
            </td>
        </tr>
    `;
}

function renderPaginationButtons(totalPages) {
    const container = document.getElementById('pageNumbers');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    if (!container) return;

    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;

    let buttons = '';
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        buttons += `<button class="page-btn" data-page="1">1</button>`;
        if (startPage > 2) buttons += `<span class="page-ellipsis">…</span>`;
    }
    for (let i = startPage; i <= endPage; i++) {
        buttons += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) buttons += `<span class="page-ellipsis">…</span>`;
        buttons += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
    }
    container.innerHTML = buttons;

    container.querySelectorAll('.page-btn').forEach(btn => {
        btn.removeEventListener('click', pageClickHandler);
        btn.addEventListener('click', pageClickHandler);
    });
}

function renderTopPaginationButtons(totalPages) {
    const container = document.getElementById('topPageNumbers');
    const prevBtn = document.getElementById('topPrevPage');
    const nextBtn = document.getElementById('topNextPage');
    if (!container) return;

    let currentPage = parseInt(document.getElementById('topCurrentPage')?.value) || 1;

    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;

    let buttons = '';
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        buttons += `<button class="page-btn" data-top-page="1">1</button>`;
        if (startPage > 2) buttons += `<span class="page-ellipsis">…</span>`;
    }
    for (let i = startPage; i <= endPage; i++) {
        buttons += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-top-page="${i}">${i}</button>`;
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) buttons += `<span class="page-ellipsis">…</span>`;
        buttons += `<button class="page-btn" data-top-page="${totalPages}">${totalPages}</button>`;
    }
    container.innerHTML = buttons;

    container.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const page = parseInt(this.dataset.topPage);
            document.getElementById('topCurrentPage').value = page;
            loadTopViewedProfiles(allProfiles);
        });
    });
}

function pageClickHandler(e) {
    const page = parseInt(e.currentTarget.dataset.page);
    if (!isNaN(page) && page !== currentPage) {
        currentPage = page;
        renderPaginatedProfiles();
    }
}

// ─── Pagination Controls ──────────────────────────────────────────
document.getElementById('prevPage')?.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderPaginatedProfiles();
    }
});

document.getElementById('nextPage')?.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredProfiles.length / itemsPerPage) || 1;
    if (currentPage < totalPages) {
        currentPage++;
        renderPaginatedProfiles();
    }
});

document.getElementById('perPageSelect')?.addEventListener('change', function() {
    itemsPerPage = parseInt(this.value);
    currentPage = 1;
    renderPaginatedProfiles();
});

// ─── Top Viewed Pagination Controls ──────────────────────────────
document.getElementById('topPrevPage')?.addEventListener('click', () => {
    let currentPage = parseInt(document.getElementById('topCurrentPage')?.value) || 1;
    if (currentPage > 1) {
        document.getElementById('topCurrentPage').value = currentPage - 1;
        loadTopViewedProfiles(allProfiles);
    }
});

document.getElementById('topNextPage')?.addEventListener('click', () => {
    let currentPage = parseInt(document.getElementById('topCurrentPage')?.value) || 1;
    const total = allProfiles.filter(p => p.isApproved).length;
    const perPage = parseInt(document.getElementById('topPerPageSelect')?.value) || 10;
    const totalPages = Math.ceil(total / perPage) || 1;
    if (currentPage < totalPages) {
        document.getElementById('topCurrentPage').value = currentPage + 1;
        loadTopViewedProfiles(allProfiles);
    }
});

document.getElementById('topPerPageSelect')?.addEventListener('change', function() {
    document.getElementById('topCurrentPage').value = 1;
    loadTopViewedProfiles(allProfiles);
});

// ─── Profile Filter & Search ──────────────────────────────────────
document.getElementById('profileFilter')?.addEventListener('change', function() {
    loadProfiles(this.value);
});

const debouncedSearch = debounce(function() {
    const query = document.getElementById('profileSearch').value.toLowerCase().trim();
    if (!query) {
        filteredProfiles = applyFilter(allProfiles, currentFilter);
    } else {
        filteredProfiles = applyFilter(allProfiles, currentFilter).filter(p => 
            (p.displayName || p.name || '').toLowerCase().includes(query) ||
            (p.city || p.location || '').toLowerCase().includes(query) ||
            (p.email || '').toLowerCase().includes(query)
        );
    }
    currentPage = 1;
    renderPaginatedProfiles();
}, 300);

document.getElementById('profileSearch')?.addEventListener('input', debouncedSearch);

document.getElementById('refreshProfiles')?.addEventListener('click', function() {
    loadProfiles(document.getElementById('profileFilter').value);
});

// ─── Profile Actions ─────────────────────────────────────────────
window.approveProfile = async function(slug) {
    if (!confirm('Approve this profile?')) return;
    try {
        const res = await apiFetch(`/api/admin/profiles/${slug}/approve`, { method: 'PUT' });
        if (res?.ok) {
            alert('✅ Profile approved!');
            loadProfiles(document.getElementById('profileFilter').value);
        }
    } catch (error) {
        console.error('Approve error:', error);
        alert('❌ Failed to approve profile');
    }
};

window.rejectProfile = async function(slug) {
    if (!confirm('Reject and delete this profile?')) return;
    try {
        const res = await apiFetch(`/api/admin/profiles/${slug}`, { method: 'DELETE' });
        if (res?.ok) {
            alert('❌ Profile rejected and deleted');
            loadProfiles(document.getElementById('profileFilter').value);
        }
    } catch (error) {
        console.error('Reject error:', error);
        alert('❌ Failed to reject profile');
    }
};

window.deleteProfile = async function(slug) {
    if (!confirm('Delete this profile permanently?')) return;
    try {
        const res = await apiFetch(`/api/admin/profiles/${slug}`, { method: 'DELETE' });
        if (res?.ok) {
            alert('🗑️ Profile deleted');
            loadProfiles(document.getElementById('profileFilter').value);
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('❌ Failed to delete profile');
    }
};

// ─── Users ────────────────────────────────────────────────────────
async function loadUsers() {
    const tbody = document.getElementById('usersBody');
    tbody.innerHTML = '<tr><td colspan="4" class="loading">Loading users...</td></tr>';
    try {
        const res = await apiFetch('/api/admin/users');
        if (!res?.ok) return;
        const users = await res.json();
        tbody.innerHTML = users.map(u => `
            <tr>
                <td>${escapeHtml(u.email)}</td>
                <td><span class="status-badge ${u.role === 'admin' ? 'approved' : 'pending'}">${u.role || 'escort'}</span></td>
                <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}</td>
                <td>
                    ${u.role !== 'admin' ? `<button class="btn-delete" onclick="deleteUser('${u._id}')">Delete</button>` : '—'}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Users load error:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="loading">Error loading users</td></tr>';
    }
}

window.deleteUser = async function(userId) {
    if (!confirm('Delete this user?')) return;
    alert('⚠️ Delete user endpoint not yet implemented');
};

// ─── Subscriptions ────────────────────────────────────────────────
async function loadSubscriptions() {
    const tbody = document.getElementById('subscriptionsBody');
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading subscriptions...</td></tr>';
    try {
        const profilesRes = await apiFetch('/api/admin/profiles');
        const expiredRes = await apiFetch('/api/admin/expired');
        if (!profilesRes?.ok || !expiredRes?.ok) return;
        const profiles = await profilesRes.json();
        const expired = await expiredRes.json();

        document.getElementById('subActive').textContent = profiles.filter(p => p.isApproved && (!p.subscriptionExpiry || new Date(p.subscriptionExpiry) >= new Date())).length;
        document.getElementById('subExpired').textContent = expired.length;

        const allWithExpiry = profiles.filter(p => p.subscriptionExpiry);
        tbody.innerHTML = allWithExpiry.map(p => {
            const isExpired = new Date(p.subscriptionExpiry) < new Date();
            return `
                <tr>
                    <td>${escapeHtml(p.displayName || p.name)}</td>
                    <td>${p.subscriptionTier || 'Free'}</td>
                    <td>${new Date(p.subscriptionExpiry).toLocaleDateString()}</td>
                    <td><span class="status-badge ${isExpired ? 'expired' : 'approved'}">${isExpired ? 'Expired' : 'Active'}</span></td>
                    <td>${isExpired ? `<button class="btn-approve" onclick="renewSubscription('${p.slug}')">Renew</button>` : '—'}</td>
                </tr>
            `;
        }).join('');
        if (allWithExpiry.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">No subscription data available</td></tr>';
        }
    } catch (error) {
        console.error('Subscriptions load error:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Error loading subscriptions</td></tr>';
    }
}

window.renewSubscription = async function(slug) {
    if (!confirm('Renew this subscription for 1 month?')) return;
    try {
        const res = await apiFetch(`/api/admin/profiles/${slug}/renew`, { method: 'POST' });
        if (res?.ok) {
            alert('✅ Subscription renewed!');
            loadSubscriptions();
        } else {
            alert('❌ Renewal failed');
        }
    } catch (error) {
        console.error('Renew error:', error);
        alert('❌ Renewal failed');
    }
};

// ─── Bulk Email ───────────────────────────────────────────────────
document.getElementById('sendBulkEmail')?.addEventListener('click', async function() {
    const subject = document.getElementById('bulkSubject').value.trim();
    const message = document.getElementById('bulkMessage').value.trim();
    const filter = document.getElementById('bulkFilter').value;
    if (!subject || !message) {
        document.getElementById('bulkResult').textContent = '⚠️ Please fill in both subject and message.';
        document.getElementById('bulkResult').className = 'error';
        return;
    }
    this.disabled = true;
    this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    document.getElementById('bulkResult').textContent = '';
    try {
        const res = await apiFetch('/api/admin/send-bulk-email', { method: 'POST', body: JSON.stringify({ subject, message, filter }) });
        const data = await res.json();
        document.getElementById('bulkResult').textContent = data.message || '✅ Email sent!';
        document.getElementById('bulkResult').className = res.ok ? 'success' : 'error';
    } catch (error) {
        document.getElementById('bulkResult').textContent = '❌ Failed to send emails';
        document.getElementById('bulkResult').className = 'error';
    }
    this.disabled = false;
    this.innerHTML = '<i class="fas fa-paper-plane"></i> Send Bulk Email';
});

// ─── Export Data ────────────────────────────────────────────────────
document.getElementById('exportData')?.addEventListener('click', async function() {
    try {
        const res = await apiFetch('/api/admin/profiles');
        if (!res?.ok) return;
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fineescorts-export-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        alert('✅ Data exported successfully!');
    } catch (error) {
        console.error('Export error:', error);
        alert('❌ Export failed');
    }
});

// ─── Export Revenue CSV ────────────────────────────────────────────
document.getElementById('exportRevenue')?.addEventListener('click', async function() {
    try {
        const res = await apiFetch('/api/admin/profiles');
        if (!res?.ok) return;
        const profiles = await res.json();

        const revenueData = profiles
            .filter(p => p.isApproved && p.subscriptionTier)
            .map(p => ({
                name: p.displayName || p.name,
                plan: p.subscriptionTier,
                amount: { standard: 1500, premium: 2500, vip: 4000 }[p.subscriptionTier] || 0,
                expiry: p.subscriptionExpiry ? new Date(p.subscriptionExpiry).toLocaleDateString() : 'N/A',
                status: p.subscriptionExpiry && new Date(p.subscriptionExpiry) < new Date() ? 'Expired' : 'Active'
            }));

        if (revenueData.length === 0) {
            alert('No subscription data to export.');
            return;
        }

        // Build CSV
        let csv = 'Name,Plan,Amount (KES),Expiry,Status\n';
        revenueData.forEach(r => {
            csv += `"${r.name}","${r.plan}",${r.amount},"${r.expiry}","${r.status}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `revenue-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        alert(`✅ Revenue data exported (${revenueData.length} subscriptions).`);
    } catch (error) {
        console.error('Revenue export error:', error);
        alert('❌ Failed to export revenue.');
    }
});

// ─── Change Password ──────────────────────────────────────────────
document.getElementById('changePasswordForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const current = document.getElementById('currentPassword').value.trim();
    const newPass = document.getElementById('newPassword').value.trim();
    const confirm = document.getElementById('confirmPassword').value.trim();
    if (!current || !newPass || !confirm) {
        alert('⚠️ Please fill all fields.');
        return;
    }
    if (newPass !== confirm) {
        alert('⚠️ New passwords do not match.');
        return;
    }
    alert('⚠️ Password change endpoint not yet implemented.');
});

// ─── Logout ───────────────────────────────────────────────────────
document.getElementById('logoutBtn')?.addEventListener('click', function(e) {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
});

// ─── Helper Functions ────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    const token = getToken();
    if (!token) {
        redirectToLogin();
        return;
    }
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role !== 'admin') {
        alert('⚠️ Admin access required');
        window.location.href = '/dashboard.html';
        return;
    }
    document.getElementById('adminEmail').textContent = user.email || 'Admin';
    switchSection('dashboard');
});

// ─── Auto-refresh every 60 seconds ──────────────────────────────
setInterval(() => {
    if (currentSection === 'dashboard') loadDashboard();
}, 60000);