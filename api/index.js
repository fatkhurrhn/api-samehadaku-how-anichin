const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PROXY = 'https://cors.caliph.my.id/'; 
const SAMEHADAKU_URL = 'https://v1.samehadaku.how';
const ANICHIN_URL = 'https://anichin.moe';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
};

const handleResponse = (data) => data || [];
const handleError = (error, defaultValue = []) => {
  console.error('API Error:', error.message);
  return defaultValue;
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


// Constants untuk source
const SOURCES = {
  SAMEHADAKU: 'samehadaku',
  ANICHIN: 'anichin'
};

// ==================== SEARCH FUNCTION ====================

async function searchSamehadaku(query) {
  try {
    const url = `${SAMEHADAKU_URL}/?s=${encodeURIComponent(query)}`;
    const res = await axios.get(`${PROXY}${url}`, { headers, timeout: 10000 });
    const $ = cheerio.load(res.data);
    const data = [];

    $('.animpost').each((_, e) => {
      data.push({
        title: $(e).find('.data .title h2').text().trim(),
        image: $(e).find('.content-thumb img').attr('src'),
        type: $(e).find('.type').text().trim(),
        score: $(e).find('.score').text().trim(),
        url: $(e).find('a').attr('href'),
        source: SOURCES.SAMEHADAKU
      });
    });

    return {
      success: true,
      total: data.length,
      data: data,
      source: SOURCES.SAMEHADAKU,
      scraped_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('Samehadaku search error:', error.message);
    return {
      success: false,
      error: error.message,
      total: 0,
      data: [],
      source: SOURCES.SAMEHADAKU,
      scraped_at: new Date().toISOString()
    };
  }
}

async function searchAnichin(query, page = 1) {
  try {
    if (!query) {
      return {
        success: false,
        error: 'Query parameter is required'
      };
    }

    const pageNum = parseInt(page) || 1;
    
    const url = pageNum === 1 
      ? `${ANICHIN_URL}/?s=${encodeURIComponent(query)}`
      : `${ANICHIN_URL}/page/${pageNum}/?s=${encodeURIComponent(query)}`;
    
    console.log(`Searching Anichin for "${query}" page ${pageNum} from: ${url}`);
    
    const res = await axios.get(`${PROXY}${url}`, { 
      headers: {
        ...headers,
        'Referer': ANICHIN_URL,
        'Origin': ANICHIN_URL
      }, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(res.data);
    const data = [];

    $('.listupd article.bs').each((_, el) => {
      const $el = $(el);
      const link = $el.find('.bsx a').first();
      
      let title = link.attr('title') || '';
      
      if (!title) {
        const $tt = $el.find('.tt');
        const $ttClone = $tt.clone();
        $ttClone.find('h2').remove();
        title = $ttClone.text().trim();
      }
      
      let itemUrl = link.attr('href') || '';
      if (itemUrl && !itemUrl.startsWith('http')) {
        itemUrl = itemUrl.startsWith('/') ? `${ANICHIN_URL}${itemUrl}` : `${ANICHIN_URL}/${itemUrl}`;
      }

      let cleanUrl = itemUrl;
      let path = itemUrl.replace(ANICHIN_URL, '');
      
      path = path.replace(/-episode-\d+-subtitle-indonesia/gi, '');
      path = path.replace(/-episode-\d+/gi, '');
      path = path.replace(/-season-\d+-episode-\d+/gi, '');
      path = path.replace(/-subtitle-indonesia/gi, '');
      path = path.replace(/\/\/+/g, '/');
      
      if (!path.startsWith('/')) path = `/${path}`;
      if (!path.endsWith('/')) path = `${path}/`;
      
      cleanUrl = `${ANICHIN_URL}${path}`;

      let image = $el.find('.limit img').first().attr('src') || '';
      if (image && !image.startsWith('http')) {
        image = image.startsWith('//') ? `https:${image}` : `https://${image}`;
      }

      const type = $el.find('.limit .typez').text().trim() || 'Donghua';
      const status = $el.find('.limit .status').text().trim() || '';
      const episode = $el.find('.bt .epx').text().trim() || '';
      const isHot = $el.find('.limit .hotbadge').length > 0;
      const subBadge = $el.find('.bt .sb').text().trim() || 'Sub';

      if (title && itemUrl) {
        data.push({
          title: title.trim(),
          url: {
            detail: itemUrl,
            clean: cleanUrl,
          },
          image: image,
          type: type,
          status: status,
          episode: episode,
          is_hot: isHot,
          sub_badge: subBadge,
          source: SOURCES.ANICHIN
        });
      }
    });

    const pagination = {};
    const paginationEl = $('.pagination');
    
    if (paginationEl.length) {
      const currentPage = paginationEl.find('span[aria-current="page"]').text().trim();
      pagination.current = parseInt(currentPage) || pageNum;
      
      const pageLinks = paginationEl.find('a.page-numbers');
      let totalPages = 0;
      
      pageLinks.each((_, el) => {
        const $el = $(el);
        if ($el.hasClass('prev') || $el.hasClass('next')) return;
        
        const pageNum = parseInt($el.text().trim());
        if (!isNaN(pageNum) && pageNum > totalPages) {
          totalPages = pageNum;
        }
      });
      
      const lastPageLink = paginationEl.find('a.page-numbers:not(.prev):not(.next)').last();
      if (lastPageLink.length) {
        const lastPage = parseInt(lastPageLink.text().trim());
        if (!isNaN(lastPage) && lastPage > totalPages) {
          totalPages = lastPage;
        }
      }
      
      pagination.total = totalPages || 1;
      
      const nextLink = paginationEl.find('a.next.page-numbers');
      const prevLink = paginationEl.find('a.prev.page-numbers');
      
      pagination.has_next = nextLink.length > 0;
      pagination.has_prev = prevLink.length > 0 || pageNum > 1;
      pagination.next_page = pagination.has_next ? pageNum + 1 : null;
      pagination.prev_page = pagination.has_prev ? pageNum - 1 : null;
      
      const paginationText = paginationEl.find('span:not(.page-numbers)').text().trim();
      pagination.info = paginationText || `Page ${pageNum} of ${totalPages}`;
      
    } else {
      pagination.current = pageNum;
      pagination.total = 1;
      pagination.has_next = false;
      pagination.has_prev = pageNum > 1;
      pagination.next_page = null;
      pagination.prev_page = pageNum > 1 ? pageNum - 1 : null;
    }

    console.log(`Found ${data.length} results for "${query}" on page ${pageNum} (total pages: ${pagination.total})`);

    return {
      success: true,
      search: {
        query: query,
        total_results: data.length,
        total_pages: pagination.total,
        current_page: pageNum
      },
      page: pageNum,
      total_pages: pagination.total,
      total_items: data.length,
      has_next: pagination.has_next,
      has_prev: pagination.has_prev,
      pagination: {
        current: pageNum,
        total: pagination.total,
        has_next: pagination.has_next,
        has_prev: pagination.has_prev,
        next_page: pagination.next_page,
        prev_page: pagination.prev_page,
        info: pagination.info
      },
      data: data,
      source: SOURCES.ANICHIN,
      scraped_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Search Anichin error:', error.message);
    return {
      success: false,
      error: error.message,
      query: query || null,
      page: page || 1,
      total_pages: 0,
      total_items: 0,
      has_next: false,
      has_prev: false,
      data: [],
      source: SOURCES.ANICHIN,
      scraped_at: new Date().toISOString()
    };
  }
}

app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    const page = req.query.page || 1;
    const sourceFilter = req.query.source || 'all'; // 'samehadaku', 'anichin', 'all'
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required',
        example: '/api/search?q=naruto'
      });
    }

    console.log(`[SEARCH] Query: "${query}", Page: ${page}, Source filter: ${sourceFilter}`);

    // Execute searches in parallel based on filter
    let results = {};
    let searchPromises = [];

    if (sourceFilter === 'all' || sourceFilter === 'samehadaku') {
      searchPromises.push(
        searchSamehadaku(query)
          .then(result => results.samehadaku = result)
          .catch(err => results.samehadaku = { success: false, error: err.message, data: [] })
      );
    }

    if (sourceFilter === 'all' || sourceFilter === 'anichin') {
      searchPromises.push(
        searchAnichin(query, page)
          .then(result => results.anichin = result)
          .catch(err => results.anichin = { success: false, error: err.message, data: [] })
      );
    }

    // Wait for all searches to complete
    await Promise.all(searchPromises);

    // Combine all data
    const allData = [
      ...(results.samehadaku?.data || []),
      ...(results.anichin?.data || [])
    ];

    // Calculate totals
    const totalSamehadaku = results.samehadaku?.data?.length || 0;
    const totalAnichin = results.anichin?.data?.length || 0;
    const totalAll = totalSamehadaku + totalAnichin;

    // Prepare response
    const response = {
      success: true,
      query: query,
      page: sourceFilter === 'anichin' ? parseInt(page) : 1,
      filters: {
        source: sourceFilter,
        available_sources: ['samehadaku', 'anichin']
      },
      summary: {
        total_results: totalAll,
        sources: {
          samehadaku: {
            total: totalSamehadaku,
            success: results.samehadaku?.success || false,
            ...(results.samehadaku?.error && { error: results.samehadaku.error })
          },
          anichin: {
            total: totalAnichin,
            current_page: results.anichin?.page || 1,
            total_pages: results.anichin?.total_pages || 1,
            has_next: results.anichin?.has_next || false,
            has_prev: results.anichin?.has_prev || false,
            success: results.anichin?.success || false,
            ...(results.anichin?.error && { error: results.anichin.error })
          }
        }
      },
      data: allData,
      pagination: {
        anichin: results.anichin?.pagination || null
      },
      scraped_at: new Date().toISOString()
    };

    // Add source-specific pagination info if needed
    if (sourceFilter === 'anichin' && results.anichin?.pagination) {
      response.pagination = {
        current: results.anichin.page,
        total: results.anichin.total_pages,
        has_next: results.anichin.has_next,
        has_prev: results.anichin.has_prev,
        next_page: results.anichin.pagination?.next_page,
        prev_page: results.anichin.pagination?.prev_page
      };
    }

    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // Cache 5 menit

    res.json(response);
    
  } catch (error) {
    console.error('Search endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// Keep the old endpoints for backward compatibility if needed
app.get('/api/anime/search', async (req, res) => {
  if (!req.query.q) return res.json([]);
  const data = await searchSamehadaku(req.query.q);
  res.json(data);
});

app.get('/api/donghua/search', async (req, res) => {
  try {
    const query = req.query.q;
    const page = req.query.page || 1;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required'
      });
    }
    
    const data = await searchAnichin(query, page);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    
    res.json(data);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// ================= ENDPOINT API SAMEHADAKU =================

// GET /api/anime/latest atau /api/anime/latest?page=10 atau /api/anime/latest/10
async function getSamehadakuLatest(page = 1) {
  try {
    const pageNum = parseInt(page) || 1;
    
    // Bangun URL dengan benar
    let url;
    if (pageNum === 1) {
      url = `${SAMEHADAKU_URL}/anime-terbaru/`;
    } else {
      url = `${SAMEHADAKU_URL}/anime-terbaru/page/${pageNum}/`;
    }
    
    console.log('Fetching latest anime from:', url);
    
    const res = await axios.get(`${PROXY}${url}`, { 
      headers, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(res.data);
    const data = [];

    // SELECTOR YANG BENAR berdasarkan struktur HTML
    // Di HTML menggunakan: .post-show ul li
    const items = $('.post-show ul li').toArray();
    
    console.log(`Found ${items.length} items on page ${pageNum}`);
    
    // Proses items satu per satu (tanpa concurrent request dulu untuk testing)
    for (const element of items) {
      const $el = $(element);
      
      // ========== AMBIL DATA DARI HTML ==========
      
      // Title - dari h2.entry-title a
      const title = $el.find('.dtla h2.entry-title a').text().trim();
      
      // URL Anime
      const animeUrl = $el.find('.dtla h2.entry-title a').attr('href');
      
      // Image - dari .thumb img
      let image = $el.find('.thumb img').attr('src') || '';
      
      // Episode - dari span dengan icon play
      let episode = '';
      const episodeSpan = $el.find('.dtla span:has(.dashicons-controls-play) author[itemprop="name"]');
      if (episodeSpan.length) {
        episode = episodeSpan.text().trim();
      }
      
      // Posted by - dari span dengan icon admin-users
      let postedBy = '';
      const authorSpan = $el.find('.dtla span:has(.dashicons-admin-users) author[itemprop="name"]');
      if (authorSpan.length) {
        postedBy = authorSpan.text().trim();
      }
      
      // Released on - dari span dengan icon calendar
      let releasedOn = '';
      const releasedSpan = $el.find('.dtla span:has(.dashicons-calendar)');
      if (releasedSpan.length) {
        // Ambil text setelah "Released on:"
        const fullText = releasedSpan.text().trim();
        const rawReleasedOn = fullText.replace('Released on', '').replace(':', '').trim();
        
        // Konversi ke format sederhana
        releasedOn = convertToSimpleFormat(rawReleasedOn);
      }
      
      // Skip jika tidak ada title
      if (!title || !animeUrl) continue;
      
      console.log(`Processing: ${title}, URL: ${animeUrl}`);
      
      // ========== AMBIL GAMBAR DARI HALAMAN DETAIL ==========
      let detailImage = '';
      try {
        // Request ke halaman detail anime
        console.log(`Fetching detail for ${title}...`);
        const detailRes = await axios.get(`${PROXY}${animeUrl}`, { 
          headers, 
          timeout: 8000
        });
        
        const $$ = cheerio.load(detailRes.data);
        
        // Ambil gambar dari meta og:image (sama seperti di endpoint detail)
        detailImage = $$('meta[property="og:image"]').attr('content') || 
                      $$('.thumb img').attr('src') || 
                      $$('meta[name="twitter:image"]').attr('content') ||
                      '';
        
        // Bersihkan URL
        if (detailImage) {
          if (detailImage.startsWith('http:')) {
            detailImage = detailImage.replace('http:', 'https:');
          } else if (detailImage.startsWith('//')) {
            detailImage = 'https:' + detailImage;
          }
        }
        
        console.log(`✅ Got detail image for ${title}: ${detailImage}`);
        
        // Delay kecil biar gak kena rate limit
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (detailError) {
        console.log(`❌ Failed to get detail image for ${title}:`, detailError.message);
        // Fallback ke thumbnail
        detailImage = image;
      }
      
      data.push({
        title: title,
        url: animeUrl,
        image: detailImage || image, // Prioritaskan gambar dari halaman detail
        episode: episode,
        released_on: releasedOn, // Sudah dalam format sederhana (1h, 1d, dll)
        posted_by: postedBy,
        source: 'samehadaku',
        type: 'Anime',
        page: pageNum
      });
    }

    // ========== PAGINATION ==========
    const pagination = {};
    const paginationEl = $('.pagination');
    if (paginationEl.length) {
      // Current page
      const currentPage = paginationEl.find('.page-numbers.current').text().trim();
      
      // Total pages - cari link halaman terakhir
      let totalPages = currentPage;
      paginationEl.find('a:not(.arrow_pag)').each((_, el) => {
        const pageNum = $(el).text().trim();
        if (pageNum && !isNaN(pageNum) && parseInt(pageNum) > parseInt(totalPages)) {
          totalPages = pageNum;
        }
      });
      
      // Next/Prev buttons
      const nextLink = paginationEl.find('a.arrow_pag .fa-caret-right').closest('a');
      const prevLink = paginationEl.find('a.arrow_pag .fa-caret-left').closest('a');
      
      pagination.current = parseInt(currentPage) || pageNum;
      pagination.total = parseInt(totalPages) || 0;
      pagination.has_next = nextLink.length > 0;
      pagination.has_prev = prevLink.length > 0;
      pagination.next_url = nextLink.attr('href') || null;
      pagination.prev_url = prevLink.attr('href') || null;
    }

    return {
      success: true,
      data: data,
      pagination: pagination,
      total: data.length,
      source: 'samehadaku',
      scraped_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Latest Samehadaku error:', error.message);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Fungsi helper untuk mengkonversi format waktu ke format sederhana
function convertToSimpleFormat(timeString) {
  if (!timeString) return '';
  
  // Contoh input: "4 hours yang lalu", "1 day yang lalu", "2 days yang lalu", "30 minutes yang lalu"
  const lowerTime = timeString.toLowerCase();
  
  // Deteksi jam
  if (lowerTime.includes('hour') || lowerTime.includes('hours') || lowerTime.includes('jam')) {
    const match = lowerTime.match(/(\d+)\s*(?:hour|hours|jam)/);
    if (match) {
      return `${match[1]}h`;
    }
  }
  
  // Deteksi hari
  if (lowerTime.includes('day') || lowerTime.includes('days') || lowerTime.includes('hari')) {
    const match = lowerTime.match(/(\d+)\s*(?:day|days|hari)/);
    if (match) {
      return `${match[1]}d`;
    }
  }
  
  // Deteksi menit
  if (lowerTime.includes('minute') || lowerTime.includes('minutes') || lowerTime.includes('menit')) {
    const match = lowerTime.match(/(\d+)\s*(?:minute|minutes|menit)/);
    if (match) {
      return `${match[1]}m`;
    }
  }
  
  // Deteksi detik
  if (lowerTime.includes('second') || lowerTime.includes('seconds') || lowerTime.includes('detik')) {
    const match = lowerTime.match(/(\d+)\s*(?:second|seconds|detik)/);
    if (match) {
      return `${match[1]}s`;
    }
  }
  
  // Deteksi minggu
  if (lowerTime.includes('week') || lowerTime.includes('weeks') || lowerTime.includes('minggu')) {
    const match = lowerTime.match(/(\d+)\s*(?:week|weeks|minggu)/);
    if (match) {
      return `${match[1]}w`;
    }
  }
  
  // Deteksi bulan
  if (lowerTime.includes('month') || lowerTime.includes('months') || lowerTime.includes('bulan')) {
    const match = lowerTime.match(/(\d+)\s*(?:month|months|bulan)/);
    if (match) {
      return `${match[1]}mo`;
    }
  }
  
  // Deteksi tahun
  if (lowerTime.includes('year') || lowerTime.includes('years') || lowerTime.includes('tahun')) {
    const match = lowerTime.match(/(\d+)\s*(?:year|years|tahun)/);
    if (match) {
      return `${match[1]}y`;
    }
  }
  
  // Jika tidak cocok dengan pola di atas, kembalikan string asli
  return timeString;
}

// Endpoint untuk /api/anime/latest
app.get('/api/anime/latest', async (req, res) => {
  try {
    const page = req.query.page || 1;
    const data = await getSamehadakuLatest(page);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// Endpoint untuk /api/anime/latest/:page
app.get('/api/anime/latest/:page', async (req, res) => {
  try {
    const page = req.params.page || 1;
    const data = await getSamehadakuLatest(page);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// ==================== SAMEHADAKU TOP 10 WEEKLY ====================
async function getSamehadakuTop10() {
  try {
    const url = SAMEHADAKU_URL; // https://v1.samehadaku.how
    console.log(`Fetching Samehadaku Top 10 from: ${url}`);
    
    const response = await axios.get(`${PROXY}${url}`, { 
      headers, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(response.data);
    const top10List = [];

    // SELECTOR UNTUK TOP 10 MINGGU INI
    // Berdasarkan HTML, struktur top 10 ada di dalam .topten-animesu ul li
    $('.topten-animesu ul li').each((index, element) => {
      const $el = $(element);
      const linkElement = $el.find('a.series');
      
      // ===== 1. RANK =====
      let rank = index + 1; // Default berdasarkan urutan
      
      // Coba ambil dari elemen .is-topten
      const rankElement = $el.find('.is-topten b:last-child');
      if (rankElement.length) {
        const rankText = rankElement.text().trim();
        const rankNum = parseInt(rankText);
        if (!isNaN(rankNum)) {
          rank = rankNum;
        }
      }

      // ===== 2. TITLE =====
      const title = $el.find('.judul').text().trim() || 
                    linkElement.attr('title') || 
                    'Unknown Title';

      // ===== 3. URL =====
      let url = linkElement.attr('href') || '';
      if (url && !url.startsWith('http')) {
        url = url.startsWith('/') ? `${SAMEHADAKU_URL}${url}` : `${SAMEHADAKU_URL}/${url}`;
      }

      // ===== 4. IMAGE =====
      let image = $el.find('img').attr('src') || '';
      if (image && !image.startsWith('http')) {
        image = image.startsWith('//') ? `https:${image}` : `https://${image}`;
      }

      // ===== 5. RATING =====
      let rating = '';
      const ratingSpan = $el.find('.rating');
      if (ratingSpan.length) {
        rating = ratingSpan.text().replace('', '').replace('fa-star', '').trim();
      }

      // Hanya push jika title dan url ada
      if (title && url) {
        top10List.push({
          rank: rank,
          title: title,
          url: url,
          image: image,
          rating: rating,
          source: 'samehadaku'
        });
      }
    });

    // Urutkan berdasarkan rank (1-10)
    top10List.sort((a, b) => a.rank - b.rank);

    console.log(`✅ Successfully fetched ${top10List.length} items for Top 10 Weekly`);

    return {
      success: true,
      total: top10List.length,
      title: "Top 10 Anime Minggu Ini",
      updated_at: new Date().toISOString(),
      data: top10List,
      source: 'samehadaku'
    };
    
  } catch (error) {
    console.error('❌ Get Samehadaku Top 10 error:', error.message);
    return {
      success: false,
      error: error.message,
      total: 0,
      data: [],
      scraped_at: new Date().toISOString()
    };
  }
}

// ==================== ENDPOINT TOP 10 ====================
app.get('/api/anime/top-10', async (req, res) => {
  try {
    const result = await getSamehadakuTop10();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // Cache 1 jam
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// GET /api/anime/detail atau /api/anime/detail/megami-ryou-no-ryoubo-kun 
async function detailSamehadaku(link) {
  try {
    // Validasi link
    if (!link) {
      console.error('Detail Samehadaku error: link is undefined');
      return {
        success: false,
        error: 'Link is required'
      };
    }
    
    // Bangun target URL
    let targetUrl;
    if (link.startsWith('http')) {
      targetUrl = link;
    } else if (link.startsWith('/')) {
      targetUrl = `${SAMEHADAKU_URL}${link}`;
    } else {
      targetUrl = `${SAMEHADAKU_URL}/${link}`;
    }
    
    console.log('Target URL:', targetUrl);
    
    // Request dengan timeout lebih lama
    const res = await axios.get(`${PROXY}${targetUrl}`, { 
      headers, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(res.data);
    
    // ========== 1. INFORMASI DASAR ==========
    // Title - bersihkan dari "Subtitle Indonesia - Samehadaku"
    let title = $('title').text().trim();
    title = title.replace(' - Samehadaku', '').replace('Subtitle Indonesia', '').trim();
    
    // Image dari meta og:image
    const image = $('meta[property="og:image"]').attr('content') || 
                  $('.thumb img').attr('src') || 
                  $('meta[name="twitter:image"]').attr('content');
    
    // Description
    const description = $('.entry-content-single').text().trim() || 
                        $('meta[name="description"]').attr('content') ||
                        $('.desc .entry-content').text().trim();
    
    // Sinopsis lengkap (paragraf)
    const synopsis = [];
    $('.desc .entry-content p').each((_, el) => {
      synopsis.push($(el).text().trim());
    });
    
    // ========== 2. INFORMASI DETAIL (PERBAIKAN) ==========
    const info = {};
    
    // Method 1: Ambil dari selector spesifik berdasarkan struktur HTML yang diberikan
    $('.anim-senct .right-senc .spe span, .infoanime .infox .spe span').each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      
      // Skip jika teks kosong
      if (!text) return;
      
      // Cari format "Key: Value" atau "Key Value"
      if (text.includes(':')) {
        const colonIndex = text.indexOf(':');
        let key = text.substring(0, colonIndex).trim().toLowerCase().replace(/\s+/g, '_');
        let value = text.substring(colonIndex + 1).trim();
        
        // Bersihkan key dari karakter tidak perlu
        key = key.replace(/[^a-zA-Z0-9_]/g, '');
        
        // Simpan jika key dan value valid
        if (key && value) {
          info[key] = value;
        }
      } 
      // Alternatif format: "<b>Key</b> Value" (cek HTML)
      else {
        const boldText = $el.find('b').text().trim();
        if (boldText) {
          const key = boldText.toLowerCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
          const value = text.replace(boldText, '').replace(':', '').trim();
          if (key && value) {
            info[key] = value;
          }
        }
      }
    });
    
    // Method 2: Jika masih kosong, coba parsing dari tabel informasi
    if (Object.keys(info).length < 5) {
      console.log('Method 1 failed, trying Method 2...');
      
      // Ambil semua teks dari elemen info
      const infoTexts = [];
      $('.infoanime .infox .spe, .anim-senct .right-senc .spe').each((_, el) => {
        $(el).contents().each((_, node) => {
          if (node.type === 'text' && node.data.trim()) {
            infoTexts.push(node.data.trim());
          } else if (node.type === 'tag') {
            const tagText = $(node).text().trim();
            if (tagText) infoTexts.push(tagText);
          }
        });
      });
      
      // Parse setiap teks yang mengandung ":"
      infoTexts.forEach(text => {
        if (text.includes(':')) {
          const colonIndex = text.indexOf(':');
          let key = text.substring(0, colonIndex).trim().toLowerCase().replace(/\s+/g, '_');
          let value = text.substring(colonIndex + 1).trim();
          
          key = key.replace(/[^a-zA-Z0-9_]/g, '');
          
          // Mapping key ke format yang diinginkan
          const keyMapping = {
            'japanese': 'japanese',
            'jepang': 'japanese',
            'synonyms': 'synonyms',
            'sinonim': 'synonyms',
            'english': 'english',
            'inggris': 'english',
            'status': 'status',
            'type': 'type',
            'tipe': 'type',
            'source': 'source',
            'sumber': 'source',
            'duration': 'duration',
            'durasi': 'duration',
            'total_episode': 'total_episode',
            'episode': 'total_episode',
            'season': 'season',
            'musim': 'season',
            'studio': 'studio',
            'producers': 'producers',
            'produser': 'producers',
            'released': 'released',
            'rilis': 'released',
            'rating': 'rating'
          };
          
          const mappedKey = keyMapping[key] || key;
          if (value && !info[mappedKey]) {
            info[mappedKey] = value;
          }
        }
      });
    }
    
    // Method 3: Parsing manual berdasarkan struktur yang terlihat di HTML
    if (Object.keys(info).length < 5) {
      console.log('Method 2 failed, trying Method 3 (manual parsing)...');
      
      // Ambil semua elemen yang mungkin berisi info
      $('.spe span, .infox .spe, .infoanime .infox').each((_, el) => {
        const html = $(el).html() || '';
        const text = $(el).text().trim();
        
        // Pattern untuk mencari "Key: Value"
        const patterns = [
          /Japanese\s*:?\s*([^<\n]+)/i,
          /Synonyms\s*:?\s*([^<\n]+)/i,
          /English\s*:?\s*([^<\n]+)/i,
          /Status\s*:?\s*([^<\n]+)/i,
          /Type\s*:?\s*([^<\n]+)/i,
          /Source\s*:?\s*([^<\n]+)/i,
          /Duration\s*:?\s*([^<\n]+)/i,
          /Total\s*Episode\s*:?\s*([^<\n]+)/i,
          /Season\s*:?\s*([^<\n]+)/i,
          /Studio\s*:?\s*([^<\n]+)/i,
          /Producers\s*:?\s*([^<\n]+)/i,
          /Released\s*:?\s*([^<\n]+)/i,
          /Rating\s*:?\s*([^<\n]+)/i
        ];
        
        patterns.forEach(pattern => {
          const match = html.match(pattern);
          if (match && match[1]) {
            const key = pattern.toString().split('\\s*')[0].replace('/', '').toLowerCase();
            const value = match[1].trim().replace(/<[^>]*>/g, '');
            
            const keyMapping = {
              'japanese': 'japanese',
              'synonyms': 'synonyms',
              'english': 'english',
              'status': 'status',
              'type': 'type',
              'source': 'source',
              'duration': 'duration',
              'total': 'total_episode',
              'season': 'season',
              'studio': 'studio',
              'producers': 'producers',
              'released': 'released',
              'rating': 'rating'
            };
            
            const mappedKey = keyMapping[key] || key;
            if (value && !info[mappedKey]) {
              info[mappedKey] = value;
            }
          }
        });
      });
    }
    
    // Debug: log info yang berhasil diambil
    console.log('Info yang berhasil diambil:', info);
    
    // ========== 3. GENRE (HANYA DARI GENRE-INFO) ==========
    const genres = [];
    $('div.genre-info a[rel="tag"], div.genre-info a[itemprop="genre"]').each((_, el) => {
      const genre = $(el).text().trim();
      if (genre) {
        genres.push(genre);
      }
    });

// Alternatif jika selector di atas tidak bekerja, gunakan yang lebih spesifik
if (genres.length === 0) {
  $('.genre-info a').each((_, el) => {
    const genre = $(el).text().trim();
    if (genre) {
      genres.push(genre);
    }
  });
}
    
    // ========== 4. RATING ==========
    let rating = info.rating || null;
    if (!rating) {
      const ratingEl = $('.rating-area .rtg .archiveanime-rating span[itemprop="ratingValue"]');
      if (ratingEl.length) {
        rating = ratingEl.first().text().trim();
      } else {
        rating = $('meta[itemprop="ratingValue"]').attr('content');
      }
    }
    
    // ========== 5. EPISODES ==========
    const episodes = [];
    $('.lstepsiode ul li').each((_, e) => {
      const $el = $(e);
      
      // Episode number
      let episodeNum = '';
      const epsLink = $el.find('.epsright .eps a');
      if (epsLink.length) {
        episodeNum = epsLink.text().trim();
      }
      
      // Title episode
      let episodeTitle = '';
      const titleLink = $el.find('.epsleft .lchx a');
      if (titleLink.length) {
        episodeTitle = titleLink.text().trim();
      }
      
      // URL episode
      const episodeUrl = titleLink.attr('href') || epsLink.attr('href');
      
      // Tanggal rilis episode
      let episodeDate = '';
      const dateSpan = $el.find('.epsleft .date');
      if (dateSpan.length) {
        episodeDate = dateSpan.text().trim();
      }
      
      if (episodeTitle || episodeNum) {
        episodes.push({
          episode: episodeNum,
          title: episodeTitle,
          url: episodeUrl,
          date: episodeDate,
          full_title: episodeTitle || `Episode ${episodeNum}`
        });
      }
    });

    // ========== 7. REKOMENDASI ANIME ==========
    const recommendations = [];

    // Ambil dari struktur widget-post > widgetseries > rand-animesu > ul > li
    $('.widget-post .widgetseries .rand-animesu ul li').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a.series');
      
      // Rating
      let rating = '';
      const ratingSpan = $el.find('.rating');
      if (ratingSpan.length) {
        rating = ratingSpan.text().replace('★', '').replace('fa-star', '').trim();
      }
      
      // Episode info
      let episodeInfo = '';
      const episodeSpan = $el.find('.episode');
      if (episodeSpan.length) {
        episodeInfo = episodeSpan.text().trim();
      }
      
      // Judul
      let title = '';
      const titleSpan = $el.find('.judul');
      if (titleSpan.length) {
        title = titleSpan.text().trim();
      } else {
        title = link.attr('title') || '';
      }
      
      // Image
      const image = $el.find('img').attr('src');
      
      // URL
      const url = link.attr('href');
      
      // Hanya push jika memiliki title
      if (title && url) {
        recommendations.push({
          title: title,
          url: url,
          image: image,
          rating: rating,
          episode_info: episodeInfo,
          source: 'samehadaku'
        });
      }
    });

    // Alternatif: selector yang lebih luas jika yang di atas tidak bekerja
    if (recommendations.length === 0) {
      console.log('Mencoba selector alternatif untuk rekomendasi...');
      
      $('.rand-animesu ul li').each((_, el) => {
        const $el = $(el);
        const link = $el.find('a');
        
        recommendations.push({
          title: $el.find('.judul').text().trim() || link.attr('title'),
          url: link.attr('href'),
          image: $el.find('img').attr('src'),
          rating: $el.find('.rating').text().replace('★', '').trim(),
          episode_info: $el.find('.episode').text().trim(),
          source: 'samehadaku'
        });
      });
    }
    
    // ========== 6. BUILD RESPONSE ==========
    return {
      success: true,
      data: {
        // Informasi dasar
        title: title,
        image: image,
        description: description,
        synopsis: synopsis.length > 0 ? synopsis : description,
        
        // Detail anime (dengan fallback value)
        details: {
          japanese: info.japanese || info.jepang || '',
          synonyms: info.synonyms || info.sinonim || '',
          english: info.english || info.inggris || '',
          status: info.status || 'Unknown',
          type: info.type || info.tipe || 'TV',
          source: info.source || info.sumber || '',
          duration: info.duration || info.durasi || '',
          total_episode: info.total_episode || info.episode || '',
          season: info.season || info.musim || '',
          studio: info.studio || '',
          producers: info.producers || info.produser || '',
          released: info.released || info.rilis || '',
          rating: rating || ''
        },
        
        // Genre
        genres: genres,
        
        // Episode list
        episodes: episodes,
        total_episodes_found: episodes.length,

        // Rekomendasi anime
        recommendations: recommendations,
        total_recommendations: recommendations.length,
        
        // Episode stats
        episode_stats: {
          latest_episode: episodes.length > 0 ? episodes[0].episode : null,
          latest_episode_date: episodes.length > 0 ? episodes[0].date : null,
          first_episode: episodes.length > 0 ? episodes[episodes.length - 1].episode : null,
          first_episode_date: episodes.length > 0 ? episodes[episodes.length - 1].date : null
        },
        
        // Metadata
        source: 'samehadaku',
        url: targetUrl,
        scraped_at: new Date().toISOString()
      }
    };

    
    
  } catch (error) {
    console.error('Detail Samehadaku error:', error.message);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Endpoint dengan wildcard untuk menangkap seluruh path setelah /detail/
app.get('/api/anime/detail/*', async (req, res) => {
  try {
    const fullPath = req.params[0]; // Menangkap "darwin-jihen" atau "anime/darwin-jihen"
    
    if (!fullPath) {
      return res.status(400).json({ success: false, error: 'Slug parameter required' });
    }
    
    // --- PERBAIKAN DI SINI ---
    // Hapus 'anime/' dari awal jika sudah ada, lalu tambahkan lagi
    let cleanSlug = fullPath.replace(/^anime\//, ''); // Hapus 'anime/' jika diawali
    // Format URL yang benar: https://v1.samehadaku.how/anime/{cleanSlug}/
    const urlParam = `/anime/${cleanSlug}/`; 
    // -------------------------
    
    console.log('Formatted URL param:', urlParam); // Akan jadi /anime/darwin-jihen/
    
    const data = await detailSamehadaku(urlParam);
    res.json(data);
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/anime/watch atau /api/anime/watch/ao-no-miburo-season-2-episode-2 
async function watchSamehadaku(link) {
  try {
    // Validasi link
    if (!link) {
      console.error('Watch Samehadaku error: link is undefined');
      return {
        success: false,
        error: 'Link is required'
      };
    }
    
    // Bangun target URL
    const targetUrl = link.startsWith('http') ? link : `${SAMEHADAKU_URL}${link}`;
    console.log('Watch URL:', targetUrl);
    
    // Request dengan timeout
    const res = await axios.get(`${PROXY}${targetUrl}`, { 
      headers, 
      timeout: 15000 
    });
    
    // Ambil cookies untuk request selanjutnya
    const cookies = res.headers['set-cookie']?.map(v => v.split(';')[0]).join('; ') || '';
    
    const $ = cheerio.load(res.data);
    
    // ========== 1. INFORMASI DASAR EPISODE ==========
    // Title dari h1
    let title = $('h1.entry-title[itemprop="name"]').text().trim();
    if (!title) {
      title = $('title').text().replace(' - Samehadaku', '').trim();
    }
    
    // Episode number
    let episodeNumber = '';
    const episodeSpan = $('span[itemprop="episodeNumber"]').text().trim();
    if (episodeSpan) {
      episodeNumber = episodeSpan;
    } else {
      // Coba ambil dari judul
      const episodeMatch = title.match(/Episode (\d+)/i);
      if (episodeMatch) {
        episodeNumber = episodeMatch[1];
      }
    }
    
    // Release date / waktu posting
    let releaseDate = '';
    const timePost = $('.sbdbti .time-post').text().trim();
    if (timePost) {
      releaseDate = timePost.replace('yang lalu', '').trim();
    } else {
      releaseDate = $('meta[property="article:published_time"]').attr('content');
    }
    
    // Author / posted by
    let author = '';
    const authorMeta = $('meta[name="author"]').attr('content');
    if (authorMeta) {
      author = authorMeta;
    } else {
      author = $('.author vcard').text().trim();
    }
    
    // Description
    const description = $('meta[name="description"]').attr('content') || 
                        $('.entry-content-single').text().trim();
    
    // Image thumbnail
    const image = $('meta[property="og:image"]').attr('content') || 
                  $('.thumb img').attr('src');
    
    // ========== 2. STREAMING SERVERS ==========
    const streams = [];
    
    // Loop semua server yang tersedia
    for (const li of $('div#server > ul > li').toArray()) {
      const $li = $(li);
      const div = $li.find('div');
      const post = div.attr('data-post');
      const nume = div.attr('data-nume');
      const type = div.attr('data-type');
      const name = $li.find('span').text().trim();
      
      if (!post) continue;
      
      const body = new URLSearchParams({ 
        action: 'player_ajax', 
        post, 
        nume, 
        type 
      }).toString();
      
      try {
        const r = await axios.post(
          `${PROXY}${SAMEHADAKU_URL}/wp-admin/admin-ajax.php`,
          body,
          {
            headers: {
              ...headers,
              'Content-Type': 'application/x-www-form-urlencoded',
              'Cookie': cookies,
              'Referer': targetUrl,
              'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 10000
          }
        );
        
        const $$ = cheerio.load(r.data);
        const iframe = $$('iframe').attr('src');
        
        if (iframe) {
          streams.push({ 
            server: name, 
            url: iframe,
            post_id: post,
            nume: nume,
            type: type
          });
        }
      } catch (e) {
        console.log(`Error fetching server ${name}:`, e.message);
      }
    }
    
    // ========== 3. DOWNLOAD LINKS ==========
    const downloads = {
      mkv: [],
      mp4: [],
      x265: []
    };
    
    // MKV Downloads
    $('.download-eps:contains("MKV") ul li').each((_, el) => {
      const $el = $(el);
      const quality = $el.find('strong').text().trim().replace(':', '');
      const links = [];
      
      $el.find('span a').each((_, link) => {
        links.push({
          provider: $(link).text().trim(),
          url: $(link).attr('href')
        });
      });
      
      if (quality && links.length > 0) {
        downloads.mkv.push({
          quality: quality,
          links: links
        });
      }
    });
    
    // MP4 Downloads
    $('.download-eps:contains("MP4") ul li').each((_, el) => {
      const $el = $(el);
      const quality = $el.find('strong').text().trim().replace(':', '');
      const links = [];
      
      $el.find('span a').each((_, link) => {
        links.push({
          provider: $(link).text().trim(),
          url: $(link).attr('href')
        });
      });
      
      if (quality && links.length > 0) {
        downloads.mp4.push({
          quality: quality,
          links: links
        });
      }
    });
    
    // x265 Downloads (irit kuota)
    $('.download-eps:contains("x265") ul li').each((_, el) => {
      const $el = $(el);
      const quality = $el.find('strong').text().trim().replace(':', '');
      const links = [];
      
      $el.find('span a').each((_, link) => {
        links.push({
          provider: $(link).text().trim(),
          url: $(link).attr('href')
        });
      });
      
      if (quality && links.length > 0) {
        downloads.x265.push({
          quality: quality,
          links: links
        });
      }
    });
    
    // ========== 4. NAVIGASI EPISODE ==========
    const navigation = {};
    
    // Previous episode
    const prevEpisode = $('.naveps .nvs a[href*="episode-"]').first();
    if (prevEpisode.length && !prevEpisode.hasClass('rght')) {
      navigation.prev = {
        title: prevEpisode.text().trim(),
        url: prevEpisode.attr('href')
      };
    }
    
    // Next episode
    const nextEpisode = $('.naveps .nvs.rght a');
    if (nextEpisode.length) {
      navigation.next = {
        title: nextEpisode.text().trim(),
        url: nextEpisode.attr('href')
      };
    }
    
    // All episodes link
    const allEpisodeLink = $('.naveps .nvsc a');
    if (allEpisodeLink.length) {
      navigation.all_episodes = {
        title: allEpisodeLink.text().trim(),
        url: allEpisodeLink.attr('href')
      };
    }
    
    // ========== 5. OTHER EPISODES IN SERIES ==========
    const otherEpisodes = [];
    $('.episode-lainnya .lstepsiode ul li').each((_, el) => {
      const $el = $(el);
      const link = $el.find('.lchx a');
      const date = $el.find('.date').text().trim();
      const thumbnail = $el.find('.thumbnailrighteps img').attr('src');
      
      otherEpisodes.push({
        title: link.text().trim(),
        url: link.attr('href'),
        date: date,
        thumbnail: thumbnail
      });
    });
    
    // ========== 6. SERIES INFORMATION ==========
    const seriesInfo = {};
    
    // Series title
    const seriesTitle = $('.infoanime .infox h2.entry-title').text().replace('Sinopsis Anime', '').trim();
    if (seriesTitle) {
      seriesInfo.title = seriesTitle;
    }
    
    // Series synopsis
    const synopsis = $('.infoanime .desc .entry-content').text().trim();
    if (synopsis) {
      seriesInfo.synopsis = synopsis;
    }
    
    // Series genres
    const seriesGenres = [];
    $('.infoanime .genre-info a[rel="tag"]').each((_, el) => {
      seriesGenres.push($(el).text().trim());
    });
    if (seriesGenres.length > 0) {
      seriesInfo.genres = seriesGenres;
    }
    
    // Series thumbnail
    const seriesThumb = $('.infoanime .thumb img').attr('src');
    if (seriesThumb) {
      seriesInfo.thumbnail = seriesThumb;
    }
    
    // ========== 7. RECOMMENDATIONS ==========
    const recommendations = [];
    $('.widget-post .widgetseries ul li').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a.series');
      const title = link.text().trim() || link.attr('title');
      const url = link.attr('href');
      const image = $el.find('img').attr('src');
      const date = $el.find('span:not(.genre-info)').last().text().trim();
      
      // Ambil genres jika ada
      const genres = [];
      $el.find('span a[rel="tag"]').each((_, genre) => {
        genres.push($(genre).text().trim());
      });
      
      if (title && url) {
        recommendations.push({
          title: title,
          url: url,
          image: image,
          date: date,
          genres: genres
        });
      }
    });
    
    // ========== 8. BREADCRUMB ==========
    const breadcrumb = [];
    $('#breadcrumbs ol li').each((_, el) => {
      const link = $(el).find('a');
      breadcrumb.push({
        name: link.text().trim() || $(el).text().trim(),
        url: link.attr('href') || null
      });
    });
    
    // ========== 9. BUILD RESPONSE ==========
    return {
      success: true,
      data: {
        // Episode info
        episode: {
          title: title,
          episode_number: episodeNumber,
          release_date: releaseDate,
          author: author,
          description: description,
          image: image,
          url: targetUrl
        },
        
        // Streaming servers
        streams: streams,
        total_streams: streams.length,
        
        // Download links
        downloads: downloads,
        has_downloads: downloads.mkv.length > 0 || downloads.mp4.length > 0 || downloads.x265.length > 0,
        
        // Navigation
        navigation: navigation,
        
        // Other episodes in series
        other_episodes: otherEpisodes,
        total_other_episodes: otherEpisodes.length,
        
        // Series information
        series: seriesInfo,
        
        // Recommendations
        recommendations: recommendations,
        total_recommendations: recommendations.length,
        
        // Breadcrumb
        breadcrumb: breadcrumb,
        
        // Metadata
        source: 'samehadaku',
        scraped_at: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error('Watch Samehadaku error:', error.message);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

app.get('/api/anime/watch/*', async (req, res) => {
  try {
    const fullPath = req.params[0]; 
    
    if (!fullPath) {
      return res.status(400).json({ 
        success: false, 
        error: 'Episode path required' 
      });
    }
    
    const urlParam = `/${fullPath}/`; 
    
    const data = await watchSamehadaku(urlParam);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    
    res.json(data);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// GET /api/anime/schedule - Jadwal rilis anime 
async function getSamehadakuSchedule() {
  try {
    const schedule = {
      monday: [], tuesday: [], wednesday: [], 
      thursday: [], friday: [], saturday: [], sunday: []
    };

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    for (const day of days) {
      try {
        const apiUrl = `https://v1.samehadaku.how/wp-json/custom/v1/all-schedule?perpage=20&day=${day}`;
        const res = await axios.get(`${PROXY}${apiUrl}`, { headers, timeout: 10000 });
        
        if (res.data && Array.isArray(res.data)) {
          res.data.forEach(item => {
            schedule[day].push({
              title: item.title || 'Unknown',
              url: item.url || '#',
              time: item.east_time || '00:00',
              image: item.featured_img_src || null,
              type: item.east_type || 'TV',
              score: item.east_score || '0',
              genre: item.genre || 'Anime'
            });
          });
        }
      } catch (error) {
        console.log(`Error fetching schedule for ${day}:`, error.message);
      }
      
      await delay(300);
    }

    return schedule;
  } catch (error) {
    console.error('Schedule error:', error.message);
    return {};
  }
}

app.get('/api/anime/schedule', async (req, res) => {
  const data = await getSamehadakuSchedule();
  res.json({ success: true, data, lastUpdate: new Date().toISOString() });
});

// GET /api/anime/anime-movie atau /api/anime/anime-movie?page=2 atau /api/anime/anime-movie/page/2
async function getSamehadakuAnimeMovie(page = 1) {
  try {
    // Validasi page
    const pageNum = parseInt(page) || 1;
    
    // URL halaman anime-movie dengan pagination
    const url = pageNum === 1 
      ? `${SAMEHADAKU_URL}/anime-movie/`
      : `${SAMEHADAKU_URL}/anime-movie/page/${pageNum}/`;
    
    console.log(`Fetching anime movies page ${pageNum} from: ${url}`);
    
    const response = await axios.get(`${PROXY}${url}`, { 
      headers, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(response.data);
    const movieList = [];

    // SELECTOR YANG BENAR: Setiap item ada di dalam article.animpost
    $('article.animpost').each((index, element) => {
      const $article = $(element);
      
      // Cari elemen di dalam animposx
      const animposx = $article.find('.animposx');
      const linkElement = animposx.find('a').first();
      
      // ===== 1. URL =====
      let itemUrl = linkElement.attr('href') || '';
      if (itemUrl && !itemUrl.startsWith('http')) {
        itemUrl = itemUrl.startsWith('/') ? `${SAMEHADAKU_URL}${itemUrl}` : `${SAMEHADAKU_URL}/${itemUrl}`;
      }

      // ===== 2. TITLE =====
      const titleElement = animposx.find('.data .title h2.entry-title');
      const title = titleElement.text().trim() || 'Unknown Title';

      // ===== 3. IMAGE =====
      let image = animposx.find('.content-thumb img.anmsa').first().attr('src') || '';
      if (image && !image.startsWith('http')) {
        image = image.startsWith('//') ? `https:${image}` : image;
      }

      // ===== 4. TYPE (Movie) =====
      const type = animposx.find('.content-thumb .type').text().trim() || 'Movie';
      
      // ===== 5. STATUS =====
      const status = animposx.find('.data .type').text().trim() || 'Unknown';
      
      // ===== 6. SCORE =====
      let score = animposx.find('.content-thumb .score').text().trim();
      score = score.replace('', '').replace('fa-star', '').replace('★', '').trim() || 'N/A';

      // ===== 7. INFO DARI TOOLTIP (stooltip) =====
      const tooltip = $article.find('.stooltip');
      
      // Views
      let views = '';
      tooltip.find('.metadata span').each((_, span) => {
        const text = $(span).text().trim();
        if (text.includes('Views') || text.includes('View')) {
          views = text;
        }
      });
      
      // Description
      const description = tooltip.find('.ttls').text().trim() || 'No description';
      
      // Genres
      const genres = [];
      tooltip.find('.genres .mta a').each((_, genreEl) => {
        genres.push($(genreEl).text().trim());
      });

      // ===== 8. SEASON =====
      const season = animposx.find('.content-thumb .season').text().trim() || '';
      
      // ===== 9. STUDIO (dari class) =====
      const studioClasses = $article.attr('class') || '';
      const studioMatch = studioClasses.match(/studio-([^\s]+)/);
      const studio = studioMatch ? studioMatch[1].replace(/-/g, ' ') : '';

      // ===== 10. PRODUCERS (dari class) =====
      const producers = [];
      const producerMatches = studioClasses.match(/producers-([^\s]+)/g);
      if (producerMatches) {
        producerMatches.forEach(p => {
          producers.push(p.replace('producers-', '').replace(/-/g, ' '));
        });
      }

      // Hanya tambahkan jika title dan url ada
      if (title && itemUrl) {
        movieList.push({
          id: $article.attr('id')?.replace('post-', '') || null,
          title: title,
          url: itemUrl,
          image: image,
          type: type,
          status: status,
          score: score,
          views: views,
          description: description,
          genres: genres,
          season: season,
          studio: studio,
          producers: producers,
          source: 'samehadaku'
        });
      }
    });

    // ===== PAGINATION INFO =====
    const pagination = {};
    const paginationEl = $('.pagination');
    
    if (paginationEl.length) {
      // Current page
      const currentPageText = paginationEl.find('span').first().text().trim();
      const currentPageMatch = currentPageText.match(/Page (\d+)/i);
      pagination.current = currentPageMatch ? parseInt(currentPageMatch[1]) : pageNum;
      
      // Total pages
      const pageLinks = paginationEl.find('a.inactive');
      let totalPages = 0;
      pageLinks.each((_, el) => {
        const pageNum = parseInt($(el).text().trim());
        if (!isNaN(pageNum) && pageNum > totalPages) {
          totalPages = pageNum;
        }
      });
      pagination.total = totalPages || 1;
      
      // Next and prev
      pagination.has_next = paginationEl.find('a:contains("Next")').length > 0 || pageNum < totalPages;
      pagination.has_prev = pageNum > 1;
      pagination.next_page = pagination.has_next ? pageNum + 1 : null;
      pagination.prev_page = pagination.has_prev ? pageNum - 1 : null;
    } else {
      // If no pagination element, assume only one page
      pagination.current = pageNum;
      pagination.total = 1;
      pagination.has_next = false;
      pagination.has_prev = pageNum > 1;
      pagination.next_page = null;
      pagination.prev_page = pageNum > 1 ? pageNum - 1 : null;
    }

    console.log(`Successfully fetched ${movieList.length} anime movies from page ${pageNum}`);

    return {
      success: true,
      page: pageNum,
      total_pages: pagination.total,
      total_items: movieList.length,
      has_next: pagination.has_next,
      has_prev: pagination.has_prev,
      pagination: pagination,
      data: movieList,
      source: 'samehadaku',
      scraped_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Get Samehadaku anime movie error:', error.message);
    return {
      success: false,
      error: error.message,
      page: page || 1,
      total_pages: 0,
      total_items: 0,
      has_next: false,
      has_prev: false,
      data: [],
      scraped_at: new Date().toISOString()
    };
  }
}

app.get('/api/anime/anime-movie', async (req, res) => {
  try {
    const page = req.query.page || 1;
    const result = await getSamehadakuAnimeMovie(page);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // Cache 5 menit
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.get('/api/anime/anime-movie/page/:page', async (req, res) => {
  try {
    const page = req.params.page || 1;
    const result = await getSamehadakuAnimeMovie(page);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// GET /api/anime/genres atau /api/anime/genre/isekai atau /api/anime/genre/isekai?page=2
async function getSamehadakuByGenre(genre, page = 1) {
  try {
    // Validasi genre
    if (!genre) {
      return {
        success: false,
        error: 'Genre parameter is required'
      };
    }

    // Validasi page
    const pageNum = parseInt(page) || 1;
    
    // URL halaman genre dengan pagination
    const url = pageNum === 1 
      ? `${SAMEHADAKU_URL}/genre/${genre}/`
      : `${SAMEHADAKU_URL}/genre/${genre}/page/${pageNum}/`;
    
    console.log(`Fetching anime with genre "${genre}" page ${pageNum} from: ${url}`);
    
    const response = await axios.get(`${PROXY}${url}`, { 
      headers, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(response.data);
    const animeList = [];

    // SELECTOR: Setiap item ada di dalam article.animpost
    $('article.animpost').each((index, element) => {
      const $article = $(element);
      
      // Cari elemen di dalam animposx
      const animposx = $article.find('.animposx');
      const linkElement = animposx.find('a').first();
      
      // ===== 1. URL =====
      let itemUrl = linkElement.attr('href') || '';
      if (itemUrl && !itemUrl.startsWith('http')) {
        itemUrl = itemUrl.startsWith('/') ? `${SAMEHADAKU_URL}${itemUrl}` : `${SAMEHADAKU_URL}/${itemUrl}`;
      }

      // ===== 2. TITLE =====
      const titleElement = animposx.find('.data .title h2');
      const title = titleElement.text().trim() || 'Unknown Title';

      // ===== 3. IMAGE =====
      let image = animposx.find('.content-thumb img.anmsa').first().attr('src') || '';
      if (image && !image.startsWith('http')) {
        image = image.startsWith('//') ? `https:${image}` : image;
      }

      // ===== 4. TYPE (TV, Movie, ONA, dll) =====
      const type = animposx.find('.content-thumb .type').text().trim() || 'Unknown';
      
      // ===== 5. STATUS =====
      const status = animposx.find('.data .type').text().trim() || 'Unknown';
      
      // ===== 6. SCORE =====
      let score = animposx.find('.content-thumb .score').text().trim();
      score = score.replace('', '').replace('fa-star', '').replace('★', '').trim() || 'N/A';

      // ===== 7. INFO DARI TOOLTIP (stooltip) =====
      const tooltip = $article.find('.stooltip');
      
      // Views
      let views = '';
      tooltip.find('.metadata span').each((_, span) => {
        const text = $(span).text().trim();
        if (text.includes('Views') || text.includes('View')) {
          views = text;
        }
      });
      
      // Description
      const description = tooltip.find('.ttls').text().trim() || 'No description';
      
      // Genres (ambil dari tooltip)
      const genres = [];
      tooltip.find('.genres .mta a').each((_, genreEl) => {
        genres.push($(genreEl).text().trim());
      });

      // ===== 8. SEASON =====
      const season = animposx.find('.content-thumb .season').text().trim() || '';
      
      // ===== 9. STUDIO (dari class) =====
      const studioClasses = $article.attr('class') || '';
      const studioMatch = studioClasses.match(/studio-([^\s]+)/);
      const studio = studioMatch ? studioMatch[1].replace(/-/g, ' ') : '';

      // ===== 10. PRODUCERS (dari class) =====
      const producers = [];
      const producerMatches = studioClasses.match(/producers-([^\s]+)/g);
      if (producerMatches) {
        producerMatches.forEach(p => {
          producers.push(p.replace('producers-', '').replace(/-/g, ' '));
        });
      }

      // Hanya tambahkan jika title dan url ada
      if (title && itemUrl) {
        animeList.push({
          id: $article.attr('id')?.replace('post-', '') || null,
          title: title,
          url: itemUrl,
          image: image,
          type: type,
          status: status,
          score: score,
          views: views,
          description: description,
          genres: genres,
          season: season,
          studio: studio,
          producers: producers,
          source: 'samehadaku'
        });
      }
    });

    // ===== PAGINATION INFO =====
    const pagination = {};
    const paginationEl = $('.pagination');
    
    if (paginationEl.length) {
      // Current page
      const currentPageText = paginationEl.find('span').first().text().trim();
      const currentPageMatch = currentPageText.match(/Page (\d+)/i);
      pagination.current = currentPageMatch ? parseInt(currentPageMatch[1]) : pageNum;
      
      // Total pages
      const pageLinks = paginationEl.find('a.inactive');
      let totalPages = 0;
      pageLinks.each((_, el) => {
        const pageNum = parseInt($(el).text().trim());
        if (!isNaN(pageNum) && pageNum > totalPages) {
          totalPages = pageNum;
        }
      });
      
      // Jika ada link ke halaman terakhir, ambil dari situ
      const lastPageLink = paginationEl.find('a:last-child');
      if (lastPageLink.length && !lastPageLink.hasClass('arrow_pag')) {
        const lastPage = parseInt(lastPageLink.text().trim());
        if (!isNaN(lastPage) && lastPage > totalPages) {
          totalPages = lastPage;
        }
      }
      
      pagination.total = totalPages || 1;
      
      // Next and prev
      pagination.has_next = paginationEl.find('a.arrow_pag .fa-caret-right').length > 0 || pageNum < totalPages;
      pagination.has_prev = paginationEl.find('a.arrow_pag .fa-caret-left').length > 0 || pageNum > 1;
      pagination.next_page = pagination.has_next ? pageNum + 1 : null;
      pagination.prev_page = pagination.has_prev ? pageNum - 1 : null;
    } else {
      // If no pagination element, assume only one page
      pagination.current = pageNum;
      pagination.total = 1;
      pagination.has_next = false;
      pagination.has_prev = pageNum > 1;
      pagination.next_page = null;
      pagination.prev_page = pageNum > 1 ? pageNum - 1 : null;
    }

    // ===== AMBIL INFORMASI GENRE =====
    const genreInfo = {
      name: genre,
      display_name: $('h1.page-title span').text().trim() || genre,
      total_anime: animeList.length,
      url: `${SAMEHADAKU_URL}/genre/${genre}/`
    };

    console.log(`Successfully fetched ${animeList.length} anime from genre "${genre}" page ${pageNum}`);

    return {
      success: true,
      genre: genreInfo,
      page: pageNum,
      total_pages: pagination.total,
      total_items: animeList.length,
      has_next: pagination.has_next,
      has_prev: pagination.has_prev,
      pagination: pagination,
      data: animeList,
      source: 'samehadaku',
      scraped_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Get Samehadaku by genre error:', error.message);
    return {
      success: false,
      error: error.message,
      genre: genre || null,
      page: page || 1,
      total_pages: 0,
      total_items: 0,
      has_next: false,
      has_prev: false,
      data: [],
      scraped_at: new Date().toISOString()
    };
  }
}

app.get('/api/anime/genre/:genre', async (req, res) => {
  try {
    const genre = req.params.genre.toLowerCase().trim();
    const page = req.query.page || 1;
    
    const result = await getSamehadakuByGenre(genre, page);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // Cache 5 menit
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// GET /api/anime/genres 
async function getSamehadakuGenres() {
  try {
    const url = `${SAMEHADAKU_URL}/anime-terbaru/`; // Ambil dari halaman utama karena biasanya ada filter genre
    
    console.log('Fetching all genres from:', url);
    
    const response = await axios.get(`${PROXY}${url}`, { 
      headers, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(response.data);
    const genres = [];

    // SELECTOR: Ambil dari filter genre di sidebar atau halaman
    $('.filter_act.genres label.tax_fil, td.filter_act.genres label.tax_fil').each((_, el) => {
      const $el = $(el);
      const genreName = $el.text().trim();
      const genreValue = $el.find('input').attr('value');
      
      // Hilangkan teks tambahan
      const cleanName = genreName.replace(/\s*<[^>]*>.*$/, '').trim();
      
      if (genreValue && cleanName) {
        genres.push({
          name: genreValue,
          display_name: cleanName,
          url: `${SAMEHADAKU_URL}/genre/${genreValue}/`,
          count: null // Bisa ditambahkan jika ada info jumlah
        });
      }
    });

    // Jika tidak ketemu, coba ambil dari daftar genre yang umum
    if (genres.length === 0) {
      const commonGenres = [
        'action', 'adventure', 'comedy', 'drama', 'fantasy', 'isekai', 
        'romance', 'sci-fi', 'slice-of-life', 'sports', 'supernatural',
        'horror', 'mystery', 'psychological', 'thriller', 'historical',
        'mecha', 'military', 'music', 'parody', 'samurai', 'school',
        'shounen', 'seinen', 'shoujo', 'josei', 'kids', 'magic',
        'ecchi', 'harem', 'gourmet', 'award-winning', 'reincarnation'
      ];
      
      commonGenres.forEach(g => {
        genres.push({
          name: g,
          display_name: g.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
          url: `${SAMEHADAKU_URL}/genre/${g}/`,
          count: null
        });
      });
    }

    return {
      success: true,
      total_genres: genres.length,
      data: genres,
      source: 'samehadaku',
      scraped_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Get Samehadaku genres error:', error.message);
    return {
      success: false,
      error: error.message,
      total_genres: 0,
      data: [],
      scraped_at: new Date().toISOString()
    };
  }
}

app.get('/api/anime/genres', async (req, res) => {
  try {
    const result = await getSamehadakuGenres();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // Cache 1 jam
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// GET /api/anime/studio/platinum-vision 
async function getSamehadakuByStudio(studio, page = 1) {
  try {
    // Validasi studio
    if (!studio) {
      return {
        success: false,
        error: 'Studio parameter is required'
      };
    }

    // Validasi page
    const pageNum = parseInt(page) || 1;
    
    // URL halaman studio dengan pagination
    // Format: /studio/{studio}/ atau /studio/{studio}/page/{page}/
    const url = pageNum === 1 
      ? `${SAMEHADAKU_URL}/studio/${studio}/`
      : `${SAMEHADAKU_URL}/studio/${studio}/page/${pageNum}/`;
    
    console.log(`Fetching Samehadaku studio "${studio}" page ${pageNum} from: ${url}`);
    
    const response = await axios.get(`${PROXY}${url}`, { 
      headers, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(response.data);
    const animeList = [];

    // SELECTOR: Setiap item ada di dalam article.animpost
    $('article.animpost').each((index, element) => {
      const $article = $(element);
      
      // Cari elemen di dalam animposx
      const animposx = $article.find('.animposx');
      const linkElement = animposx.find('a').first();
      
      // ===== 1. URL =====
      let itemUrl = linkElement.attr('href') || '';
      if (itemUrl && !itemUrl.startsWith('http')) {
        itemUrl = itemUrl.startsWith('/') ? `${SAMEHADAKU_URL}${itemUrl}` : `${SAMEHADAKU_URL}/${itemUrl}`;
      }

      // ===== 2. TITLE =====
      const titleElement = animposx.find('.data .title h2');
      const title = titleElement.text().trim() || 'Unknown Title';

      // ===== 3. IMAGE =====
      let image = animposx.find('.content-thumb img.anmsa').first().attr('src') || '';
      if (image && !image.startsWith('http')) {
        image = image.startsWith('//') ? `https:${image}` : image;
      }

      // ===== 4. TYPE (TV, Movie, ONA, dll) =====
      const type = animposx.find('.content-thumb .type').text().trim() || 'Unknown';
      
      // ===== 5. STATUS =====
      const status = animposx.find('.data .type').text().trim() || 'Unknown';
      
      // ===== 6. SCORE =====
      let score = animposx.find('.content-thumb .score').text().trim();
      score = score.replace('', '').replace('fa-star', '').replace('★', '').trim() || 'N/A';

      // ===== 7. INFO DARI TOOLTIP (stooltip) =====
      const tooltip = $article.find('.stooltip');
      
      // Views
      let views = '';
      tooltip.find('.metadata span').each((_, span) => {
        const text = $(span).text().trim();
        if (text.includes('Views') || text.includes('View')) {
          views = text;
        }
      });
      
      // Description
      const description = tooltip.find('.ttls').text().trim() || 'No description';
      
      // Genres (ambil dari tooltip)
      const genres = [];
      tooltip.find('.genres .mta a').each((_, genreEl) => {
        genres.push($(genreEl).text().trim());
      });

      // ===== 8. SEASON =====
      const season = animposx.find('.content-thumb .season').text().trim() || '';
      
      // ===== 9. STUDIO (dari class) - untuk verifikasi =====
      const studioClasses = $article.attr('class') || '';
      const studioMatch = studioClasses.match(/studio-([^\s]+)/);
      const studioName = studioMatch ? studioMatch[1].replace(/-/g, ' ') : '';

      // ===== 10. PRODUCERS (dari class) =====
      const producers = [];
      const producerMatches = studioClasses.match(/producers-([^\s]+)/g);
      if (producerMatches) {
        producerMatches.forEach(p => {
          producers.push(p.replace('producers-', '').replace(/-/g, ' '));
        });
      }

      // Hanya tambahkan jika title dan url ada
      if (title && itemUrl) {
        animeList.push({
          id: $article.attr('id')?.replace('post-', '') || null,
          title: title,
          url: itemUrl,
          image: image,
          type: type,
          status: status,
          score: score,
          views: views,
          description: description,
          genres: genres,
          season: season,
          studio: studioName,
          producers: producers,
          source: 'samehadaku'
        });
      }
    });

    // ===== AMBIL INFORMASI STUDIO =====
    const studioInfo = {
      name: studio,
      display_name: $('h1.page-title span').text().trim() || studio.replace(/-/g, ' '),
      total_anime: animeList.length,
      url: `${SAMEHADAKU_URL}/studio/${studio}/`
    };

    // ===== PAGINATION INFO =====
    const pagination = {};
    const paginationEl = $('.pagination');
    
    if (paginationEl.length) {
      // Current page
      const currentPageText = paginationEl.find('span').first().text().trim();
      const currentPageMatch = currentPageText.match(/Page (\d+)/i);
      pagination.current = currentPageMatch ? parseInt(currentPageMatch[1]) : pageNum;
      
      // Total pages
      const pageLinks = paginationEl.find('a.inactive');
      let totalPages = 0;
      pageLinks.each((_, el) => {
        const pageNum = parseInt($(el).text().trim());
        if (!isNaN(pageNum) && pageNum > totalPages) {
          totalPages = pageNum;
        }
      });
      
      pagination.total = totalPages || 1;
      
      // Next and prev
      pagination.has_next = paginationEl.find('a.arrow_pag .fa-caret-right').length > 0 || pageNum < totalPages;
      pagination.has_prev = paginationEl.find('a.arrow_pag .fa-caret-left').length > 0 || pageNum > 1;
      pagination.next_page = pagination.has_next ? pageNum + 1 : null;
      pagination.prev_page = pagination.has_prev ? pageNum - 1 : null;
    } else {
      pagination.current = pageNum;
      pagination.total = 1;
      pagination.has_next = false;
      pagination.has_prev = pageNum > 1;
      pagination.next_page = null;
      pagination.prev_page = pageNum > 1 ? pageNum - 1 : null;
    }

    console.log(`Successfully fetched ${animeList.length} anime from studio "${studio}" page ${pageNum}`);

    return {
      success: true,
      studio: studioInfo,
      page: pageNum,
      total_pages: pagination.total,
      total_items: animeList.length,
      has_next: pagination.has_next,
      has_prev: pagination.has_prev,
      pagination: pagination,
      data: animeList,
      source: 'samehadaku',
      scraped_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Get Samehadaku by studio error:', error.message);
    return {
      success: false,
      error: error.message,
      studio: studio || null,
      page: page || 1,
      total_pages: 0,
      total_items: 0,
      has_next: false,
      has_prev: false,
      data: [],
      scraped_at: new Date().toISOString()
    };
  }
}

app.get('/api/anime/studio/:studio', async (req, res) => {
  try {
    const studio = req.params.studio.toLowerCase().trim();
    const page = req.query.page || 1;
    
    const result = await getSamehadakuByStudio(studio, page);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate'); // Cache 10 menit
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// GET /api/anime/studios
async function getSamehadakuStudios() {
  try {
    const url = `${SAMEHADAKU_URL}/daftar-anime-2/`; // Ambil dari halaman daftar anime
    
    console.log('Fetching all studios from:', url);
    
    const response = await axios.get(`${PROXY}${url}`, { 
      headers, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(response.data);
    const studios = [];

    // SELECTOR: Ambil dari filter studio atau dari class studio pada item anime
    // Method 1: Cari di sidebar filter jika ada
    $('.filter_act.studios label.tax_fil, .studio-filter label').each((_, el) => {
      const $el = $(el);
      const studioName = $el.text().trim();
      const studioValue = $el.find('input').attr('value');
      
      if (studioValue && studioName && studioValue !== 'a' && studioValue.length > 2) {
        studios.push({
          name: studioValue,
          display_name: studioName,
          url: `${SAMEHADAKU_URL}/studio/${studioValue}/`,
          count: null
        });
      }
    });

    // Method 2: Jika tidak ketemu, ekstrak dari class studio pada artikel
    if (studios.length === 0) {
      const studioSet = new Set();
      
      $('article.animpost').each((_, el) => {
        const classes = $(el).attr('class') || '';
        const studioMatches = classes.match(/studio-([^\s]+)/g);
        
        if (studioMatches) {
          studioMatches.forEach(match => {
            const studio = match.replace('studio-', '').replace(/-/g, ' ');
            if (studio && studio.length > 2) {
              studioSet.add(studio);
            }
          });
        }
      });
      
      studioSet.forEach(studio => {
        studios.push({
          name: studio.toLowerCase().replace(/\s+/g, '-'),
          display_name: studio,
          url: `${SAMEHADAKU_URL}/studio/${studio.toLowerCase().replace(/\s+/g, '-')}/`,
          count: null
        });
      });
    }

    // Urutkan berdasarkan display_name
    studios.sort((a, b) => a.display_name.localeCompare(b.display_name));

    console.log(`Successfully fetched ${studios.length} studios`);

    return {
      success: true,
      total_studios: studios.length,
      data: studios,
      source: 'samehadaku',
      scraped_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Get Samehadaku studios error:', error.message);
    return {
      success: false,
      error: error.message,
      total_studios: 0,
      data: [],
      scraped_at: new Date().toISOString()
    };
  }
}

app.get('/api/anime/studios', async (req, res) => {
  try {
    const result = await getSamehadakuStudios();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // Cache 1 jam
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.get('/api/anime/studio/:studio/page/:page', async (req, res) => {
  try {
    const studio = req.params.studio.toLowerCase().trim();
    const page = req.params.page || 1;
    
    const result = await getSamehadakuByStudio(studio, page);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});


// ================= ENDPOINT API DONGHUA =================

// GET //api/donghua/latest atau /api/donghua/latest?page=3
async function getAnichinLatestRelease(page = 1) {
  try {
    // Validasi page
    const pageNum = parseInt(page) || 1;
    
    // URL Anichin dengan pagination
    const url = pageNum === 1 
      ? ANICHIN_URL
      : `${ANICHIN_URL}/page/${pageNum}/`;
    
    console.log(`Fetching Anichin latest release page ${pageNum} from: ${url}`);
    
    const response = await axios.get(`${PROXY}${url}`, { 
      headers: {
        ...headers,
        'Referer': ANICHIN_URL,
        'Origin': ANICHIN_URL
      }, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(response.data);
    const latestReleases = [];

    // Selector untuk bagian "Latest Release"
    $('.listupd.normal .excstf article.bs, .listupd .excstf article.bs').each((index, element) => {
      const $el = $(element);
      const linkElement = $el.find('.bsx a').first();
      
      // ===== 1. URL EPISODE (ASLI) =====
      let episodeUrl = linkElement.attr('href') || '';
      if (episodeUrl && !episodeUrl.startsWith('http')) {
        episodeUrl = episodeUrl.startsWith('/') ? `${ANICHIN_URL}${episodeUrl}` : `${ANICHIN_URL}/${episodeUrl}`;
      }

      // ===== 2. URL DETAIL SERIES (BERSIH) =====
      // Ambil path dari URL episode
      let detailUrl = episodeUrl;
      
      // Hapus domain untuk processing
      let path = episodeUrl.replace(ANICHIN_URL, '');
      
      // POLA 1: Hapus "-episode-{angka}-subtitle-indonesia"
      // Contoh: /renegade-immortal-episode-129-subtitle-indonesia/ → /renegade-immortal/
      path = path.replace(/-episode-\d+-subtitle-indonesia/gi, '');
      
      // POLA 2: Hapus "-season-{angka}-episode-{angka}-subtitle-indonesia"
      // Contoh: /btth-season-5-episode-187-subtitle-indonesia/ → /btth-season-5/
      path = path.replace(/-season-\d+-episode-\d+-subtitle-indonesia/gi, '');
      
      // POLA 3: Hapus "-episode-{angka}"
      path = path.replace(/-episode-\d+/gi, '');
      
      // POLA 4: Hapus "-season-{angka}"
      // Biarkan season tetap ada, karena itu bagian dari judul series
      // Contoh: /the-daily-life-of-the-immortal-king-season-5/ → tetap /the-daily-life-of-the-immortal-king-season-5/
      
      // POLA 5: Hapus "-subtitle-indonesia" yang tersisa
      path = path.replace(/-subtitle-indonesia/gi, '');
      
      // POLA 6: Hapus trailing slash ganda dan bersihkan
      path = path.replace(/\/\/+/g, '/');
      
      // Pastikan path dimulai dengan slash
      if (!path.startsWith('/')) {
        path = `/${path}`;
      }
      
      // Pastikan path berakhiran dengan slash
      if (!path.endsWith('/')) {
        path = `${path}/`;
      }
      
      // Gabungkan dengan domain
      detailUrl = `${ANICHIN_URL}${path}`;

      // ===== 3. TITLE =====
      // Struktur: .tt berisi teks judul dan h2 untuk episode
      const $tt = $el.find('.tt');
      
      // Clone .tt, hapus tag h2, lalu ambil teks sisanya untuk judul series
      const $ttClone = $tt.clone();
      $ttClone.find('h2').remove();
      let seriesTitle = $ttClone.text().trim();
      
      // Jika masih kosong, ambil dari atribut title
      if (!seriesTitle) {
        seriesTitle = linkElement.attr('title') || '';
        // Hapus "Episode X" dari title
        seriesTitle = seriesTitle.replace(/\s+Episode\s+\d+.*$/i, '').trim();
        // Hapus "Subtitle Indonesia" dari title
        seriesTitle = seriesTitle.replace(/\s+Subtitle Indonesia$/i, '').trim();
      }

      // Ambil episode title dari h2 di dalam .tt
      const episodeTitle = $tt.find('h2').text().trim() || '';

      // ===== 4. GAMBAR =====
      let image = $el.find('.limit img').attr('src') || '';
      if (image && !image.startsWith('http')) {
        image = image.startsWith('//') ? `https:${image}` : `https://${image}`;
      }

      // ===== 5. EPISODE INFO =====
      const episode = $el.find('.bt .epx').text().trim() || '?';
      
      // Bersihkan format episode (misal: "Ep 129" → "129")
      let episodeNumber = episode.replace('Ep', '').replace('Episode', '').trim();

      // ===== 6. TYPE =====
      const type = $el.find('.limit .typez').text().trim() || 'Donghua';

      // ===== 7. STATUS BADGE =====
      let status = '';
      const statusEl = $el.find('.limit .status');
      if (statusEl.length) {
        status = statusEl.text().trim();
      }

      // ===== 8. HOT BADGE =====
      const isHot = $el.find('.limit .hotbadge').length > 0;

      // ===== 9. SUB/UNSUB BADGE =====
      const subBadge = $el.find('.bt .sb').text().trim() || 'Sub';

      // Debug: log untuk memastikan URL bersih
      console.log(`Original: ${episodeUrl}`);
      console.log(`Cleaned : ${detailUrl}`);
      console.log('---');

      // Hanya tambahkan jika title dan url ada
      if (seriesTitle && episodeUrl) {
        latestReleases.push({
          // Informasi series
          series: {
            title: seriesTitle,
            url: detailUrl, // URL ke halaman detail series (BERSIH)
          },
          // Informasi episode
          episode: {
            title: episodeTitle || `${seriesTitle} Episode ${episodeNumber}`,
            url: episodeUrl, // URL ke halaman streaming episode (ASLI)
            number: episodeNumber,
            full_episode: episode,
            status: status,
            sub_badge: subBadge,
          },
          // Metadata
          image: image,
          type: type,
          is_hot: isHot,
          source: 'anichin',
          scraped_at: new Date().toISOString()
        });
      }
    });

    // ===== PAGINATION INFO =====
    const pagination = {};
    const paginationEl = $('.pagination, .hpage');
    
    if (paginationEl.length) {
      // Cek apakah ada next page
      const nextLink = paginationEl.find('a[rel="next"], a.r');
      pagination.has_next = nextLink.length > 0;
      pagination.next_page = pageNum + 1;
      
      // Cek apakah ada prev page
      const prevLink = paginationEl.find('a[rel="prev"]');
      pagination.has_prev = prevLink.length > 0 || pageNum > 1;
      pagination.prev_page = pageNum > 1 ? pageNum - 1 : null;
      
      // Total pages (estimasi dari link terakhir)
      const lastPageLink = paginationEl.find('a:last-child');
      if (lastPageLink.length && !lastPageLink.hasClass('r')) {
        const lastPageText = lastPageLink.text().trim();
        const lastPageNum = parseInt(lastPageText);
        pagination.total_pages = !isNaN(lastPageNum) ? lastPageNum : pageNum + 5;
      } else {
        pagination.total_pages = pageNum + 5;
      }
    } else {
      pagination.has_next = false;
      pagination.has_prev = pageNum > 1;
      pagination.next_page = null;
      pagination.prev_page = pageNum > 1 ? pageNum - 1 : null;
      pagination.total_pages = pageNum;
    }

    console.log(`Successfully fetched ${latestReleases.length} latest releases from Anichin page ${pageNum}`);

    return {
      success: true,
      page: pageNum,
      total_pages: pagination.total_pages,
      total_items: latestReleases.length,
      has_next: pagination.has_next,
      has_prev: pagination.has_prev,
      pagination: {
        current: pageNum,
        total: pagination.total_pages,
        has_next: pagination.has_next,
        has_prev: pagination.has_prev,
        next_page: pagination.next_page,
        prev_page: pagination.prev_page
      },
      data: latestReleases,
      source: 'anichin',
      scraped_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Get Anichin latest release error:', error.message);
    return {
      success: false,
      error: error.message,
      page: page || 1,
      total_pages: 0,
      total_items: 0,
      has_next: false,
      has_prev: false,
      data: [],
      scraped_at: new Date().toISOString()
    };
  }
}

app.get('/api/donghua/latest', async (req, res) => {
  try {
    const page = req.query.page || 1;
    const result = await getAnichinLatestRelease(page);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // Cache 5 menit
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.get('/api/donghua/latest/page/:page', async (req, res) => {
  try {
    const page = req.params.page || 1;
    const result = await getAnichinLatestRelease(page);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// GET //api/donghua/popular-today
async function getAnichinPopularToday() {
  try {
    const url = ANICHIN_URL;
    const response = await axios.get(`${PROXY}${url}`, { headers, timeout: 15000 });
    const $ = cheerio.load(response.data);
    const popularToday = [];

    // Selector untuk bagian "Popular Today". Dari HTML yang diberikan,
    // ini berada di dalam div dengan class "listupd popularslider", dan setiap itemnya adalah "article.bs"
    $('.listupd.popularslider .popconslide article.bs').each((index, element) => {
      const $el = $(element);
      const linkElement = $el.find('.bsx a').first();

      // Ambil URL dan pastikan formatnya lengkap
      let itemUrl = linkElement.attr('href') || '';
      if (itemUrl && !itemUrl.startsWith('http')) {
        itemUrl = itemUrl.startsWith('/') ? `${ANICHIN_URL}${itemUrl}` : `${ANICHIN_URL}/${itemUrl}`;
      }

      // Ambil judul dari atribut 'title' di tag <a>
      const title = linkElement.attr('title') || $el.find('.tt h2').text().trim() || 'Unknown Title';

      // Ambil gambar
      let image = $el.find('.limit img').attr('src') || '';
      if (image && !image.startsWith('http')) {
        image = image.startsWith('//') ? `https:${image}` : `https://${image}`;
      }

      // Ambil info tambahan seperti episode (dari .epx)
      const episode = $el.find('.bt .epx').text().trim() || '?';
      
      // Ambil tipe (dari .typez)
      const type = $el.find('.limit .typez').text().trim() || 'Donghua';

      // Hanya tambahkan jika title dan url ada
      if (title && itemUrl) {
        popularToday.push({
          title: title,
          url: itemUrl,
          image: image,
          episode: episode,
          type: type,
          source: 'anichin'
        });
      }
    });

    return handleResponse(popularToday.slice(0, 10)); // Batasi 10 item teratas
  } catch (error) {
    console.error('Get Anichin popular today error:', error.message);
    return handleError(error);
  }
}

app.get('/api/donghua/popular-today', async (req, res) => {
  const data = await getAnichinPopularToday();
  res.json({
    success: true,
    total: data.length,
    data: data
  });
});

// GET //api/donghua/movies
async function getAnichinMovies(page = 1) {
  try {
    // Validasi page
    const pageNum = parseInt(page) || 1;
    
    // URL Anichin dengan pagination (halaman utama dulu, karena movie ada di section terpisah)
    const url = pageNum === 1 
      ? ANICHIN_URL
      : `${ANICHIN_URL}/page/${pageNum}/`;
    
    console.log(`Fetching Anichin movies page ${pageNum} from: ${url}`);
    
    const response = await axios.get(`${PROXY}${url}`, { 
      headers: {
        ...headers,
        'Referer': ANICHIN_URL,
        'Origin': ANICHIN_URL
      }, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(response.data);
    const movieList = [];

    // ===== SELECTOR UNTUK SECTION MOVIE =====
    // Cari section dengan judul "Movie" atau class yang mengandung movie
    let movieSection = null;
    
    // Method 1: Cari berdasarkan teks "Movie" di dalam .releases h3
    $('.bixbox .releases').each((_, el) => {
      const $el = $(el);
      const title = $el.find('h3').text().trim();
      if (title.toLowerCase() === 'movie') {
        movieSection = $el.closest('.bixbox');
        return false; // break loop
      }
    });
    
    // Method 2: Jika tidak ketemu, cari berdasarkan class atau struktur umum
    if (!movieSection || !movieSection.length) {
      // Coba cari box yang berisi movie (biasanya setelah latest release)
      $('.bixbox').each((_, el) => {
        const $el = $(el);
        const hasMovieItems = $el.find('.typez.Movie, .typez:contains("Movie")').length > 0;
        if (hasMovieItems) {
          movieSection = $el;
          return false;
        }
      });
    }
    
    // Method 3: Fallback ke semua listupd setelah section movie
    if (!movieSection || !movieSection.length) {
      // Ambil semua listupd dan filter yang itemnya bertipe Movie
      const allLists = $('.listupd .excstf article.bs');
      const movieItems = allLists.filter((_, el) => {
        return $(el).find('.typez.Movie, .typez:contains("Movie")').length > 0;
      });
      
      if (movieItems.length > 0) {
        // Kita akan proses movieItems langsung
        movieItems.each((_, element) => {
          processMovieItem($(element), movieList);
        });
        
        console.log(`Found ${movieItems.length} movies using fallback method`);
      }
    }
    
    // Jika movieSection ditemukan, proses semua article di dalamnya
    if (movieSection && movieSection.length) {
      movieSection.find('.listupd .excstf article.bs').each((_, element) => {
        processMovieItem($(element), movieList);
      });
    }

    console.log(`Successfully fetched ${movieList.length} movies from Anichin page ${pageNum}`);

    // ===== PAGINATION INFO =====
    const pagination = {};
    const paginationEl = $('.pagination, .hpage');
    
    if (paginationEl.length) {
      // Cek apakah ada next page
      const nextLink = paginationEl.find('a[rel="next"], a.r');
      pagination.has_next = nextLink.length > 0;
      pagination.next_page = pageNum + 1;
      
      // Cek apakah ada prev page
      const prevLink = paginationEl.find('a[rel="prev"]');
      pagination.has_prev = prevLink.length > 0 || pageNum > 1;
      pagination.prev_page = pageNum > 1 ? pageNum - 1 : null;
      
      // Total pages (estimasi dari link terakhir)
      const lastPageLink = paginationEl.find('a:last-child');
      if (lastPageLink.length && !lastPageLink.hasClass('r')) {
        const lastPageText = lastPageLink.text().trim();
        const lastPageNum = parseInt(lastPageText);
        pagination.total_pages = !isNaN(lastPageNum) ? lastPageNum : pageNum + 3;
      } else {
        pagination.total_pages = pageNum + 3; // Estimasi
      }
    } else {
      pagination.has_next = false;
      pagination.has_prev = pageNum > 1;
      pagination.next_page = null;
      pagination.prev_page = pageNum > 1 ? pageNum - 1 : null;
      pagination.total_pages = pageNum;
    }

    return {
      success: true,
      page: pageNum,
      total_pages: pagination.total_pages,
      total_items: movieList.length,
      has_next: pagination.has_next,
      has_prev: pagination.has_prev,
      pagination: {
        current: pageNum,
        total: pagination.total_pages,
        has_next: pagination.has_next,
        has_prev: pagination.has_prev,
        next_page: pagination.next_page,
        prev_page: pagination.prev_page
      },
      data: movieList,
      source: 'anichin',
      scraped_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Get Anichin movies error:', error.message);
    return {
      success: false,
      error: error.message,
      page: page || 1,
      total_pages: 0,
      total_items: 0,
      has_next: false,
      has_prev: false,
      data: [],
      scraped_at: new Date().toISOString()
    };
  }
}

function processMovieItem($el, movieList) {
  const linkElement = $el.find('.bsx a').first();
  
  // ===== 1. URL DETAIL =====
  let detailUrl = linkElement.attr('href') || '';
  if (detailUrl && !detailUrl.startsWith('http')) {
    detailUrl = detailUrl.startsWith('/') ? `${ANICHIN_URL}${detailUrl}` : `${ANICHIN_URL}/${detailUrl}`;
  }

  // ===== 2. CLEAN URL (untuk series/movie) =====
  let cleanUrl = detailUrl;
  let path = detailUrl.replace(ANICHIN_URL, '');
  
  // Hapus bagian episode/subtitle jika ada
  path = path.replace(/-episode-\d+-subtitle-indonesia/gi, '');
  path = path.replace(/-episode-\d+/gi, '');
  path = path.replace(/-subtitle-indonesia/gi, '');
  path = path.replace(/\/\/+/g, '/');
  
  if (!path.startsWith('/')) path = `/${path}`;
  if (!path.endsWith('/')) path = `${path}/`;
  
  cleanUrl = `${ANICHIN_URL}${path}`;

  // ===== 3. TITLE =====
  const $tt = $el.find('.tt');
  const $ttClone = $tt.clone();
  $ttClone.find('h2').remove();
  let title = $ttClone.text().trim();
  
  if (!title) {
    title = linkElement.attr('title') || '';
    title = title.replace(/\s+Movie\s+Subtitle Indonesia$/i, '').trim();
    title = title.replace(/\s+Subtitle Indonesia$/i, '').trim();
  }

  // ===== 4. EPISODE TITLE (jika ada) =====
  const episodeTitle = $tt.find('h2').text().trim() || '';

  // ===== 5. GAMBAR =====
  let image = $el.find('.limit img').attr('src') || '';
  if (image && !image.startsWith('http')) {
    image = image.startsWith('//') ? `https:${image}` : `https://${image}`;
  }

  // ===== 6. TYPE (Movie) =====
  const type = $el.find('.limit .typez').text().trim() || 'Movie';
  
  // ===== 7. STATUS =====
  let status = '';
  const statusEl = $el.find('.limit .status');
  if (statusEl.length) {
    status = statusEl.text().trim();
  }

  // ===== 8. EPISODE INFO =====
  const episode = $el.find('.bt .epx').text().trim() || 'Movie';
  
  // ===== 9. HOT BADGE =====
  const isHot = $el.find('.limit .hotbadge').length > 0;

  // ===== 10. SUB BADGE =====
  const subBadge = $el.find('.bt .sb').text().trim() || 'Sub';

  // ===== 11. GENRES (dari atribut atau class) =====
  const genres = [];
  const genreLinks = $el.find('.genres .mta a, .genre-info a');
  genreLinks.each((_, el) => {
    genres.push($(el).text().trim());
  });

  // ===== 12. RATING =====
  let rating = '';
  const ratingEl = $el.find('.numscore, .score');
  if (ratingEl.length) {
    rating = ratingEl.text().trim();
  }

  // Hanya tambahkan jika title dan url ada
  if (title && detailUrl) {
    movieList.push({
      title: title,
      clean_title: title.replace(/\s+Movie$/i, '').trim(),
      url: {
        detail: detailUrl,      // URL asli
        clean: cleanUrl,        // URL bersih
      },
      episode: {
        title: episodeTitle,
        number: episode,
        full_episode: episode,
        status: status,
        sub_badge: subBadge,
      },
      image: image,
      type: type,
      is_movie: true,
      is_hot: isHot,
      rating: rating,
      genres: genres,
      source: 'anichin'
    });
  }
}

async function getAllAnichinMovies(page = 1) {
  try {
    // Untuk movie, kita bisa akses langsung halaman dengan filter
    // Tapi karena tidak ada halaman khusus movie, kita pakai halaman utama
    const result = await getAnichinMovies(page);
    
    // Filter hanya yang benar-benar movie (type === 'Movie')
    const moviesOnly = result.data.filter(item => item.type === 'Movie');
    
    return {
      ...result,
      total_items: moviesOnly.length,
      data: moviesOnly,
      note: 'Filtered movies only (type: Movie)'
    };
    
  } catch (error) {
    console.error('Get all Anichin movies error:', error.message);
    return {
      success: false,
      error: error.message,
      page: page || 1,
      total_items: 0,
      data: []
    };
  }
}

app.get('/api/donghua/movies', async (req, res) => {
  try {
    const page = req.query.page || 1;
    const result = await getAllAnichinMovies(page);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate'); // Cache 10 menit
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// GET //api/donghua/completed atau /api/donghua/completed?page=3
async function getAnichinCompleted(page = 1) {
  try {
    // Validasi page
    const pageNum = parseInt(page) || 1;
    
    // URL halaman completed dengan pagination
    const url = pageNum === 1 
      ? `${ANICHIN_URL}/completed/`
      : `${ANICHIN_URL}/completed/page/${pageNum}/`;
    
    console.log(`Fetching Anichin completed donghua page ${pageNum} from: ${url}`);
    
    const response = await axios.get(`${PROXY}${url}`, { 
      headers: {
        ...headers,
        'Referer': ANICHIN_URL,
        'Origin': ANICHIN_URL
      }, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(response.data);
    const completedList = [];

    // SELECTOR: Mengambil dari .listupd.cp article.bs
    $('.listupd.cp article.bs, .listupd article.bs').each((index, element) => {
      const $el = $(element);
      const linkElement = $el.find('.bsx a').first();
      
      // ===== 1. URL DETAIL =====
      let detailUrl = linkElement.attr('href') || '';
      if (detailUrl && !detailUrl.startsWith('http')) {
        detailUrl = detailUrl.startsWith('/') ? `${ANICHIN_URL}${detailUrl}` : `${ANICHIN_URL}/${detailUrl}`;
      }

      // ===== 2. CLEAN URL (untuk series) =====
      let cleanUrl = detailUrl;
      let path = detailUrl.replace(ANICHIN_URL, '');
      
      // Hapus bagian episode/subtitle jika ada
      path = path.replace(/-episode-\d+-subtitle-indonesia/gi, '');
      path = path.replace(/-episode-\d+/gi, '');
      path = path.replace(/-season-\d+-episode-\d+/gi, '');
      path = path.replace(/-subtitle-indonesia/gi, '');
      path = path.replace(/\/\/+/g, '/');
      
      if (!path.startsWith('/')) path = `/${path}`;
      if (!path.endsWith('/')) path = `${path}/`;
      
      cleanUrl = `${ANICHIN_URL}${path}`;

      // ===== 3. TITLE =====
      const $tt = $el.find('.tt');
      const $ttClone = $tt.clone();
      $ttClone.find('h2').remove();
      let title = $ttClone.text().trim();
      
      if (!title) {
        title = linkElement.attr('title') || '';
        title = title.replace(/\s+Subtitle Indonesia$/i, '').trim();
      }

      // ===== 4. EPISODE TITLE =====
      const episodeTitle = $tt.find('h2').text().trim() || '';

      // ===== 5. GAMBAR =====
      let image = $el.find('.limit img').attr('src') || '';
      if (image && !image.startsWith('http')) {
        image = image.startsWith('//') ? `https:${image}` : `https://${image}`;
      }

      // ===== 6. TYPE =====
      const type = $el.find('.limit .typez').text().trim() || 'Donghua';
      
      // ===== 7. STATUS (Completed) =====
      const status = $el.find('.limit .status').text().trim() || 'Completed';

      // ===== 8. EPISODE INFO =====
      const episode = $el.find('.bt .epx').text().trim() || 'Completed';
      
      // ===== 9. HOT BADGE =====
      const isHot = $el.find('.limit .hotbadge').length > 0;

      // ===== 10. SUB BADGE =====
      const subBadge = $el.find('.bt .sb').text().trim() || 'Sub';

      // ===== 11. GENRES (dari atribut atau class) =====
      const genres = [];
      const genreLinks = $el.find('.genres .mta a, .genre-info a');
      genreLinks.each((_, el) => {
        genres.push($(el).text().trim());
      });

      // Hanya tambahkan jika title dan url ada
      if (title && detailUrl) {
        completedList.push({
          title: title,
          clean_title: title.replace(/\s+(Season\s+\d+)$/i, '').trim(),
          url: {
            detail: detailUrl,      // URL asli
            clean: cleanUrl,        // URL bersih (tanpa episode)
          },
          episode: {
            title: episodeTitle,
            info: episode,
            status: status,
            sub_badge: subBadge,
          },
          image: image,
          type: type,
          is_completed: true,
          is_hot: isHot,
          genres: genres,
          source: 'anichin'
        });
      }
    });

    // ===== PAGINATION INFO =====
    const pagination = {};
    const paginationEl = $('.pagination');
    
    if (paginationEl.length) {
      // Current page
      const currentPage = paginationEl.find('span[aria-current="page"]').text().trim();
      pagination.current = parseInt(currentPage) || pageNum;
      
      // Total pages
      const pageLinks = paginationEl.find('a.page-numbers');
      let totalPages = 0;
      pageLinks.each((_, el) => {
        const pageNum = parseInt($(el).text().trim());
        if (!isNaN(pageNum) && pageNum > totalPages) {
          totalPages = pageNum;
        }
      });
      
      // Jika ada link dots, ambil dari link terakhir
      const lastPageLink = paginationEl.find('a.page-numbers:last-child');
      if (lastPageLink.length && !lastPageLink.hasClass('next')) {
        const lastPage = parseInt(lastPageLink.text().trim());
        if (!isNaN(lastPage) && lastPage > totalPages) {
          totalPages = lastPage;
        }
      }
      
      pagination.total = totalPages || 1;
      
      // Next and prev
      const nextLink = paginationEl.find('a.next.page-numbers');
      const prevLink = paginationEl.find('a.prev.page-numbers');
      
      pagination.has_next = nextLink.length > 0;
      pagination.has_prev = prevLink.length > 0 || pageNum > 1;
      pagination.next_page = pagination.has_next ? pageNum + 1 : null;
      pagination.prev_page = pagination.has_prev ? pageNum - 1 : null;
      
      // Info pagination text
      const paginationText = paginationEl.find('span:not(.page-numbers)').text().trim();
      pagination.info = paginationText;
      
    } else {
      pagination.current = pageNum;
      pagination.total = pageNum;
      pagination.has_next = false;
      pagination.has_prev = pageNum > 1;
      pagination.next_page = null;
      pagination.prev_page = pageNum > 1 ? pageNum - 1 : null;
    }

    console.log(`Successfully fetched ${completedList.length} completed donghua from page ${pageNum}`);

    return {
      success: true,
      page: pageNum,
      total_pages: pagination.total,
      total_items: completedList.length,
      has_next: pagination.has_next,
      has_prev: pagination.has_prev,
      pagination: pagination,
      data: completedList,
      source: 'anichin',
      scraped_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Get Anichin completed donghua error:', error.message);
    return {
      success: false,
      error: error.message,
      page: page || 1,
      total_pages: 0,
      total_items: 0,
      has_next: false,
      has_prev: false,
      data: [],
      scraped_at: new Date().toISOString()
    };
  }
}

app.get('/api/donghua/completed', async (req, res) => {
  try {
    const page = req.query.page || 1;
    const result = await getAnichinCompleted(page);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate'); // Cache 10 menit
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.get('/api/donghua/completed/page/:page', async (req, res) => {
  try {
    const page = req.params.page || 1;
    const result = await getAnichinCompleted(page);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// GET /api/donghua/schedule
async function getAnichinSchedule() {
  try {
    const url = `${ANICHIN_URL}/schedule/`;
    const res = await axios.get(`${PROXY}${url}`, { headers, timeout: 15000 });
    const $ = cheerio.load(res.data);
    
    const schedule = {
      monday: [], tuesday: [], wednesday: [], 
      thursday: [], friday: [], saturday: [], sunday: []
    };
    
    const dayClassMap = {
      'sch_sunday': 'sunday',
      'sch_monday': 'monday',
      'sch_tuesday': 'tuesday',
      'sch_wednesday': 'wednesday',
      'sch_thursday': 'thursday',
      'sch_friday': 'friday',
      'sch_saturday': 'saturday'
    };
    
    Object.keys(dayClassMap).forEach(className => {
      const dayEng = dayClassMap[className];
      const items = [];
      
      $(`.bixbox.schedulepage.${className}`).each((_, section) => {
        const $section = $(section);
        
        $section.find('.listupd .bs').each((_, item) => {
          const $item = $(item);
          const link = $item.find('.bsx a').first();
          const title = link.attr('title') || link.find('.tt').text().trim() || '';
          const href = link.attr('href');
          
          const timeSpan = $item.find('.epx.cndwn');
          let time = '?';
          if (timeSpan.length) {
            const timeText = timeSpan.text().trim();
            const timeMatch = timeText.match(/([0-2][0-9]:[0-5][0-9])/);
            if (timeMatch) time = timeMatch[1];
          }
          
          const image = $item.find('img').attr('src') || '';
          
          if (title && href && title.length > 3) {
            items.push({
              title: title,
              url: href.startsWith('http') ? href : `${ANICHIN_URL}${href}`,
              time: time,
              image: image,
              day: dayEng
            });
          }
        });
      });
      
      if (items.length > 0) {
        schedule[dayEng] = items;
      }
    });
    
    return schedule;
  } catch (error) {
    console.error('Anichin schedule error:', error.message);
    return {
      monday: [], tuesday: [], wednesday: [], 
      thursday: [], friday: [], saturday: [], sunday: []
    };
  }
}

app.get('/api/donghua/schedule', async (req, res) => {
  const data = await getAnichinSchedule();
  res.json({ success: true, data, lastUpdate: new Date().toISOString() });
});


// GET /api/donghua/detail/war-god-system-im-counting-on-you/ atau /api/donghua/detail?url=https://anichin.moe/busted-darklord/
async function detailAnichin(url) {
  try {
    // Validasi URL
    if (!url) {
      return {
        success: false,
        error: 'URL parameter is required'
      };
    }

    // Bangun URL lengkap
    const fullUrl = url.startsWith('http') ? url : `${ANICHIN_URL}${url}`;
    console.log(`Fetching Anichin detail from: ${fullUrl}`);
    
    const res = await axios.get(`${PROXY}${fullUrl}`, { 
      headers: {
        ...headers,
        'Referer': ANICHIN_URL,
        'Origin': ANICHIN_URL
      }, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(res.data);
    
    // ========== 1. INFORMASI DASAR ==========
    // Judul utama - dari h1.entry-title
    const title = $('h1.entry-title').text().trim() || '';
    
    // Alternative titles
    const altTitles = [];
    $('.alter').text().trim().split(',').forEach(t => {
      const trimmed = t.trim();
      if (trimmed) altTitles.push(trimmed);
    });
    
    // Gambar - dari .thumb img
    let image = $('.thumb img').attr('src') || '';
    if (image && !image.startsWith('http')) {
      image = image.startsWith('//') ? `https:${image}` : `${ANICHIN_URL}${image}`;
    }
    
    // Rating
    let rating = 0;
    let ratingCount = 0;
    const ratingText = $('.rating strong').text().trim();
    if (ratingText) {
      rating = parseFloat(ratingText.replace('Rating ', '')) || 0;
    }
    ratingCount = parseInt($('.rating-prc meta[itemprop="ratingCount"]').attr('content') || '0');
    
    // Synopsis - dari .entry-content p
    const synopsis = [];
    $('.entry-content p').each((_, el) => {
      const text = $(el).text().trim();
      if (text && !text.includes('Watch streaming') && !text.includes('don\'t forget')) {
        synopsis.push(text);
      }
    });
    const description = synopsis.join('\n\n') || 'No synopsis available.';
    
    // ========== 2. INFO DETAIL ==========
    const info = {};
    $('.spe span').each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      
      if (text.includes(':')) {
        const colonIndex = text.indexOf(':');
        const key = text.substring(0, colonIndex).trim().toLowerCase();
        let value = text.substring(colonIndex + 1).trim();
        
        // Handle special cases dengan link
        if ($el.find('a').length > 0) {
          value = $el.find('a').text().trim() || value;
        }
        
        // Mapping ke field yang sesuai
        if (key.includes('status')) info.status = value;
        else if (key.includes('network')) info.network = value;
        else if (key.includes('studio')) info.studio = value;
        else if (key.includes('released')) info.released = value;
        else if (key.includes('duration')) info.duration = value;
        else if (key.includes('season')) info.season = value;
        else if (key.includes('country')) info.country = value;
        else if (key.includes('type')) info.type = value;
        else if (key.includes('episodes')) {
          info.totalEpisodes = parseInt(value) || 0;
        }
        else if (key.includes('fansub')) info.fansub = value;
        else if (key.includes('posted by')) info.postedBy = value;
        else if (key.includes('released on')) info.postedOn = value;
        else if (key.includes('updated on')) info.updatedOn = value;
      }
    });
    
    // ========== 3. GENRES ==========
    const genres = [];
    $('.genxed a').each((_, el) => {
      genres.push($(el).text().trim());
    });
    
    // ========== 4. TAGS ==========
    const tags = [];
    $('.bottom.tags a').each((_, el) => {
      tags.push($(el).text().trim());
    });
    
    // ========== 5. EPISODES ==========
    const episodes = [];
    $('.eplister li').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a');
      
      let episodeUrl = link.attr('href') || '';
      if (episodeUrl && !episodeUrl.startsWith('http')) {
        episodeUrl = episodeUrl.startsWith('/') ? `${ANICHIN_URL}${episodeUrl}` : `${ANICHIN_URL}/${episodeUrl}`;
      }
      
      const epNum = $el.find('.epl-num').text().trim();
      const epTitle = $el.find('.epl-title').text().trim();
      const epDate = $el.find('.epl-date').text().trim();
      const hasSub = $el.find('.status.Sub').length > 0;
      
      // Bersihkan nomor episode (hapus "END" jika ada)
      let cleanEpNum = epNum.replace('END', '').trim();
      
      episodes.push({
        number: cleanEpNum,
        full_number: epNum,
        title: epTitle || `Episode ${cleanEpNum}`,
        url: episodeUrl,
        release_date: epDate,
        has_subtitle: hasSub
      });
    });
    
    // Sort episodes by number (newest first)
    episodes.sort((a, b) => {
      const numA = parseInt(a.number) || 0;
      const numB = parseInt(b.number) || 0;
      return numB - numA;
    });
    
    // ========== 6. DOWNLOAD LINKS ==========
    const downloads = [];
    
    $('.soraddlx .sorattlx').each((_, sectionEl) => {
      const $section = $(sectionEl);
      const sectionTitle = $section.find('h3').text().trim();
      
      // Cari semua .soraurlx setelah section ini
      const downloadItems = [];
      let nextEl = $section.next();
      
      while (nextEl.length && nextEl.hasClass('soraurlx')) {
        const quality = nextEl.find('strong').text().trim();
        const links = [];
        
        nextEl.find('a').each((_, linkEl) => {
          links.push({
            provider: $(linkEl).text().trim(),
            url: $(linkEl).attr('href')
          });
        });
        
        if (quality && links.length > 0) {
          downloadItems.push({
            quality: quality,
            links: links
          });
        }
        
        nextEl = nextEl.next();
      }
      
      if (downloadItems.length > 0) {
        downloads.push({
          title: sectionTitle,
          items: downloadItems
        });
      }
    });
    
    // ========== 7. RECOMMENDED SERIES ==========
    const recommendations = [];
    
    $('.listupd article.bs').each((_, el) => {
      const $el = $(el);
      const link = $el.find('.bsx a').first();
      
      let recUrl = link.attr('href') || '';
      if (recUrl && !recUrl.startsWith('http')) {
        recUrl = recUrl.startsWith('/') ? `${ANICHIN_URL}${recUrl}` : `${ANICHIN_URL}/${recUrl}`;
      }
      
      // Clean URL untuk series
      let cleanRecUrl = recUrl;
      let path = recUrl.replace(ANICHIN_URL, '');
      path = path.replace(/-episode-\d+-subtitle-indonesia/gi, '');
      path = path.replace(/-episode-\d+/gi, '');
      path = path.replace(/-season-\d+-episode-\d+/gi, '');
      path = path.replace(/-subtitle-indonesia/gi, '');
      
      if (!path.startsWith('/')) path = `/${path}`;
      if (!path.endsWith('/')) path = `${path}/`;
      cleanRecUrl = `${ANICHIN_URL}${path}`;
      
      // Title
      const $tt = $el.find('.tt');
      const $ttClone = $tt.clone();
      $ttClone.find('h2').remove();
      let recTitle = $ttClone.text().trim();
      
      if (!recTitle) {
        recTitle = link.attr('title') || '';
      }
      
      // Image
      let recImage = $el.find('.limit img').attr('src') || '';
      if (recImage && !recImage.startsWith('http')) {
        recImage = recImage.startsWith('//') ? `https:${recImage}` : `${ANICHIN_URL}${recImage}`;
      }
      
      // Type dan status
      const recType = $el.find('.limit .typez').text().trim() || 'Donghua';
      const recStatus = $el.find('.limit .status').text().trim() || '';
      const recEpisode = $el.find('.bt .epx').text().trim() || '';
      
      recommendations.push({
        title: recTitle,
        url: {
          detail: recUrl,
          clean: cleanRecUrl
        },
        image: recImage,
        type: recType,
        status: recStatus,
        episode_info: recEpisode,
        source: 'anichin'
      });
    });
    
    // ========== 8. STATS ==========
    const followers = parseInt($('.bmc').text().trim().replace(/\D/g, '')) || 0;
    
    // ========== 9. BREADCRUMB ==========
    const breadcrumb = [];
    $('.ts-breadcrumb span[itemprop="itemListElement"]').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a');
      breadcrumb.push({
        name: link.find('span').text().trim() || $el.text().trim(),
        url: link.attr('href') || null
      });
    });
    
    // ========== 10. BUILD RESPONSE ==========
    return {
      success: true,
      data: {
        // Informasi dasar
        title: title,
        alt_titles: altTitles,
        image: image,
        description: description,
        synopsis: description,
        
        // Rating
        rating: {
          value: rating,
          votes: ratingCount,
          percentage: rating * 10
        },
        
        // Detail info
        info: {
          status: info.status || 'Unknown',
          type: info.type || 'Donghua',
          studio: info.studio || 'Unknown',
          network: info.network || '',
          released: info.released || '',
          duration: info.duration || '',
          season: info.season || '',
          country: info.country || 'China',
          total_episodes: info.totalEpisodes || episodes.length,
          fansub: info.fansub || '',
          posted_by: info.postedBy || '',
          posted_on: info.postedOn || '',
          updated_on: info.updatedOn || ''
        },
        
        // Genre dan tags
        genres: genres,
        tags: tags,
        
        // Episode list
        episodes: episodes,
        total_episodes_found: episodes.length,
        latest_episode: episodes.length > 0 ? episodes[0] : null,
        first_episode: episodes.length > 0 ? episodes[episodes.length - 1] : null,
        
        // Download links
        downloads: downloads,
        has_downloads: downloads.length > 0,
        
        // Recommendations
        recommendations: recommendations,
        total_recommendations: recommendations.length,
        
        // Stats
        stats: {
          followers: followers
        },
        
        // Metadata
        source: 'anichin',
        url: fullUrl,
        scraped_at: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error('Detail Anichin error:', error.message);
    return {
      success: false,
      error: error.message,
      data: null,
      scraped_at: new Date().toISOString()
    };
  }
}

app.get('/api/donghua/detail', async (req, res) => {
  try {
    const urlParam = req.query.url || req.query.link;
    
    if (!urlParam) {
      return res.status(400).json({
        success: false,
        error: 'URL or link parameter required'
      });
    }
    
    const data = await detailAnichin(urlParam);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate'); // Cache 10 menit
    
    res.json(data);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.get('/api/donghua/detail/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const urlParam = `/${slug}/`;
    
    const data = await detailAnichin(urlParam);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    
    res.json(data);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// GET /api/donghua/watch/the-daily-life-of-the-immortal-king-episode-13-subtitle-indonesia atau /api/donghua/watch?url=https://anichin.moe/the-daily-life-of-the-immortal-king-episode-13-subtitle-indonesia/
async function watchAnichin(url) {
  try {
    // Validasi URL
    if (!url) {
      return {
        success: false,
        error: 'URL parameter is required'
      };
    }

    // Bangun URL lengkap
    const fullUrl = url.startsWith('http') ? url : `${ANICHIN_URL}${url}`;
    console.log(`Fetching Anichin watch from: ${fullUrl}`);
    
    const res = await axios.get(`${PROXY}${fullUrl}`, { 
      headers: {
        ...headers,
        'Referer': ANICHIN_URL,
        'Origin': ANICHIN_URL
      }, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(res.data);
    
    // ========== 1. INFORMASI DASAR EPISODE ==========
    const title = $('h1.entry-title').text().trim() || $('title').text().replace(' - Anichin', '').trim() || 'Unknown';
    
    // Episode number dari meta
    let episodeNumber = '';
    const episodeMeta = $('meta[itemprop="episodeNumber"]').attr('content');
    if (episodeMeta) {
      episodeNumber = episodeMeta;
    } else {
      // Coba ambil dari judul
      const episodeMatch = title.match(/Episode (\d+)/i);
      if (episodeMatch) {
        episodeNumber = episodeMatch[1];
      }
    }
    
    // Series title
    const seriesTitle = $('span.year a[href*="/the-daily-life-of-the-immortal-king/"]').text().trim() || 
                        $('.single-info .infox h2[itemprop="partOfSeries"]').text().trim() || 
                        'Unknown Series';
    
    // Series URL
    let seriesUrl = $('span.year a').attr('href') || '';
    if (seriesUrl && !seriesUrl.startsWith('http')) {
      seriesUrl = seriesUrl.startsWith('/') ? `${ANICHIN_URL}${seriesUrl}` : `${ANICHIN_URL}/${seriesUrl}`;
    }
    
    // Gambar
    let image = $('meta[property="og:image"]').attr('content') || $('.thumb img').attr('src') || '';
    if (image && !image.startsWith('http')) {
      image = image.startsWith('//') ? `https:${image}` : `${ANICHIN_URL}${image}`;
    }
    
    // Release date
    const releaseDate = $('span.year time.updated').text().trim() || 
                        $('span.year span.updated').text().trim() || 
                        $('meta[property="article:published_time"]').attr('content');
    
    // Posted by
    const postedBy = $('span.year span.vcard.author .fn a, span.year span.vcard.author .fn').text().trim() || 
                     $('meta[name="author"]').attr('content') || 
                     'Dongdong';
    
    // ========== 2. STREAMING SERVERS ==========
    const streams = [];
    
    // Cara 1: Ambil dari select.mirror (base64 encoded)
    $('select.mirror option').each((_, el) => {
      const $option = $(el);
      const value = $option.attr('value');
      const serverName = $option.text().trim();
      
      // Skip option pertama yang disabled
      if (!value || value === '' || $option.attr('disabled')) return;
      
      try {
        // Decode base64 menjadi HTML iframe
        const decodedHtml = Buffer.from(value, 'base64').toString('utf-8');
        
        // Ekstrak src dari iframe menggunakan regex
        const srcMatch = decodedHtml.match(/src=["'](.*?)["']/i);
        if (srcMatch && srcMatch[1]) {
          let videoUrl = srcMatch[1];
          
          // Bersihin URL jika ada encoding
          videoUrl = videoUrl.replace(/&amp;/g, '&');
          
          // Deteksi apakah server mengandung iklan
          const hasAds = serverName.toLowerCase().includes('ads');
          
          streams.push({
            server: serverName,
            url: videoUrl,
            type: hasAds ? 'ads' : 'main',
            original_iframe: decodedHtml, // Optional: simpan iframe asli
            quality: detectQuality(serverName) // Fungsi untuk deteksi kualitas
          });
        }
      } catch (decodeError) {
        console.log('Error decoding base64 for server:', serverName);
      }
    });
    
    // Cara 2: Ambil iframe yang sudah ada di embed_holder
    if (streams.length === 0) {
      const iframeSrc = $('#embed_holder iframe').attr('src');
      if (iframeSrc) {
        streams.push({
          server: 'Default Server',
          url: iframeSrc,
          type: 'main',
          quality: detectQuality(iframeSrc)
        });
      }
    }
    
    // ========== 3. SERVER INFO DESCRIPTIONS ==========
    const serverDescriptions = [];
    $('.announ').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.includes('Server')) {
        serverDescriptions.push(text);
      }
    });
    
    // ========== 4. DOWNLOAD LINKS ==========
    const downloads = [];
    
    $('.soraddlx .sorattlx').each((_, sectionEl) => {
      const $section = $(sectionEl);
      const sectionTitle = $section.find('h3').text().trim();
      
      // Cari semua .soraurlx setelah section ini
      const downloadItems = [];
      let nextEl = $section.next();
      
      while (nextEl.length && nextEl.hasClass('soraurlx')) {
        const quality = nextEl.find('strong').text().trim();
        const links = [];
        
        nextEl.find('a').each((_, linkEl) => {
          links.push({
            provider: $(linkEl).text().trim(),
            url: $(linkEl).attr('href')
          });
        });
        
        if (quality && links.length > 0) {
          downloadItems.push({
            quality: quality,
            links: links
          });
        }
        
        nextEl = nextEl.next();
      }
      
      if (downloadItems.length > 0) {
        downloads.push({
          title: sectionTitle,
          items: downloadItems
        });
      }
    });
    
    // ========== 5. NAVIGASI EPISODE ==========
    const navigation = {
      prev: null,
      next: null,
      all_episodes: null
    };
    
    // Previous episode
    const prevLink = $('.naveps.bignav .nvs a[rel="prev"]');
    if (prevLink.length) {
      navigation.prev = {
        title: prevLink.text().trim().replace('Prev', '').trim(),
        url: prevLink.attr('href').startsWith('http') ? prevLink.attr('href') : `${ANICHIN_URL}${prevLink.attr('href')}`
      };
    }
    
    // Next episode
    const nextLink = $('.naveps.bignav .nvs a[rel="next"]');
    if (nextLink.length) {
      navigation.next = {
        title: nextLink.text().trim().replace('Next', '').trim(),
        url: nextLink.attr('href').startsWith('http') ? nextLink.attr('href') : `${ANICHIN_URL}${nextLink.attr('href')}`
      };
    }
    
    // All episodes link
    const allEpsLink = $('.naveps.bignav .nvsc a');
    if (allEpsLink.length) {
      navigation.all_episodes = {
        title: allEpsLink.text().trim(),
        url: allEpsLink.attr('href').startsWith('http') ? allEpsLink.attr('href') : `${ANICHIN_URL}${allEpsLink.attr('href')}`
      };
    }
    
    // ========== 6. RELATED EPISODES ==========
    const relatedEpisodes = [];
    
    $('#mainepisode #singlepisode .episodelist ul li').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a');
      const isSelected = $el.hasClass('selected');
      
      let episodeUrl = link.attr('href') || '';
      if (episodeUrl && !episodeUrl.startsWith('http')) {
        episodeUrl = episodeUrl.startsWith('/') ? `${ANICHIN_URL}${episodeUrl}` : `${ANICHIN_URL}/${episodeUrl}`;
      }
      
      // Episode info dari .playinfo
      const episodeTitle = link.find('.playinfo h3').text().trim();
      const episodeInfo = link.find('.playinfo span').text().trim();
      
      // Extract episode number dari span
      let episodeNum = '';
      if (episodeInfo) {
        const numMatch = episodeInfo.match(/Eps (\d+)/i);
        if (numMatch) {
          episodeNum = numMatch[1];
        }
      }
      
      // Thumbnail
      let thumb = link.find('.thumbnel img').attr('src') || '';
      if (thumb && !thumb.startsWith('http')) {
        thumb = thumb.startsWith('//') ? `https:${thumb}` : `${ANICHIN_URL}${thumb}`;
      }
      
      relatedEpisodes.push({
        number: episodeNum,
        title: episodeTitle,
        url: episodeUrl,
        info: episodeInfo,
        thumbnail: thumb,
        is_current: isSelected
      });
    });
    
    // Sort episodes by number (descending - newest first)
    relatedEpisodes.sort((a, b) => {
      const numA = parseInt(a.number) || 0;
      const numB = parseInt(b.number) || 0;
      return numB - numA;
    });
    
    // ========== 7. RECOMMENDATIONS ==========
    const recommendations = [];
    
    $('.listupd article.bs').each((_, el) => {
      const $el = $(el);
      const link = $el.find('.bsx a').first();
      
      let recUrl = link.attr('href') || '';
      if (recUrl && !recUrl.startsWith('http')) {
        recUrl = recUrl.startsWith('/') ? `${ANICHIN_URL}${recUrl}` : `${ANICHIN_URL}/${recUrl}`;
      }
      
      // Clean URL untuk series
      let cleanRecUrl = recUrl;
      let path = recUrl.replace(ANICHIN_URL, '');
      path = path.replace(/-episode-\d+-subtitle-indonesia/gi, '');
      path = path.replace(/-episode-\d+/gi, '');
      path = path.replace(/-season-\d+-episode-\d+/gi, '');
      path = path.replace(/-subtitle-indonesia/gi, '');
      
      if (!path.startsWith('/')) path = `/${path}`;
      if (!path.endsWith('/')) path = `${path}/`;
      cleanRecUrl = `${ANICHIN_URL}${path}`;
      
      // Title
      const $tt = $el.find('.tt');
      const $ttClone = $tt.clone();
      $ttClone.find('h2').remove();
      let recTitle = $ttClone.text().trim();
      
      if (!recTitle) {
        recTitle = link.attr('title') || '';
      }
      
      // Image
      let recImage = $el.find('.limit img').attr('src') || '';
      if (recImage && !recImage.startsWith('http')) {
        recImage = recImage.startsWith('//') ? `https:${recImage}` : `${ANICHIN_URL}${recImage}`;
      }
      
      // Type dan status
      const recType = $el.find('.limit .typez').text().trim() || 'Donghua';
      const recStatus = $el.find('.limit .status').text().trim() || '';
      const recEpisode = $el.find('.bt .epx').text().trim() || '';
      
      recommendations.push({
        title: recTitle,
        url: {
          detail: recUrl,
          clean: cleanRecUrl
        },
        image: recImage,
        type: recType,
        status: recStatus,
        episode_info: recEpisode,
        source: 'anichin'
      });
    });
    
    // ========== 8. BREADCRUMB ==========
    const breadcrumb = [];
    $('.ts-breadcrumb span[itemprop="itemListElement"]').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a');
      breadcrumb.push({
        name: link.find('span').text().trim() || $el.text().trim(),
        url: link.attr('href') ? (link.attr('href').startsWith('http') ? link.attr('href') : `${ANICHIN_URL}${link.attr('href')}`) : null
      });
    });
    
    // ========== 9. BUILD RESPONSE ==========
    return {
      success: true,
      data: {
        // Episode info
        episode: {
          title: title,
          number: episodeNumber,
          series_title: seriesTitle,
          series_url: seriesUrl,
          image: image,
          release_date: releaseDate,
          posted_by: postedBy,
        },
        
        // Streaming
        streams: streams,
        total_streams: streams.length,
        server_info: serverDescriptions.join(' '),
        
        // Download
        downloads: downloads,
        has_downloads: downloads.length > 0,
        
        // Navigation
        navigation: navigation,
        
        // Related episodes dari series yang sama
        related_episodes: relatedEpisodes,
        total_related_episodes: relatedEpisodes.length,
        current_episode_index: relatedEpisodes.findIndex(ep => ep.is_current),
        
        // Recommendations
        recommendations: recommendations.slice(0, 5), // Ambil 5 rekomendasi pertama
        total_recommendations: recommendations.length,
        
        // Breadcrumb
        breadcrumb: breadcrumb,
        
        // Metadata
        source: 'anichin',
        url: fullUrl,
        scraped_at: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error('Watch Anichin error:', error.message);
    return {
      success: false,
      error: error.message,
      data: null,
      scraped_at: new Date().toISOString()
    };
  }
}

function detectQuality(text) {
  text = text.toLowerCase();
  if (text.includes('1080p') || text.includes('fullhd')) return '1080p';
  if (text.includes('720p') || text.includes('hd')) return '720p';
  if (text.includes('480p')) return '480p';
  if (text.includes('360p')) return '360p';
  if (text.includes('240p')) return '240p';
  return 'unknown';
}

app.get('/api/donghua/watch', async (req, res) => {
  try {
    const urlParam = req.query.url || req.query.link;
    
    if (!urlParam) {
      return res.status(400).json({
        success: false,
        error: 'URL or link parameter required'
      });
    }
    
    const data = await watchAnichin(urlParam);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // Cache 5 menit
    
    res.json(data);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.get('/api/donghua/watch/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    // Format: the-daily-life-of-the-immortal-king-episode-13-subtitle-indonesia
    const urlParam = `/${slug}/`;
    
    const data = await watchAnichin(urlParam);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    
    res.json(data);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// GET /api/donghua/api/donghua/genres/comedy?page=2
async function getAnichinByGenre(genre, page = 1) {
  try {
    // Validasi genre
    if (!genre) {
      return {
        success: false,
        error: 'Genre parameter is required'
      };
    }

    // Validasi page
    const pageNum = parseInt(page) || 1;
    
    // URL halaman genre dengan pagination
    // Format: /genres/{genre}/ atau /genres/{genre}/page/{page}/
    const url = pageNum === 1 
      ? `${ANICHIN_URL}/genres/${genre}/`
      : `${ANICHIN_URL}/genres/${genre}/page/${pageNum}/`;
    
    console.log(`Fetching Anichin genre "${genre}" page ${pageNum} from: ${url}`);
    
    const response = await axios.get(`${PROXY}${url}`, { 
      headers: {
        ...headers,
        'Referer': ANICHIN_URL,
        'Origin': ANICHIN_URL
      }, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(response.data);
    const animeList = [];

    // SELECTOR: Mengambil dari .listupd article.bs
    $('.listupd article.bs').each((_, element) => {
      const $el = $(element);
      const linkElement = $el.find('.bsx a').first();
      
      // ===== 1. URL DETAIL =====
      let detailUrl = linkElement.attr('href') || '';
      if (detailUrl && !detailUrl.startsWith('http')) {
        detailUrl = detailUrl.startsWith('/') ? `${ANICHIN_URL}${detailUrl}` : `${ANICHIN_URL}/${detailUrl}`;
      }

      // ===== 2. CLEAN URL (untuk series) =====
      let cleanUrl = detailUrl;
      let path = detailUrl.replace(ANICHIN_URL, '');
      
      // Hapus bagian episode/subtitle jika ada
      path = path.replace(/-episode-\d+-subtitle-indonesia/gi, '');
      path = path.replace(/-episode-\d+/gi, '');
      path = path.replace(/-season-\d+-episode-\d+/gi, '');
      path = path.replace(/-subtitle-indonesia/gi, '');
      path = path.replace(/\/\/+/g, '/');
      
      if (!path.startsWith('/')) path = `/${path}`;
      if (!path.endsWith('/')) path = `${path}/`;
      
      cleanUrl = `${ANICHIN_URL}${path}`;

      // ===== 3. TITLE =====
      const $tt = $el.find('.tt');
      const $ttClone = $tt.clone();
      $ttClone.find('h2').remove();
      let title = $ttClone.text().trim();
      
      if (!title) {
        title = linkElement.attr('title') || '';
        title = title.replace(/\s+Subtitle Indonesia$/i, '').trim();
      }

      // ===== 4. EPISODE TITLE =====
      const episodeTitle = $tt.find('h2').text().trim() || '';

      // ===== 5. GAMBAR =====
      let image = $el.find('.limit img').attr('src') || '';
      if (image && !image.startsWith('http')) {
        image = image.startsWith('//') ? `https:${image}` : `https://${image}`;
      }

      // ===== 6. TYPE =====
      const type = $el.find('.limit .typez').text().trim() || 'Donghua';
      
      // ===== 7. STATUS =====
      const status = $el.find('.limit .status').text().trim() || '';

      // ===== 8. EPISODE INFO =====
      const episode = $el.find('.bt .epx').text().trim() || '';
      
      // ===== 9. HOT BADGE =====
      const isHot = $el.find('.limit .hotbadge').length > 0;

      // ===== 10. SUB BADGE =====
      const subBadge = $el.find('.bt .sb').text().trim() || 'Sub';

      // ===== 11. SCORE/RATING =====
      let score = '';
      const scoreEl = $el.find('.numscore, .score');
      if (scoreEl.length) {
        score = scoreEl.text().trim();
      }

      // Hanya tambahkan jika title dan url ada
      if (title && detailUrl) {
        animeList.push({
          title: title,
          clean_title: title.replace(/\s+(Season\s+\d+)$/i, '').trim(),
          url: {
            detail: detailUrl,      // URL asli (bisa episode atau series)
            clean: cleanUrl,         // URL bersih (hanya series)
          },
          episode: {
            title: episodeTitle,
            info: episode,
            status: status,
            sub_badge: subBadge,
          },
          image: image,
          type: type,
          score: score,
          is_hot: isHot,
          source: 'anichin'
        });
      }
    });

    // ===== AMBIL INFORMASI GENRE =====
    const genreInfo = {
      name: genre,
      display_name: $('h1.page-title span').text().trim() || genre,
      total_series: animeList.length,
      url: `${ANICHIN_URL}/genres/${genre}/`
    };

    // ===== PAGINATION INFO =====
    const pagination = {};
    const paginationEl = $('.pagination');
    
    if (paginationEl.length) {
      // Current page
      const currentPage = paginationEl.find('span[aria-current="page"]').text().trim();
      pagination.current = parseInt(currentPage) || pageNum;
      
      // Total pages
      const pageLinks = paginationEl.find('a.page-numbers');
      let totalPages = 0;
      
      pageLinks.each((_, el) => {
        const $el = $(el);
        // Skip "Previous" and "Next" links
        if ($el.hasClass('prev') || $el.hasClass('next')) return;
        
        const pageNum = parseInt($el.text().trim());
        if (!isNaN(pageNum) && pageNum > totalPages) {
          totalPages = pageNum;
        }
      });
      
      // Jika ada link dots, ambil dari link terakhir
      const lastPageLink = paginationEl.find('a.page-numbers:not(.prev):not(.next)').last();
      if (lastPageLink.length) {
        const lastPage = parseInt(lastPageLink.text().trim());
        if (!isNaN(lastPage) && lastPage > totalPages) {
          totalPages = lastPage;
        }
      }
      
      pagination.total = totalPages || 1;
      
      // Next and prev
      const nextLink = paginationEl.find('a.next.page-numbers');
      const prevLink = paginationEl.find('a.prev.page-numbers');
      
      pagination.has_next = nextLink.length > 0;
      pagination.has_prev = prevLink.length > 0 || pageNum > 1;
      pagination.next_page = pagination.has_next ? pageNum + 1 : null;
      pagination.prev_page = pagination.has_prev ? pageNum - 1 : null;
      
      // Info pagination
      const paginationText = paginationEl.find('span:not(.page-numbers)').text().trim();
      pagination.info = paginationText || `Page ${pageNum} of ${totalPages}`;
      
    } else {
      pagination.current = pageNum;
      pagination.total = 1;
      pagination.has_next = false;
      pagination.has_prev = pageNum > 1;
      pagination.next_page = null;
      pagination.prev_page = pageNum > 1 ? pageNum - 1 : null;
    }

    console.log(`Successfully fetched ${animeList.length} anime from genre "${genre}" page ${pageNum} (total pages: ${pagination.total})`);

    return {
      success: true,
      genre: genreInfo,
      page: pageNum,
      total_pages: pagination.total,
      total_items: animeList.length,
      has_next: pagination.has_next,
      has_prev: pagination.has_prev,
      pagination: {
        current: pageNum,
        total: pagination.total,
        has_next: pagination.has_next,
        has_prev: pagination.has_prev,
        next_page: pagination.next_page,
        prev_page: pagination.prev_page,
        info: pagination.info
      },
      data: animeList,
      source: 'anichin',
      scraped_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Get Anichin by genre error:', error.message);
    return {
      success: false,
      error: error.message,
      genre: genre || null,
      page: page || 1,
      total_pages: 0,
      total_items: 0,
      has_next: false,
      has_prev: false,
      data: [],
      scraped_at: new Date().toISOString()
    };
  }
}

app.get('/api/donghua/genres/:genre', async (req, res) => {
  try {
    const genre = req.params.genre.toLowerCase().trim();
    const page = req.query.page || 1;
    
    const result = await getAnichinByGenre(genre, page);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate'); // Cache 10 menit
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// GET /api/donghua/api/donghua/genres
async function getAnichinGenres() {
  try {
    const url = `${ANICHIN_URL}/anime/`; // Ambil dari halaman daftar anime
    
    console.log('Fetching all genres from:', url);
    
    const response = await axios.get(`${PROXY}${url}`, { 
      headers, 
      timeout: 15000 
    });
    
    const $ = cheerio.load(response.data);
    const genres = [];

    // SELECTOR: Ambil dari filter genre di sidebar
    $('.quickfilter .filters .filter.dropdown ul.c4 li input[name="genre[]"]').each((_, el) => {
      const $el = $(el);
      const genreValue = $el.attr('value');
      const genreName = $el.next('label').text().trim();
      
      if (genreValue && genreName && genreValue !== 'a' && genreValue.length > 1) {
        genres.push({
          name: genreValue,
          display_name: genreName,
          url: `${ANICHIN_URL}/genres/${genreValue}/`,
          count: null // Bisa ditambahkan jika ada info jumlah
        });
      }
    });

    // Urutkan berdasarkan display_name
    genres.sort((a, b) => a.display_name.localeCompare(b.display_name));

    console.log(`Successfully fetched ${genres.length} genres`);

    return {
      success: true,
      total_genres: genres.length,
      data: genres,
      source: 'anichin',
      scraped_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Get Anichin genres error:', error.message);
    return {
      success: false,
      error: error.message,
      total_genres: 0,
      data: [],
      scraped_at: new Date().toISOString()
    };
  }
}

app.get('/api/donghua/genres', async (req, res) => {
  try {
    const result = await getAnichinGenres();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // Cache 1 jam
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.get('/api/donghua/genres/:genre/page/:page', async (req, res) => {
  try {
    const genre = req.params.genre.toLowerCase().trim();
    const page = req.params.page || 1;
    
    const result = await getAnichinByGenre(genre, page);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});





// ============= ENDPOINT DONGHUA LIST DENGAN FILTER LENGKAP (DENGAN PROXY) =============
app.get('/api/donghua/list', async (req, res) => {
    try {
        // ========== AMBIL SEMUA PARAMETER FILTER ==========
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        
        // Genre (bisa array)
        const genreParams = req.query.genre ? 
            (Array.isArray(req.query.genre) ? req.query.genre : [req.query.genre]) : [];
        
        // Season (bisa array)
        const seasonParams = req.query.season ? 
            (Array.isArray(req.query.season) ? req.query.season : [req.query.season]) : [];
        
        // Studio (bisa array)
        const studioParams = req.query.studio ? 
            (Array.isArray(req.query.studio) ? req.query.studio : [req.query.studio]) : [];
        
        // Status (single value)
        const statusParam = req.query.status || '';
        
        // Type (single value)
        const typeParam = req.query.type || '';
        
        // Sub (single value)
        const subParam = req.query.sub || '';
        
        // Order (single value)
        const orderParam = req.query.order || '';
        
        // ========== BANGUN URL DENGAN FILTER ==========
        let url = `${ANICHIN_URL}/anime/`;
        
        // Kumpulkan semua parameter query
        const queryParams = [];
        
        // Tambahkan genre (format: genre[]=action&genre[]=fantasy)
        genreParams.forEach(genre => {
            queryParams.push(`genre[]=${encodeURIComponent(genre)}`);
        });
        
        // Tambahkan season (format: season[]=fall-2025)
        seasonParams.forEach(season => {
            queryParams.push(`season[]=${encodeURIComponent(season)}`);
        });
        
        // Tambahkan studio (format: studio[]=betobe)
        studioParams.forEach(studio => {
            queryParams.push(`studio[]=${encodeURIComponent(studio)}`);
        });
        
        // Tambahkan status
        if (statusParam) {
            queryParams.push(`status=${encodeURIComponent(statusParam)}`);
        }
        
        // Tambahkan type
        if (typeParam) {
            queryParams.push(`type=${encodeURIComponent(typeParam)}`);
        }
        
        // Tambahkan sub
        if (subParam) {
            queryParams.push(`sub=${encodeURIComponent(subParam)}`);
        }
        
        // Tambahkan order
        if (orderParam) {
            queryParams.push(`order=${encodeURIComponent(orderParam)}`);
        }
        
        // Gabungkan semua parameter ke URL
        if (queryParams.length > 0) {
            url += '?' + queryParams.join('&');
        }
        
        // Tambahkan page jika > 1 (untuk halaman berikutnya)
        if (page > 1) {
            // Jika sudah ada query params, tambahkan &page=
            if (queryParams.length > 0) {
                url += `&page=${page}`;
            } else {
                url += `?page=${page}`;
            }
        }
        
        console.log(`Fetching donghua list with filters: ${url}`);
        
        // ========== FETCH DARI WEBSITE MENGGUNAKAN PROXY ==========
        // Gunakan proxy untuk menghindari CORS dan IP block
        const { data } = await axios.get(`${PROXY}${url}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://www.google.com/'
            },
            timeout: 15000 // Tambahkan timeout 15 detik
        });
        
        const $ = cheerio.load(data);
        
        // ========== PARSING HASIL ==========
        const donghuaList = [];
        
        $('.listupd article.bs').each((index, element) => {
            const $el = $(element);
            const link = $el.find('a').first();
            const href = link.attr('href') || '';
            
            // Skip if no href
            if (!href) return;
            
            // Title
            const title = $el.find('.tt').text().trim() || 
                         link.attr('title') || 
                         'Unknown Title';
            
            // Thumbnail
            let thumbnail = $el.find('img').attr('src') || $el.find('img').attr('data-src');
            if (thumbnail) {
                if (thumbnail.includes('i0.wp.com') && !thumbnail.startsWith('http')) {
                    thumbnail = 'https:' + thumbnail;
                } else if (thumbnail.startsWith('//')) {
                    thumbnail = 'https:' + thumbnail;
                }
            }
            
            // Status (dari badge status)
            const statusElement = $el.find('.status').first();
            let status = statusElement.text().trim();
            
            // Jika tidak ada status, cek dari class lain
            if (!status) {
                if ($el.find('.hotbadge').length > 0) status = 'Hot';
                else if ($el.find('.typez').next('.sb').length > 0) status = 'Ongoing';
            }
            
            // Type
            const type = $el.find('.typez').text().trim() || 'Donghua';
            
            // Episode info
            const episode = $el.find('.epx').text().trim() || '';
            
            // Hot badge
            const isHot = $el.find('.hotbadge').length > 0;
            
            // Get slug from URL
            let slug = href.replace(ANICHIN_URL, '').replace(/^\//, '').replace(/\/$/, '');
            
            donghuaList.push({
                title: title,
                slug: slug,
                url: href,
                thumbnail: thumbnail || null,
                type: type,
                status: status,
                episode: episode,
                is_hot: isHot,
                source: 'Anichin'
            });
        });
        
        // ========== PAGINATION INFO ==========
        const hasNextPage = $('.hpage a.r, .pagination .next, .page-numbers.next').length > 0;
        
        let lastPage = page;
        $('.page-numbers:not(.next)').each((i, el) => {
            const pageNum = parseInt($(el).text().trim());
            if (!isNaN(pageNum) && pageNum > lastPage) {
                lastPage = pageNum;
            }
        });
        
        // ========== INFO FILTER YANG SEDANG DITERAPKAN ==========
        const appliedFilters = {
            genres: genreParams,
            seasons: seasonParams,
            studios: studioParams,
            status: statusParam,
            type: typeParam,
            sub: subParam,
            order: orderParam
        };
        
        // ========== RESPONSE ==========
        res.json({
            success: true,
            data: {
                donghua: donghuaList.slice(0, limit),
                total_results: donghuaList.length,
                total_in_page: donghuaList.length,
                applied_filters: appliedFilters
            },
            pagination: {
                current_page: page,
                next_page: hasNextPage ? page + 1 : null,
                has_next_page: hasNextPage,
                last_page: lastPage > page ? lastPage : (hasNextPage ? null : page),
                limit: limit,
                total_results_estimate: donghuaList.length < limit && !hasNextPage ? donghuaList.length : 'many'
            },
            filter_url: {
                current: `${PROXY}${url}`,
                base: `${PROXY}${ANICHIN_URL}/anime/`
            },
            source: {
                name: 'Anichin (via proxy)',
                url: `${PROXY}${url}`,
                scraped_at: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Error fetching donghua list:', error.message);
        
        if (error.response) {
            if (error.response.status === 404) {
                return res.status(404).json({
                    success: false,
                    message: 'Halaman tidak ditemukan',
                    error: 'Not Found'
                });
            } else if (error.response.status === 403) {
                return res.status(503).json({
                    success: false,
                    message: 'Website Anichin memblokir akses. Coba lagi nanti.',
                    error: 'Access Forbidden (403)'
                });
            }
        }
        
        // Tambahan handling untuk error timeout
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({
                success: false,
                message: 'Timeout saat mengakses website',
                error: 'Request Timeout'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil daftar donghua',
            error: error.message
        });
    }
});



const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 DUAL SOURCE API running on port ${PORT}`);
  console.log(`🔧 Proxy: ${PROXY}\n`);
});

module.exports = app;