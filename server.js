// Local dev server (not used on Vercel — Vercel uses api/options.js directly)
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Also serve index.html from root for backward compat
app.use(express.static('.', { index: false }));

app.get('/api/options', async (req, res) => {
  const { date } = req.query;
  const base = 'https://query2.finance.yahoo.com/v7/finance/options/%5ESPX';
  const url = date ? `${base}?date=${date}` : base;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance returned ${response.status}` });
    }
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
