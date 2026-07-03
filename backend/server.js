require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// ROUTES
// ============================================
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// ============================================
// HEALTH CHECK (No MongoDB dependency)
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Gliimu API is running!',
    timestamp: new Date().toISOString(),
    database: 'Supabase (PostgreSQL)'
  });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔐 Auth routes: http://localhost:${PORT}/api/auth`);
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});
