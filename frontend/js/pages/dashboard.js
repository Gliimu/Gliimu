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
