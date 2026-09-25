require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Gliimu Server is running!');
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const apiKey = process.env.DEEPSEEK_API_KEY;

    // 1. Check if API key is missing on the server
    if (!apiKey) {
      console.error("Missing DEEPSEEK_API_KEY in Render Environment Variables.");
      return res.status(500).json({ error: 'Server missing API Key.' });
    }

    const systemPrompt = {
      role: 'system',
      content: 'You are Gliim-PA, an elite personal assistant for the Gliimu EdTech platform. Your users are "Gliimaits" training to become Full Stack Media Architects. Keep responses concise, professional, and action-oriented.'
    };

    // 2. Call DeepSeek API
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [systemPrompt, ...messages],
        stream: false
      })
    });

    // 3. If DeepSeek rejects (e.g. 401 Unauthorized or 429 Rate Limit)
    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API Rejected:', errorText);
      return res.status(500).json({ error: `DeepSeek Error: ${errorText}` });
    }

    const data = await response.json();

    if (data.choices && data.choices.length > 0) {
      const aiReply = data.choices[0].message.content;
      res.json({ reply: aiReply });
    } else {
      console.error('Unexpected DeepSeek Response:', data);
      res.status(500).json({ error: 'AI returned no choices.' });
    }

  } catch (error) {
    console.error('Server Crash:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.listen(PORT, () => {
  console.log(`Gliimu Server running on port ${PORT}`);
});
