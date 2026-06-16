// ============================================
// MODAL WITH PURCHASE OPTIONS - FIXED
// ============================================

window.viewItemDetails = async (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) {
        showToast('Item not found', 'error');
        return;
    }
    
    const isPurchased = purchasedItems.has(item.id);
    const isSaved = savedItems.has(item.id);
    const isFree = (item.price === 0 || !item.price) && (item.physical_price === 0 || !item.physical_price);
    const hasDigital = (item.price || 0) > 0;
    const hasPhysical = (item.physical_price || 0) > 0;
    const isPremium = userGP >= 100;
    const canReadOnline = item.file_url && (isPurchased || isFree || isPremium);
    const canDownloadBundle = item.type === 'bundle' && item.download_url && (isPurchased || isFree);
    const gpReward = item.type === 'bundle' ? GP_REWARDS.purchase_bundle : GP_REWARDS.purchase_book;
    
    const modal = document.getElementById('itemModal');
    if (!modal) {
        console.error('Modal element not found');
        return;
    }
    
    const modalTitle = document.getElementById('modalTitle');
    const modalImage = document.getElementById('modalImage');
    const modalDescription = document.getElementById('modalDescription');
    const modalFooter = document.getElementById('modalFooter');
    const modalSaveBtn = document.getElementById('modalSaveBtn');
    
    // Set modal content
    modalTitle.textContent = item.title;
    
    // Update save button state
    if (modalSaveBtn) {
        modalSaveBtn.className = `modal-save-btn ${isSaved ? 'saved' : ''}`;
        modalSaveBtn.innerHTML = `<i class="fas fa-bookmark"></i>`;
        modalSaveBtn.title = isSaved ? 'Remove from saved' : 'Save for later';
        // Remove old event listener and add new one
        const newSaveBtn = modalSaveBtn.cloneNode(true);
        modalSaveBtn.parentNode.replaceChild(newSaveBtn, modalSaveBtn);
        newSaveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.toggleSaveItem(itemId);
        });
        // Update reference
        document.getElementById('modalSaveBtn');
    }
    
    const coverUrl = item.cover_url || `https://placehold.co/300x450/2c2f78/white?text=${encodeURIComponent(item.title)}`;
    modalImage.src = coverUrl;
    modalImage.alt = item.title;
    
    let descriptionHtml = `
        <div class="item-details">
            <p><strong>Author:</strong> ${escapeHtml(item.author || 'Gliimu Team')}</p>
            <p><strong>Type:</strong> ${item.type || 'Book'} | <strong>Level:</strong> ${item.level || 'Beginner'}</p>
            ${isPremium ? `<p><span class="premium-badge">⭐ Premium Access</span></p>` : ''}
            ${isPurchased ? `<p><span class="owned-badge">✅ You own this item</span></p>` : ''}
            
            <div class="price-details">
                ${hasDigital ? `
                    <div class="price-row">
                        <span class="label">📱 EPUB</span>
                        <span class="value ${item.price === 0 ? 'free' : ''}">${item.price === 0 ? 'Free' : `₦${(item.price || 0).toLocaleString()}`}</span>
                    </div>
                ` : ''}
                ${hasPhysical ? `
                    <div class="price-row">
                        <span class="label">📖 Hard Copy</span>
                        <span class="value">₦${(item.physical_price || 0).toLocaleString()}</span>
                    </div>
                ` : ''}
                ${item.file_url ? `
                    <div class="price-row">
                        <span class="label">📄 PDF Download</span>
                        <span class="value ${isPurchased ? 'free' : ''}">${isPurchased ? 'Free' : '₦' + ((item.price || 0) * 0.8).toFixed(0)}</span>
                    </div>
                ` : ''}
                ${!isPurchased ? `
                    <div class="price-row">
                        <span class="label">⭐ GP Earned</span>
                        <span class="value" style="color: #8b5cf6;">+${gpReward} GP</span>
                    </div>
                ` : ''}
            </div>
            
            ${isPremium && hasDigital && !isPurchased ? `
                <div class="premium-notice">
                    <span>✨ Premium users get EPUB/PDF access for FREE!</span>
                </div>
            ` : ''}
            
            <div class="description-text">${escapeHtml(item.description || 'No description available.')}</div>
        </div>
    `;
    
    modalDescription.innerHTML = descriptionHtml;
    
    let footerHtml = '';
    
    if (isPurchased) {
        footerHtml = `
            ${canReadOnline ? `<button class="modal-btn modal-btn-primary" onclick="window.startReading('${item.id}')"><i class="fas fa-book-open"></i> Read Online</button>` : ''}
            ${canDownloadBundle ? `<button class="modal-btn modal-btn-primary" onclick="window.downloadBundle('${item.id}')"><i class="fas fa-download"></i> Download Bundle</button>` : ''}
            ${item.file_url ? `<button class="modal-btn modal-btn-primary" onclick="window.downloadPDF('${item.id}')"><i class="fas fa-file-pdf"></i> Download PDF</button>` : ''}
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else if (isFree) {
        // Free items - show a single "Get Access" button
        footerHtml = `
            <button class="modal-btn modal-btn-success" onclick="window.handleFreeAccess('${item.id}')"><i class="fas fa-gift"></i> Get Access</button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else if (isPremium && hasDigital) {
        // Premium user - digital access free
        footerHtml = `
            <button class="modal-btn modal-btn-success" onclick="window.handleGrantAccess('${item.id}', 'premium')"><i class="fas fa-star"></i> Premium Access (Free)</button>
            <div class="modal-btn-dropdown">
                <button class="modal-btn modal-btn-primary" onclick="togglePurchaseDropdown()">
                    <i class="fas fa-shopping-cart"></i> Buy
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="dropdown-options" id="purchaseDropdown">
                    ${hasDigital ? `<button onclick="window.handlePurchase('${item.id}', 'digital')">📱 EPUB <span class="price">₦${(item.price || 0).toLocaleString()}</span></button>` : ''}
                    ${item.file_url ? `<button onclick="window.handlePurchase('${item.id}', 'pdf')">📄 PDF <span class="price">₦${((item.price || 0) * 0.8).toFixed(0)}</span></button>` : ''}
                    ${hasPhysical ? `<button onclick="window.handlePurchase('${item.id}', 'physical')">📖 Hard Copy <span class="price">₦${(item.physical_price || 0).toLocaleString()}</span></button>` : ''}
                </div>
            </div>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    } else {
        // Regular paid item - Buy dropdown only
        footerHtml = `
            <div class="modal-btn-dropdown">
                <button class="modal-btn modal-btn-primary" onclick="togglePurchaseDropdown()">
                    <i class="fas fa-shopping-cart"></i> Buy
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="dropdown-options" id="purchaseDropdown">
                    ${hasDigital ? `<button onclick="window.handlePurchase('${item.id}', 'digital')">📱 EPUB <span class="price">₦${(item.price || 0).toLocaleString()}</span></button>` : ''}
                    ${item.file_url ? `<button onclick="window.handlePurchase('${item.id}', 'pdf')">📄 PDF <span class="price">₦${((item.price || 0) * 0.8).toFixed(0)}</span></button>` : ''}
                    ${hasPhysical ? `<button onclick="window.handlePurchase('${item.id}', 'physical')">📖 Hard Copy <span class="price">₦${(item.physical_price || 0).toLocaleString()}</span></button>` : ''}
                </div>
            </div>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button>
        `;
    }
    
    modalFooter.innerHTML = footerHtml;
    modal.classList.add('active');
};

// Toggle purchase dropdown
window.togglePurchaseDropdown = () => {
    const dropdown = document.getElementById('purchaseDropdown');
    if (dropdown) {
        const isOpen = dropdown.classList.contains('show');
        // Close all dropdowns first
        document.querySelectorAll('.dropdown-options').forEach(d => d.classList.remove('show'));
        if (!isOpen) {
            dropdown.classList.add('show');
        }
        isPurchaseDropdownOpen = !isOpen;
    }
};

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.modal-btn-dropdown')) {
        document.querySelectorAll('.dropdown-options').forEach(d => d.classList.remove('show'));
        isPurchaseDropdownOpen = false;
    }
});
