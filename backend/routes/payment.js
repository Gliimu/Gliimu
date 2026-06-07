const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Payment model (add to backend/models/Payment.js)
const Payment = require('../models/Payment');

// Create payment request
router.post('/request', auth, async (req, res) => {
    try {
        const { amount, bank, referenceCode } = req.body;
        
        const payment = new Payment({
            userId: req.user.id,
            userName: req.user.name,
            userEmail: req.user.email,
            amount,
            bank,
            referenceCode,
            status: 'pending',
            submittedAt: new Date()
        });
        
        await payment.save();
        res.json({ success: true, payment });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get user's payment requests
router.get('/my-requests', auth, async (req, res) => {
    try {
        const payments = await Payment.find({ userId: req.user.id })
            .sort({ submittedAt: -1 });
        res.json(payments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all pending payments (admin only)
router.get('/pending', auth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const payments = await Payment.find({ status: 'pending' })
            .sort({ submittedAt: 1 });
        res.json(payments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Approve payment (admin only)
router.put('/approve/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { narrationCode, receivedAmount, adminNotes } = req.body;
        const payment = await Payment.findById(req.params.id);
        
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        // Verify code and amount
        if (narrationCode !== payment.referenceCode) {
            return res.status(400).json({ error: 'Code mismatch' });
        }
        
        if (receivedAmount !== payment.amount) {
            return res.status(400).json({ error: 'Amount mismatch' });
        }
        
        payment.status = 'approved';
        payment.approvedAt = new Date();
        payment.adminNotes = adminNotes;
        await payment.save();
        
        // Update user's wallet balance
        const User = require('../models/User');
        await User.findByIdAndUpdate(payment.userId, {
            $inc: { walletBalance: payment.amount }
        });
        
        // Create transaction record
        const Transaction = require('../models/Transaction');
        await Transaction.create({
            userId: payment.userId,
            amount: payment.amount,
            type: 'credit',
            description: `Wallet funding - ${payment.referenceCode}`,
            status: 'completed'
        });
        
        res.json({ success: true, payment });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reject payment (admin only)
router.put('/reject/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { adminNotes } = req.body;
        const payment = await Payment.findById(req.params.id);
        
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        payment.status = 'rejected';
        payment.adminNotes = adminNotes;
        await payment.save();
        
        res.json({ success: true, payment });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
