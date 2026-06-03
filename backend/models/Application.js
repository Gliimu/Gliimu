const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  category: { type: String, enum: ['Student', 'Instructor', 'Others'] },
  track: String,
  courses: [String],
  otherRole: String,
  motivation: String,
  source: String,
  referralCode: String,
  generatedUsername: String,
  generatedPasscode: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Application', ApplicationSchema);