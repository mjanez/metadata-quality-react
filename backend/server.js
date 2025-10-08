const express = require('express');
const cors = require('cors');
const axios = require('axios');
const helmet = require('helmet');
const morgan = require('morgan');
const https = require('https');

// SSL certificate validation configuration
// Set NODE_TLS_REJECT_UNAUTHORIZED=0 in development if you need to disable SSL validation
// WARNING: Never disable in production!
const REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0';

if (!REJECT_UNAUTHORIZED) {
  console.warn('⚠️  WARNING: SSL certificate validation is DISABLED. This should only be used in development!');
}

// Configure axios defaults
axios.defaults.timeout = 30000;

const app = express();
const PORT = process.env.PORT || 3001;

// Allowed domains for SSRF protection (whitelist)
// Empty array means all domains are allowed (use with caution)
const ALLOWED_DOMAINS = process.env.ALLOWED_DOMAINS 
  ? process.env.ALLOWED_DOMAINS.split(',').map(d => d.trim())
  : []; // Empty = allow all (configure in production!)

const BLOCKED_PRIVATE_IPS = [
  /^127\./,           // localhost
  /^10\./,            // Private network
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // Private network
  /^192\.168\./,      // Private network
  /^169\.254\./,      // Link-local
  /^::1$/,            // IPv6 localhost
  /^fc00:/,           // IPv6 private
  /^fe80:/            // IPv6 link-local
];

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

/**
 * Validate URL to prevent SSRF attacks
 * @param {string} urlString - URL to validate
 * @returns {Object} - { valid: boolean, error?: string, url?: URL }
 */
function validateUrlForSSRF(urlString) {
  try {
    const url = new URL(urlString);
    
    // Only allow HTTP and HTTPS protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }
    
    // Check if domain is in whitelist (if configured)
    if (ALLOWED_DOMAINS.length > 0) {
      const isAllowed = ALLOWED_DOMAINS.some(domain => 
        url.hostname === domain || url.hostname.endsWith(`.${domain}`)
      );
      if (!isAllowed) {
        return { valid: false, error: 'Domain not in whitelist' };
      }
    }
    
    // Block private/internal IPs
    const hostname = url.hostname;
    for (const pattern of BLOCKED_PRIVATE_IPS) {
      if (pattern.test(hostname)) {
        return { valid: false, error: 'Access to private/internal IPs is not allowed' };
      }
    }
    
    // Block localhost aliases
    if (['localhost', '0.0.0.0'].includes(hostname.toLowerCase())) {
      return { valid: false, error: 'Access to localhost is not allowed' };
    }
    
    return { valid: true, url };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Sanitize string for logging to prevent injection
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeForLog(str) {
  if (typeof str !== 'string') return String(str);
  // Remove control characters and limit length
  return str.replace(/[\x00-\x1F\x7F-\x9F]/g, '').substring(0, 200);
}

/**
 * Create HTTPS agent with proper SSL configuration
 */
function createHttpsAgent() {
  return new https.Agent({
    rejectUnauthorized: REJECT_UNAUTHORIZED
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'MQA Backend',
    version: '1.0.0',
    sslValidation: REJECT_UNAUTHORIZED ? 'enabled' : 'disabled'
  });
});

// URL validation cache (in-memory)
const urlValidationCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Batch URL validation endpoint
app.post('/api/validate-urls-batch', async (req, res) => {
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ 
        error: 'URLs array is required' 
      });
    }

    console.log(`Batch validating ${urls.length} URLs`);

    const results = {};
    const uncachedUrls = [];
    
    // Check cache first
    const now = Date.now();
    for (const url of urls) {
      const cached = urlValidationCache.get(url);
      if (cached && (now - cached.timestamp) < CACHE_TTL) {
        results[url] = cached.result;
        console.log(`✓ Cache hit for ${url}`);
      } else {
        uncachedUrls.push(url);
      }
    }

    // Validate uncached URLs in parallel (batch of 10 at a time)
    const BATCH_SIZE = 10;
    for (let i = 0; i < uncachedUrls.length; i += BATCH_SIZE) {
      const batch = uncachedUrls.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(url => validateSingleURL(url));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        const url = batch[index];
        if (result.status === 'fulfilled') {
          results[url] = result.value;
          // Cache the result
          urlValidationCache.set(url, {
            result: result.value,
            timestamp: Date.now()
          });
        } else {
          results[url] = {
            accessible: false,
            error: result.reason?.message || 'Validation failed'
          };
        }
      });
    }

    res.json({ results });
  } catch (error) {
    console.error('Batch URL validation error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

// Helper function to validate a single URL
async function validateSingleURL(url) {
  // Validate URL for SSRF protection
  const validation = validateUrlForSSRF(url);
  if (!validation.valid) {
    return {
      accessible: false,
      error: validation.error,
      blocked: true
    };
  }
  
  try {
    const response = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: () => true,
      httpsAgent: createHttpsAgent()
    });

    const accessible = response.status >= 200 && response.status < 400;
    return {
      accessible,
      status: response.status,
      headers: {
        'content-type': response.headers['content-type'],
        'content-length': response.headers['content-length']
      }
    };
  } catch (error) {
    return {
      accessible: false,
      error: error.message,
      status: error.response?.status
    };
  }
}

// URL validation endpoint (single URL - kept for backwards compatibility)
app.post('/api/validate-url', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ 
        accessible: false, 
        error: 'Valid URL string is required' 
      });
    }

    // Validate URL for SSRF protection
    const validation = validateUrlForSSRF(url);
    if (!validation.valid) {
      console.warn(`⛔ Blocked URL validation attempt: ${sanitizeForLog(url)} - Reason: ${validation.error}`);
      return res.status(403).json({
        accessible: false,
        error: validation.error,
        blocked: true
      });
    }

    // Check cache first
    const cached = urlValidationCache.get(url);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      console.log(`✓ Cache hit for ${sanitizeForLog(url)}`);
      return res.json(cached.result);
    }

    console.log(`Validating URL: ${sanitizeForLog(url)}`);

    // Check URL accessibility
    try {
      const response = await axios.head(url, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: () => true,
        httpsAgent: createHttpsAgent()
      });

      const accessible = response.status >= 200 && response.status < 400;
      
      const result = {
        accessible,
        status: response.status,
        headers: {
          'content-type': response.headers['content-type'],
          'content-length': response.headers['content-length']
        }
      };
      
      // Cache the result
      urlValidationCache.set(url, {
        result,
        timestamp: Date.now()
      });
      
      res.json(result);
    } catch (error) {
      const sanitizedUrl = sanitizeForLog(url);
      const sanitizedError = sanitizeForLog(error.message);
      console.error(`URL validation failed for ${sanitizedUrl}: ${sanitizedError}`);
      
      res.json({
        accessible: false,
        error: 'URL validation failed',
        status: error.response?.status
      });
    }
  } catch (error) {
    console.error('URL validation error:', sanitizeForLog(error.message));
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
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ 
        error: 'Valid URL string is required' 
      });
    }

    // Validate URL for SSRF protection
    const validation = validateUrlForSSRF(url);
    if (!validation.valid) {
      console.warn(`⛔ Blocked download attempt: ${sanitizeForLog(url)} - Reason: ${validation.error}`);
      return res.status(403).json({
        error: validation.error,
        blocked: true
      });
    }

    console.log(`Downloading data from: ${sanitizeForLog(url)}`);

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
        httpsAgent: createHttpsAgent(),
        validateStatus: (status) => status >= 200 && status < 300
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
      const sanitizedUrl = sanitizeForLog(url);
      const sanitizedError = sanitizeForLog(error.message);
      console.error(`Data download failed for ${sanitizedUrl}: ${sanitizedError}`);
      
      res.status(500).json({
        error: 'Failed to download data',
        status: error.response?.status
      });
    }
  } catch (error) {
    console.error('Data download error:', sanitizeForLog(error.message));
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

// Cleanup old cache entries periodically
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [url, data] of urlValidationCache.entries()) {
    if (now - data.timestamp > CACHE_TTL) {
      urlValidationCache.delete(url);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired cache entries. Cache size: ${urlValidationCache.size}`);
  }
}, CACHE_TTL); // Run every 5 minutes

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MQA Backend server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📊 Endpoints available:`);
  console.log(`   POST /api/validate-url`);
  console.log(`   POST /api/validate-urls-batch`);
  console.log(`   POST /api/download-data`);
  console.log(`   GET  /api/health`);
  console.log(`🌍 CORS enabled for all origins (development mode)`);
  console.log(`💾 URL validation cache enabled (TTL: ${CACHE_TTL / 1000}s)`);
  console.log(`🔒 Security settings:`);
  console.log(`   SSL validation: ${REJECT_UNAUTHORIZED ? '✅ ENABLED' : '⚠️  DISABLED (dev only!)'}`);
  console.log(`   SSRF protection: ✅ ENABLED`);
  console.log(`   Domain whitelist: ${ALLOWED_DOMAINS.length > 0 ? ALLOWED_DOMAINS.join(', ') : '⚠️  Not configured (all domains allowed)'}`);
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