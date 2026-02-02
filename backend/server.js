const express = require('express');
const cors = require('cors');
const axios = require('axios');
const helmet = require('helmet');
const morgan = require('morgan');
const https = require('https');

// API Routes for MQA
let apiRoutes;
try {
  apiRoutes = require('./api/routes');
  console.log('✅ MQA API routes loaded');
} catch (error) {
  console.warn('⚠️ MQA API routes not available:', error.message);
  apiRoutes = null;
}

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
    sslValidation: REJECT_UNAUTHORIZED ? 'enabled' : 'disabled',
    mqaApiEnabled: apiRoutes !== null
  });
});

// Mount MQA API routes
if (apiRoutes) {
  app.use('/api/v1', apiRoutes);
  console.log('📊 MQA API v1 mounted at /api/v1');
}

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
      headers: {
        'Accept': 'text/turtle, application/rdf+xml, text/n3, application/n-triples, application/ld+json, text/csv, application/json, text/plain, */*'
      },
      httpsAgent: createHttpsAgent()
    });

    const accessible = response.status >= 200 && response.status < 400;
    const contentType = response.headers['content-type'] || '';
    
    // Extract charset from content-type
    let charset = 'utf-8';
    const charsetMatch = contentType.match(/charset=([^;]+)/i);
    if (charsetMatch) {
      charset = charsetMatch[1].toLowerCase();
    }
    
    return {
      accessible,
      status: response.status,
      headers: {
        'content-type': contentType,
        'content-length': response.headers['content-length']
      },
      charset: charset,
      detectedFormat: detectRDFFormat('', contentType, url)
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
        headers: {
          'Accept': 'text/turtle, application/rdf+xml, text/n3, application/n-triples, application/ld+json, text/csv, application/json, text/plain, */*'
        },
        httpsAgent: createHttpsAgent()
      });

      const accessible = response.status >= 200 && response.status < 400;
      const contentType = response.headers['content-type'] || '';
      
      // Extract charset from content-type
      let charset = 'utf-8';
      const charsetMatch = contentType.match(/charset=([^;]+)/i);
      if (charsetMatch) {
        charset = charsetMatch[1].toLowerCase();
      }
      
      // Detect potential RDF format from content-type and URL
      const detectedFormat = detectRDFFormat('', contentType, url);
      
      const result = {
        accessible,
        status: response.status,
        headers: {
          'content-type': contentType,
          'content-length': response.headers['content-length'],
          'content-encoding': response.headers['content-encoding']
        },
        charset: charset,
        detectedFormat: detectedFormat
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

    // Download data with proper encoding handling
    try {
      const response = await axios.get(url, {
        timeout: 30000, // 30 seconds timeout for data download
        maxRedirects: 5,
        responseType: 'arraybuffer', // Get binary data to handle encoding properly
        maxContentLength: 50 * 1024 * 1024, // 50MB limit
        headers: {
          'User-Agent': 'MQA-Backend/1.0.0 (Data Quality Analysis)',
          'Accept': 'text/turtle, application/rdf+xml, text/n3, application/n-triples, application/ld+json, text/csv, application/json, text/plain, */*',
          'Accept-Charset': 'utf-8, iso-8859-1'
        },
        httpsAgent: createHttpsAgent(),
        validateStatus: (status) => status >= 200 && status < 300
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle encoding properly
      let textData;
      const contentType = response.headers['content-type'] || '';
      const contentEncoding = response.headers['content-encoding'];
      
      // Extract charset from content-type header
      let charset = 'utf-8';
      const charsetMatch = contentType.match(/charset=([^;]+)/i);
      if (charsetMatch) {
        charset = charsetMatch[1].toLowerCase();
      }
      
      console.log(`Content-Type: ${contentType}, Charset: ${charset}, Encoding: ${contentEncoding || 'none'}`);
      
      // Convert binary data to text with proper encoding
      try {
        if (charset === 'utf-8' || charset === 'utf8') {
          textData = Buffer.from(response.data).toString('utf8');
        } else if (charset === 'iso-8859-1' || charset === 'latin1') {
          textData = Buffer.from(response.data).toString('latin1');
        } else if (charset === 'ascii') {
          textData = Buffer.from(response.data).toString('ascii');
        } else {
          // Try UTF-8 as fallback and detect if there are encoding issues
          textData = Buffer.from(response.data).toString('utf8');
          
          // Check for common encoding issues (BOM, invalid UTF-8)
          if (textData.startsWith('\uFEFF')) {
            textData = textData.substring(1); // Remove BOM
            console.log('Removed UTF-8 BOM from content');
          }
          
          // Check for likely encoding corruption
          if (textData.includes('�')) {
            console.warn('Detected encoding corruption, trying latin1');
            textData = Buffer.from(response.data).toString('latin1');
          }
        }
      } catch (encodingError) {
        console.error('Encoding error, falling back to binary-safe conversion:', encodingError.message);
        textData = Buffer.from(response.data).toString('binary');
      }
      
      // Detect and normalize RDF format
      const detectedFormat = detectRDFFormat(textData, contentType, url);
      
      // Basic content validation for RDF
      if (detectedFormat && !isValidRDFContent(textData, detectedFormat)) {
        console.warn(`Content validation failed for detected format: ${detectedFormat}`);
      }

      res.json({
        data: textData,
        contentType: contentType,
        detectedFormat: detectedFormat,
        charset: charset,
        size: textData.length,
        originalSize: response.data.length
      });
    } catch (error) {
      const sanitizedUrl = sanitizeForLog(url);
      const sanitizedError = sanitizeForLog(error.message);
      console.error(`Data download failed for ${sanitizedUrl}: ${sanitizedError}`);
      
      res.status(500).json({
        error: 'Failed to download data',
        status: error.response?.status,
        details: error.code || error.message
      });
    }
  } catch (error) {
    console.error('Data download error:', sanitizeForLog(error.message));
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

/**
 * Detect RDF format from content, content-type, and URL
 */
function detectRDFFormat(content, contentType, url) {
  const lowerContentType = (contentType || '').toLowerCase();
  const lowerUrl = url.toLowerCase();
  
  // Check content-type first
  if (lowerContentType.includes('turtle') || lowerContentType.includes('text/turtle')) {
    return 'turtle';
  }
  if (lowerContentType.includes('rdf+xml') || lowerContentType.includes('application/rdf+xml')) {
    return 'rdf-xml';
  }
  if (lowerContentType.includes('n-triples') || lowerContentType.includes('application/n-triples')) {
    return 'n-triples';
  }
  if (lowerContentType.includes('ld+json') || lowerContentType.includes('application/ld+json')) {
    return 'json-ld';
  }
  if (lowerContentType.includes('n3') || lowerContentType.includes('text/n3')) {
    return 'n3';
  }
  
  // Check URL extension
  if (lowerUrl.endsWith('.ttl') || lowerUrl.endsWith('.turtle')) {
    return 'turtle';
  }
  if (lowerUrl.endsWith('.rdf') || lowerUrl.endsWith('.xml')) {
    return 'rdf-xml';
  }
  if (lowerUrl.endsWith('.nt')) {
    return 'n-triples';
  }
  if (lowerUrl.endsWith('.jsonld') || lowerUrl.endsWith('.json-ld')) {
    return 'json-ld';
  }
  if (lowerUrl.endsWith('.n3')) {
    return 'n3';
  }
  
  // Content analysis (first few lines)
  const firstLines = content.substring(0, 1000).trim();
  
  if (firstLines.startsWith('<?xml') && firstLines.includes('rdf')) {
    return 'rdf-xml';
  }
  if (firstLines.startsWith('@prefix') || firstLines.includes(' a ') || firstLines.includes(' . ')) {
    return 'turtle';
  }
  if (firstLines.startsWith('<') && firstLines.includes('> <') && firstLines.includes('> .')) {
    return 'n-triples';
  }
  if (firstLines.startsWith('{') && firstLines.includes('@context')) {
    return 'json-ld';
  }
  
  return null;
}

/**
 * Basic validation for RDF content
 */
function isValidRDFContent(content, format) {
  try {
    const sample = content.substring(0, 2000);
    
    switch (format) {
      case 'turtle':
      case 'n3':
        // Should contain prefixes or triples
        return /@prefix|@base|<[^>]+>\s+<[^>]+>\s+[^.]+\./.test(sample);
        
      case 'rdf-xml':
        // Should be valid XML with RDF elements
        return /^<\?xml|<rdf:|<RDF/.test(sample);
        
      case 'n-triples':
        // Should contain N-Triples pattern
        return /<[^>]+>\s+<[^>]+>\s+[^.]+\s*\./.test(sample);
        
      case 'json-ld':
        // Should be valid JSON
        try {
          JSON.parse(sample.substring(0, sample.lastIndexOf('}') + 1));
          return true;
        } catch {
          return false;
        }
        
      default:
        return true; // Unknown format, assume valid
    }
  } catch (error) {
    console.warn('RDF validation error:', error.message);
    return true; // Assume valid if validation fails
  }
}

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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MQA Backend server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📊 Core Endpoints available:`);
  console.log(`   POST /api/validate-url`);
  console.log(`   POST /api/validate-urls-batch`);
  console.log(`   POST /api/download-data`);
  console.log(`   GET  /api/health`);
  
  if (apiRoutes) {
    console.log(`📈 MQA API v1 Endpoints available:`);
    console.log(`   GET  /api/v1/info             - API information`);
    console.log(`   GET  /api/v1/profiles         - Available profiles`);
    console.log(`   POST /api/v1/quality          - Quality assessment (JSON/JSON-LD/DQV)`);
    console.log(`   POST /api/v1/shacl            - SHACL validation (JSON/Turtle/CSV)`);
    console.log(`   POST /api/v1/validate         - Combined quality + SHACL`);
    console.log(`   POST /api/v1/syntax           - RDF syntax validation`);
  }
  
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