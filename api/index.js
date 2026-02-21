const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// Serve static files dari folder public
app.use(express.static(path.join(__dirname, '../public')));

// Optional: kalau buka root, kirim index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

// ================= SCRAPER KURONIME =================

async function getLatestEpisodes(page = 1) {
  try {
    // Langsung hit kuronime tanpa proxy CORS
    const url = page === 1 ? 'https://kuronime.moe/' : `https://kuronime.moe/page/${page}/`;
    
    const res = await axios.get(url, { 
      headers, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(res.data);
    const data = [];

    // Cari section "New Episodes" 
    const sections = $('.bixbox');
    let targetSection = null;

    sections.each((i, el) => {
      const heading = $(el).find('.releases h1, .releases h2, .releases h3').text().trim();
      if (heading.toLowerCase().includes('new episodes')) {
        targetSection = $(el);
        return false; // break loop
      }
    });

    // Fallback: kalau gak ketemu heading "New Episodes", ambil section pertama yang ada listupd
    if (!targetSection) {
      targetSection = $('.bixbox').has('.listupd').first();
    }

    if (!targetSection || !targetSection.length) {
      throw new Error('Could not find episodes section');
    }

    // Extract data dari setiap article
    targetSection.find('article.bsu').each((_, el) => {
      const article = $(el);
      const link = article.find('a[itemprop="url"]');
      const img = article.find('img[itemprop="image"]');
      const titleEl = article.find('.bsuxtt h2');
      const episodeEl = article.find('.bt .ep');
      const timeEl = article.find('.bt .time');
      const viewsEl = article.find('.view .post-views-count');

      if (link.length && titleEl.length) {
        data.push({
          title: titleEl.text().trim(),
          episode: episodeEl.text().trim() || 'N/A',
          url: link.attr('href'),
          image: img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '',
          time: timeEl.text().trim() || '',
          views: viewsEl.text().trim() || '0'
        });
      }
    });

    return {
      page: parseInt(page),
      total: data.length,
      source: 'kuronime.moe',
      data: data
    };

  } catch (error) {
    console.error('Error fetching latest episodes:', error.message);
    throw new Error(`Failed to fetch latest episodes: ${error.message}`);
  }
}

// ================= ROUTES =================

// Endpoint untuk New Episodes (Latest)
app.get('/api/latest', async (req, res) => {
  try {
    const page = req.query.page || 1;
    const data = await getLatestEpisodes(page);
    res.json(data);
  } catch (e) {
    res.status(500).json({ 
      error: e.message,
      status: 'failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'kuronime-scraper',
    timestamp: new Date().toISOString()
  });
});

// ================= SERVER =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Kuronime Scraper API ready at http://localhost:${PORT}`);
  console.log(`Test: http://localhost:${PORT}/api/latest`);
});

module.exports = app;