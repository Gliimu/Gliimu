require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Simple root route to test if server is alive
app.get('/', (req, res) => {
  res.send('Gliimu Server is running!');
});

// ==========================================
// GLIIM-PA AI CHAT ROUTE
// ==========================================
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    // System prompt to define Gliim-PA's personality
    const systemPrompt = {
      role: 'system',
      content: 'You are Gliim-PA, an elite personal assistant for the Gliimu EdTech platform. Your users are "Gliimaits" training to become Full Stack Media Architects. You guide them through media, tech, and business services. Keep responses concise, professional, and action-oriented. Encourage an independent, boss-like mindset.'
    };

    // Call DeepSeek API
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [systemPrompt, ...messages],
        stream: false
      })
    });

    const data = await response.json();

    if (data.choices && data.choices.length > 0) {
      const aiReply = data.choices[0].message.content;
      res.json({ reply: aiReply });
    } else {
      console.error('DeepSeek API Error:', data);
      res.status(500).json({ error: 'AI failed to respond.' });
    }

  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Gliimu Server running on port ${PORT}`);
});
