const express = require('express');
const cors = require('cors');
const axios = require('axios');
const helmet = require('helmet');
const morgan = require('morgan');
const https = require('https');

// Configure axios to ignore SSL certificate errors in development
const httpsAgent = new https.Agent({
  rejectUnauthorized: false // Ignore SSL certificate errors
});

// Configure axios defaults
axios.defaults.httpsAgent = httpsAgent;
axios.defaults.timeout = 30000;

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// Logging middleware
app.use(morgan('combined'));

// CORS configuration - Allow all origins in development
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g., mobile apps, curl)
    if (!origin) return callback(null, true);
    
    // Allow all origins in development
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'MQA Backend',
    version: '1.0.0'
  });
});

// URL validation endpoint
app.post('/api/validate-url', async (req, res) => {
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
        validateStatus: function (status) {
          // Accept any status code
          return true;
        },
        // Handle SSL certificate issues
        httpsAgent: new (require('https')).Agent({
          rejectUnauthorized: false // Allow self-signed certificates
        })
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
      
      res.json({
        accessible: false,
        error: error.message,
        status: error.response?.status
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
app.post('/api/download-data', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        error: 'URL is required' 
      });
    }

    console.log(`Downloading data from: ${url}`);

    // Download data
    try {
      const response = await axios.get(url, {
        timeout: 30000, // 30 seconds timeout for data download
        maxRedirects: 5,
        responseType: 'text',
        maxContentLength: 50 * 1024 * 1024, // 50MB limit
        headers: {
          'User-Agent': 'MQA-Backend/1.0.0 (Data Quality Analysis)',
          'Accept': 'text/csv, application/json, text/plain, */*'
        },
        // Handle SSL certificate issues
        httpsAgent: new (require('https')).Agent({
          rejectUnauthorized: false // Allow self-signed certificates
        }),
        // Additional axios config for problematic URLs
        validateStatus: function (status) {
          return status >= 200 && status < 300; // default
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
      
      res.status(500).json({
        error: `Failed to download data: ${error.message}`,
        status: error.response?.status
      });
    }
  } catch (error) {
    console.error('Data download error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

// Default error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MQA Backend server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📊 Endpoints available:`);
  console.log(`   POST /api/validate-url`);
  console.log(`   POST /api/download-data`);
  console.log(`   GET  /api/health`);
  console.log(`🌍 CORS enabled for all origins (development mode)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});