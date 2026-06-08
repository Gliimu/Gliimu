/* Dark mode fixes for modal amounts */
body.dark-mode .amount-btn {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-color: var(--border-color);
}

body.dark-mode .amount-btn:hover,
body.dark-mode .amount-btn.active {
    background: var(--brand-gold);
    color: var(--brand-purple-dark);
}

body.dark-mode .custom-amount input {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-color: var(--border-color);
}

body.dark-mode .bank-info-card {
    background: var(--bg-secondary);
}

body.dark-mode .reference-code-box {
    background: rgba(251, 176, 64, 0.15);
}

body.dark-mode .payment-instructions {
    background: var(--bg-secondary);
}

/* Payment Filter Buttons */
.payment-filters {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
}

.filter-btn {
    padding: 0.5rem 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s;
}

.filter-btn:hover {
    border-color: var(--brand-gold);
}

.filter-btn.active {
    background: var(--brand-gold);
    color: var(--brand-purple-dark);
    border-color: var(--brand-gold);
}

/* Quick Stats */
.quick-stats {
    margin-bottom: 1.5rem;
}

.quick-stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
}

.quick-stat-card i {
    font-size: 1.5rem;
    color: var(--brand-gold);
}

.quick-stat-card div {
    flex: 1;
}

.quick-stat-label {
    font-size: 0.7rem;
    color: var(--text-secondary);
    display: block;
}

.quick-stat-value {
    font-size: 1.2rem;
    font-weight: 700;
}

.quick-add-funds {
    background: var(--brand-gold);
    border: none;
    padding: 0.25rem 0.75rem;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
}
