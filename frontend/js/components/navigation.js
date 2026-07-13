// ============================================
// SHARED NAVIGATION COMPONENT
// Loads sticky navigation on any page
// ============================================

export function renderNavigation() {
    // Check if nav already exists
    if (document.getElementById('stickyNav')) return;

    // Create nav container
    var navHTML = `
        <div class="sticky-nav" id="stickyNav">
            <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="nav-dropdown" id="navDropdown">
                <!-- Alerts Section -->
                <div class="nav-section alerts-section">
                    <button class="nav-btn alert-btn" id="alertIconBtn" aria-label="Alerts">
                        <i class="fas fa-bell"></i>
                        <span>Notifications</span>
                        <span class="alert-badge hidden" id="alertBadge">0</span>
                    </button>
                </div>
                <div class="nav-divider"></div>
                <button class="nav-btn" onclick="window.goToDashboard()">
                    <i class="fas fa-tachometer-alt"></i>
                    <span>Dashboard</span>
                </button>
                <button class="nav-btn" onclick="window.goToHub()">
                    <i class="fas fa-th-large"></i>
                    <span>Hub</span>
                </button>
                <button class="nav-btn" onclick="window.goToLearningPath()">
                    <i class="fas fa-road"></i>
                    <span>Learning Path</span>
                </button>
                <button class="nav-btn" onclick="window.goToVirtualRoom()">
                    <i class="fas fa-video"></i>
                    <span>Virtual Room</span>
                </button>
                <button class="nav-btn" onclick="window.goToChat()">
                    <i class="fas fa-comments"></i>
                    <span>Chat</span>
                </button>
                <button class="nav-btn" onclick="window.goToMerchandise()">
                    <i class="fas fa-shopping-bag"></i>
                    <span>Merchandise</span>
                </button>
                <button class="nav-btn home-nav" onclick="window.goToUser()">
                    <i class="fas fa-user"></i>
                    <span>Portfolio</span>
                </button>
            </div>
        </div>
    `;

    // Append to body
    document.body.insertAdjacentHTML('beforeend', navHTML);

    // Setup toggle
    var toggle = document.getElementById('navToggle');
    var dropdown = document.getElementById('navDropdown');

    if (toggle) {
        toggle.onclick = function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('open');
            toggle.classList.toggle('active');
        };
    }

    document.addEventListener('click', function(e) {
        var nav = document.getElementById('stickyNav');
        if (nav && !nav.contains(e.target)) {
            dropdown.classList.remove('open');
            toggle.classList.remove('active');
        }
    });
}

// ============================================
// GLOBAL NAVIGATION FUNCTIONS
// ============================================
export function setupNavigationFunctions() {
    window.goToDashboard = function() {
        window.location.href = '/user';
    };
    window.goToHub = function() {
        window.location.href = '/hub';
    };
    window.goToLearningPath = function() {
        window.location.href = '/course';
    };
    window.goToVirtualRoom = function() {
        window.location.href = '/virtualroom';
    };
    window.goToChat = function() {
        window.location.href = '/chat';
    };
    window.goToMerchandise = function() {
        window.location.href = '/merchandise';
    };
    window.goToUser = function() {
        window.location.href = '/user';
    };
}

// ============================================
// AUTO-INIT
// ============================================
export function initNavigation() {
    renderNavigation();
    setupNavigationFunctions();
}
