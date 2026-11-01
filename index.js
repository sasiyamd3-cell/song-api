const express = require('express');
const axios = require('axios');
const https = require('https');

const app = express();
const agent = new https.Agent({ rejectUnauthorized: false });

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

// Home Route
app.get('/', (req, res) => {
  res.json({
    status: true,
    message: 'Sinhala Audio Scraper API is Running!',
    endpoint: '/api/audio?q=SongName'
  });
});

// Main Audio Scraper & Buffer Endpoint
app.get('/api/audio', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ status: false, error: 'Please provide a song name using ?q=SongName' });
  }

  try {
    // 1. Search YouTube via internal scraper
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' sinhala song')}`;
    const response = await axios.get(searchUrl, { headers, httpsAgent: agent, timeout: 15000 });
    
    const html = response.data;
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/);
    if (!match) {
      return res.status(404).json({ status: false, error: 'Failed to parse YouTube search data' });
    }

    const json = JSON.parse(match[1]);
    const contents = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    
    let videoId = null;
    let songTitle = query;

    if (contents) {
      for (const content of contents) {
        const items = content.itemSectionRenderer?.contents;
        if (items) {
          for (const item of items) {
            if (item.videoRenderer) {
              videoId = item.videoRenderer.videoId;
              songTitle = item.videoRenderer.title?.runs?.[0]?.text || query;
              break;
            }
          }
        }
        if (videoId) break;
      }
    }

    if (!videoId) {
      return res.status(404).json({ status: false, error: 'No songs found for your query' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // 2. Grab direct audio source stream link
    const grabber = await axios.get(`https://savetube.su/api/download?url=${encodeURIComponent(videoUrl)}`, {
      headers, 
      httpsAgent: agent, 
      timeout: 15000
    }).catch(() => null);

    const directAudioUrl = grabber?.data?.result?.audio || grabber?.data?.result?.dl || null;
    if (!directAudioUrl) {
      return res.status(500).json({ status: false, error: 'Failed to extract audio download stream' });
    }

    // 3. Fetch binary stream and pipe directly as buffer
    const audioStream = await axios.get(directAudioUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('X-Song-Title', encodeURIComponent(songTitle));
    res.send(Buffer.from(audioStream.data));

  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

// Local Development Support
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Local Scraper API running on port ${PORT}`));
}

module.exports = app;
