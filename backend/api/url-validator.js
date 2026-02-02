/**
 * URL Validation Utilities
 * 
 * Shared URL validation logic for the MQA backend.
 * Used by both server.js and quality-service.js
 * 
 * Based on MQA methodology:
 * - HTTP HEAD request
 * - Status code 200-399 = accessible
 */

const axios = require('axios');
const https = require('https');

// SSL certificate validation configuration
const REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0';

// Allowed domains for SSRF protection (whitelist)
const ALLOWED_DOMAINS = process.env.ALLOWED_DOMAINS 
  ? process.env.ALLOWED_DOMAINS.split(',').map(d => d.trim())
  : []; // Empty = allow all

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

// URL validation cache (in-memory, clears on restart)
const urlCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Configuration for URL checking
const URL_CHECK_CONFIG = {
  timeout: 3000,         // 3 seconds (faster)
  maxConcurrent: 20,     // 20 parallel requests
  maxSampleSize: 100,    // Max URLs to check (sampling for large datasets)
  minSampleSize: 10,     // Minimum sample size
  sampleThreshold: 50    // Start sampling above this count
};

/**
 * Create HTTPS agent with configurable SSL validation
 */
function createHttpsAgent() {
  return new https.Agent({
    rejectUnauthorized: REJECT_UNAUTHORIZED
  });
}

/**
 * Validate URL to prevent SSRF attacks
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
        return { valid: false, error: 'Private/internal IPs are not allowed' };
      }
    }
    
    // Block localhost variations
    if (['localhost', 'localhost.localdomain', '0.0.0.0'].includes(hostname.toLowerCase())) {
      return { valid: false, error: 'Localhost addresses are not allowed' };
    }
    
    return { valid: true, url };
  } catch (error) {
    return { valid: false, error: `Invalid URL: ${error.message}` };
  }
}

/**
 * Check if a URL is accessible (HTTP HEAD, status 200-399)
 * Based on MQA methodology - only HEAD request, no fallback
 * Uses cache to avoid re-checking same URLs
 */
async function checkURLAccessible(url, timeout = URL_CHECK_CONFIG.timeout) {
  // Check cache first
  const cached = urlCache.get(url);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.accessible;
  }
  
  // Validate URL for SSRF
  const validation = validateUrlForSSRF(url);
  if (!validation.valid) {
    urlCache.set(url, { accessible: false, timestamp: Date.now() });
    return false;
  }
  
  try {
    const response = await axios.head(url, {
      timeout: timeout,
      maxRedirects: 5,
      validateStatus: () => true, // Accept any status for inspection
      headers: {
        'User-Agent': 'MQA-Validator/1.0',
        'Accept': '*/*'
      },
      httpsAgent: createHttpsAgent()
    });
    
    // MQA: Status 200-399 = accessible
    const accessible = response.status >= 200 && response.status < 400;
    
    // Cache result
    urlCache.set(url, { accessible, timestamp: Date.now() });
    
    return accessible;
  } catch (error) {
    // Network error, timeout, etc. = not accessible
    urlCache.set(url, { accessible: false, timestamp: Date.now() });
    return false;
  }
}

/**
 * Calculate dynamic sample size for URL checking
 * Larger datasets get proportionally smaller samples
 */
function calculateSampleSize(totalUrls) {
  if (totalUrls <= URL_CHECK_CONFIG.sampleThreshold) {
    return totalUrls; // Check all if under threshold
  }
  
  // Logarithmic scaling: more URLs = proportionally smaller sample
  const logScale = Math.log10(totalUrls);
  const sampleSize = Math.min(
    URL_CHECK_CONFIG.maxSampleSize,
    Math.max(
      URL_CHECK_CONFIG.minSampleSize,
      Math.floor(totalUrls / logScale)
    )
  );
  
  return sampleSize;
}

/**
 * Check multiple URLs for accessibility (optimized)
 * - Uses caching
 * - Sampling for large datasets
 * - High concurrency
 * Returns proportional score based on sample
 */
async function checkURLsAccessibility(urls, maxConcurrent = URL_CHECK_CONFIG.maxConcurrent, timeout = URL_CHECK_CONFIG.timeout) {
  const startTime = Date.now();
  console.log(`🌐 checkURLsAccessibility: ${urls?.length || 0} URLs`);
  
  if (!urls || urls.length === 0) {
    return { accessible: 0, total: 0, rate: 0, sampled: false };
  }
  
  // Deduplicate URLs
  const uniqueUrls = [...new Set(urls)];
  console.log(`   Unique URLs: ${uniqueUrls.length}/${urls.length}`);
  
  // Filter valid URLs (SSRF protection)
  const validUrls = uniqueUrls.filter(url => {
    if (!url || typeof url !== 'string') return false;
    if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
    return validateUrlForSSRF(url).valid;
  });
  
  if (validUrls.length === 0) {
    console.log('   ⛔ All URLs filtered out by SSRF protection');
    return { accessible: 0, total: urls.length, rate: 0, sampled: false };
  }
  
  // Calculate sample size
  const sampleSize = calculateSampleSize(validUrls.length);
  const sampled = sampleSize < validUrls.length;
  
  // Sample URLs if needed (random selection)
  let urlsToCheck = validUrls;
  if (sampled) {
    const shuffled = [...validUrls].sort(() => 0.5 - Math.random());
    urlsToCheck = shuffled.slice(0, sampleSize);
    console.log(`   📊 Sampling: ${sampleSize}/${validUrls.length} URLs`);
  }
  
  let accessibleCount = 0;
  
  // Process in batches with high concurrency
  for (let i = 0; i < urlsToCheck.length; i += maxConcurrent) {
    const batch = urlsToCheck.slice(i, i + maxConcurrent);
    const results = await Promise.all(
      batch.map(url => checkURLAccessible(url, timeout))
    );
    accessibleCount += results.filter(r => r).length;
  }
  
  // Calculate rate based on sample
  const sampleRate = urlsToCheck.length > 0 ? accessibleCount / urlsToCheck.length : 0;
  
  // Extrapolate to total if sampled
  const estimatedAccessible = sampled 
    ? Math.round(sampleRate * validUrls.length)
    : accessibleCount;
  
  const elapsed = Date.now() - startTime;
  console.log(`   ✅ Result: ${accessibleCount}/${urlsToCheck.length} accessible (${(sampleRate * 100).toFixed(1)}%) in ${elapsed}ms`);
  if (sampled) {
    console.log(`   📈 Extrapolated: ~${estimatedAccessible}/${validUrls.length} total`);
  }
  
  return {
    accessible: estimatedAccessible,
    total: urls.length,
    rate: sampleRate,
    sampled,
    sampleSize: urlsToCheck.length,
    elapsed
  };
}

/**
 * Clear URL cache
 */
function clearURLCache() {
  urlCache.clear();
  console.log('✅ URL validation cache cleared');
}

module.exports = {
  validateUrlForSSRF,
  createHttpsAgent,
  checkURLAccessible,
  checkURLsAccessibility,
  clearURLCache,
  URL_CHECK_CONFIG,
  REJECT_UNAUTHORIZED,
  ALLOWED_DOMAINS
};
