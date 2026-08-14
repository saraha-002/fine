// ─── Admin Dashboard Script ──────────────────────────────────────

const API_BASE = 'https://fineescorts.co.ke';
let currentSection = 'dashboard';
let allProfiles = [];

// ─── Authentication ──────────────────────────────────────────────
function getToken() {
    return localStorage.getItem('token');
}

function isAdmin() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.role === 'admin';
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

    // Update sidebar
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    document.querySelector(`.sidebar-nav a[data-section="${section}"]`)?.classList.add('active');

    // Update content
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${section}`)?.classList.add('active');

    // Update title
    const titles = {
        dashboard: 'Dashboard',
        profiles: 'Manage Profiles',
        users: 'Manage Users',
        subscriptions: 'Subscriptions',
        email: 'Bulk Email',
        settings: 'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[section] || 'Dashboard';

    // Load data
    switch(section) {
        case 'dashboard': loadDashboard(); break;
        case 'profiles': loadProfiles(); break;
        case 'users': loadUsers(); break;
        case 'subscriptions': loadSubscriptions(); break;
    }
}

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

        // Load expired count
        const expiredRes = await apiFetch('/api/admin/expired');
        if (expiredRes?.ok) {
            const expired = await expiredRes.json();
            document.getElementById('statExpired').textContent = expired.length || 0;
        }

        // Load total views
        const profilesRes = await apiFetch('/api/admin/profiles');
        if (profilesRes?.ok) {
            const profiles = await profilesRes.json();
            const totalViews = profiles.reduce((sum, p) => sum + (p.profileViews || 0), 0);
            document.getElementById('statViews').textContent = totalViews || 0;
        }

        // Recent activity
        const activity = document.getElementById('recentActivity');
        activity.innerHTML = `
            <p>✅ Site is running</p>
            <p>📧 Email system: ${await testEmail() ? '✅ Working' : '❌ Check logs'}</p>
        `;
    } catch (error) {
        console.error('Dashboard load error:', error);
    }
}

async function testEmail() {
    try {
        const res = await fetch('/api/test-email');
        const data = await res.json();
        return data.success;
    } catch {
        return false;
    }
}

// ─── Profiles ─────────────────────────────────────────────────────
async function loadProfiles(filter = 'all') {
    const tbody = document.getElementById('profilesBody');
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading profiles...</td></tr>';

    try {
        const res = await apiFetch('/api/admin/profiles');
        if (!res?.ok) return;

        allProfiles = await res.json();

        let filtered = [...allProfiles];
        if (filter === 'pending') filtered = filtered.filter(p => !p.isApproved && p.status !== 'rejected');
        else if (filter === 'approved') filtered = filtered.filter(p => p.isApproved);
        else if (filter === 'rejected') filtered = filtered.filter(p => p.status === 'rejected');
        else if (filter === 'expired') {
            const now = new Date();
            filtered = filtered.filter(p => p.isApproved && p.subscriptionExpiry && new Date(p.subscriptionExpiry) < now);
        }

        renderProfiles(filtered);
    } catch (error) {
        console.error('Profiles load error:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Error loading profiles</td></tr>';
    }
}

function renderProfiles(profiles) {
    const tbody = document.getElementById('profilesBody');

    if (profiles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">No profiles found</td></tr>';
        return;
    }

    tbody.innerHTML = profiles.map(p => {
        const status = p.isApproved ? 'approved' : (p.status === 'rejected' ? 'rejected' : 'pending');
        const expiry = p.subscriptionExpiry ? new Date(p.subscriptionExpiry).toLocaleDateString() : 'N/A';
        const isExpired = p.subscriptionExpiry && new Date(p.subscriptionExpiry) < new Date();

        return `
            <tr>
                <td><strong>${escapeHtml(p.displayName || p.name)}</strong></td>
                <td>${escapeHtml(p.email || 'N/A')}</td>
                <td>${escapeHtml(p.city || p.location || 'N/A')}</td>
                <td><span class="status-badge ${isExpired ? 'expired' : status}">${isExpired ? 'Expired' : status}</span></td>
                <td>${isExpired ? '⚠️ Expired' : expiry}</td>
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
    }).join('');
}

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
    // Implement delete user endpoint if needed
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
                    <td>
                        ${isExpired ? '<button class="btn-approve" onclick="renewSubscription()">Renew</button>' : '—'}
                    </td>
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

window.renewSubscription = function() {
    alert('⚠️ Renewal feature coming soon — manually approve the profile to reactivate');
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
        const res = await apiFetch('/api/admin/send-bulk-email', {
            method: 'POST',
            body: JSON.stringify({ subject, message, filter })
        });

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

// ─── Profile Filter ──────────────────────────────────────────────
document.getElementById('profileFilter')?.addEventListener('change', function() {
    loadProfiles(this.value);
});

document.getElementById('profileSearch')?.addEventListener('input', function() {
    const query = this.value.toLowerCase();
    const filtered = allProfiles.filter(p => 
        (p.displayName || p.name || '').toLowerCase().includes(query)
    );
    renderProfiles(filtered);
});

document.getElementById('refreshProfiles')?.addEventListener('click', function() {
    loadProfiles(document.getElementById('profileFilter').value);
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
    // Check if logged in
    const token = getToken();
    if (!token) {
        redirectToLogin();
        return;
    }

    // Check if admin
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role !== 'admin') {
        alert('⚠️ Admin access required');
        window.location.href = '/dashboard.html';
        return;
    }

    document.getElementById('adminEmail').textContent = user.email || 'Admin';

    // Load default section
    switchSection('dashboard');
});

// ─── Auto-refresh every 60 seconds ──────────────────────────────
setInterval(() => {
    if (currentSection === 'dashboard') loadDashboard();
}, 60000);