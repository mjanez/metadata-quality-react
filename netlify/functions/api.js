const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();

// Configure axios to ignore SSL certificate errors
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

axios.defaults.httpsAgent = httpsAgent;
axios.defaults.timeout = 30000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'MQA Netlify Functions',
    version: '1.0.0'
  });
});

// URL validation endpoint
app.post('/validate-url', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        accessible: false, 
        error: 'URL is required' 
      });
    }

    console.log(`Validating URL: ${url}`);

    // Validate URL format
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (error) {
      return res.json({ 
        accessible: false, 
        error: 'Invalid URL format' 
      });
    }

    // Check URL accessibility
    try {
      const response = await axios.head(url, {
        timeout: 10000,
        maxRedirects: 5,
        httpsAgent: httpsAgent,
        validateStatus: function (status) {
          return true;
        },
        headers: {
          'User-Agent': 'MQA-Netlify/1.0.0 (URL Validation)',
          'Accept': '*/*'
        }
      });

      const accessible = response.status >= 200 && response.status < 400;
      
      res.json({
        accessible,
        status: response.status,
        headers: {
          'content-type': response.headers['content-type'],
          'content-length': response.headers['content-length']
        }
      });
    } catch (error) {
      console.error(`URL validation failed for ${url}:`, error.message);
      
      let accessible = false;
      if (error.code === 'CERT_HAS_EXPIRED' || 
          error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
          error.code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
          error.message.includes('certificate')) {
        accessible = true;
      }
      
      res.json({
        accessible,
        error: error.message,
        status: error.response?.status,
        sslWarning: error.message.includes('certificate')
      });
    }
  } catch (error) {
    console.error('URL validation error:', error);
    res.status(500).json({ 
      accessible: false, 
      error: 'Internal server error' 
    });
  }
});

// Data download endpoint
app.post('/download-data', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        error: 'URL is required' 
      });
    }

    console.log(`Downloading data from: ${url}`);

    try {
      const response = await axios.get(url, {
        timeout: 30000,
        maxRedirects: 5,
        responseType: 'text',
        maxContentLength: 50 * 1024 * 1024,
        httpsAgent: httpsAgent,
        headers: {
          'User-Agent': 'MQA-Netlify/1.0.0 (Data Quality Analysis)',
          'Accept': 'text/csv, application/json, text/plain, */*'
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      res.json({
        data: response.data,
        contentType: response.headers['content-type'],
        size: response.data.length
      });
    } catch (error) {
      console.error(`Data download failed for ${url}:`, error.message);
      
      if (error.message.includes('certificate') || error.code?.includes('CERT')) {
        try {
          console.log(`Retrying ${url} with more permissive SSL settings...`);
          const retryResponse = await axios.get(url, {
            timeout: 30000,
            maxRedirects: 5,
            responseType: 'text',
            maxContentLength: 50 * 1024 * 1024,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/csv, application/json, text/plain, */*'
            }
          });
          
          res.json({
            data: retryResponse.data,
            contentType: retryResponse.headers['content-type'],
            size: retryResponse.data.length,
            sslWarning: true
          });
          return;
        } catch (retryError) {
          console.error(`Retry also failed for ${url}:`, retryError.message);
        }
      }
      
      res.status(500).json({
        error: `Failed to download data: ${error.message}`,
        status: error.response?.status,
        code: error.code
      });
    }
  } catch (error) {
    console.error('Data download error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

module.exports.handler = serverless(app);