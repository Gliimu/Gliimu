const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    amount: { type: Number, required: true },
    bank: { type: String, required: true },
    referenceCode: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    submittedAt: { type: Date, default: Date.now },
    approvedAt: { type: Date },
    adminNotes: { type: String }
});

module.exports = mongoose.model('Payment', PaymentSchema);
