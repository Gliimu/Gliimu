import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Simple root route to test if server is running
app.get('/', (req, res) => {
  res.json({ status: 'Gliimu API is running' });
});

// ==========================================
// GLIIM-PA AI ENDPOINT
// ==========================================
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    // System prompt to give Gliim-PA its personality
    const systemPrompt = {
      role: 'system',
      content: 'You are Gliim-PA, an elite personal assistant for the Gliimu EdTech platform. Your job is to guide users, answer research questions, and help them become Full Stack Media Architects. Be concise, professional, and encouraging.'
    };

    // Call DeepSeek API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
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

    if (!response.ok) {
      throw new Error(data.error?.message || 'AI API failed');
    }

    // Send AI response back to frontend
    res.json({ reply: data.choices[0].message.content });

  } catch (error) {
    console.error('AI Error:', error);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gliimu Server running on port ${PORT}`);
});
