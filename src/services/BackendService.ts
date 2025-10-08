/**
 * Service for managing backend server configuration and CORS handling
 */

export interface BackendConfig {
  enabled: boolean;
  url: string;
  endpoints: {
    validate_url: string;
    download_data: string;
    health: string;
  };
  cors_proxy: {
    fallback_proxies: string[];
    enable_heuristics: boolean;
  };
}

export interface DataQualityConfig {
  enabled: boolean;
  require_backend: boolean;
  iso_25012_metrics: Record<string, { weight: number; enabled: boolean }>;
}

class BackendService {
  private backendConfig: BackendConfig = {
    enabled: false,
    url: process.env.REACT_APP_BACKEND_URL || '/api',
    endpoints: {
      validate_url: '/validate-url',
      download_data: '/download-data',
      health: '/health'
    },
    cors_proxy: {
      fallback_proxies: [
        "https://corsproxy.io/?url=",
        "https://api.allorigins.win/get?url=",
        "https://cors-anywhere.herokuapp.com/",
        "https://thingproxy.freeboard.io/fetch/"
      ],
      enable_heuristics: true
    }
  };

  private dataQualityConfig: DataQualityConfig = {
    enabled: true,
    require_backend: true,
    iso_25012_metrics: {}
  };

  // Client-side cache for health checks and URL validations
  private healthCheckCache: { available: boolean; timestamp: number } | null = null;
  private readonly HEALTH_CHECK_TTL = 30000; // 30 seconds

  constructor() {
    // Load configuration dynamically
    this.loadConfig();
  }

  private async loadConfig() {
    try {
      const configModule = await import('../config/mqa-config.json');
      const config = configModule.default || configModule;
      
      // Get backend URL from config or environment variable
      const configBackend = (config as any).backend_server || {};
      const backendUrl = configBackend.url || process.env.REACT_APP_BACKEND_URL || '/api';
      
      this.backendConfig = {
        enabled: configBackend.enabled !== false,
        url: backendUrl,
        endpoints: {
          validate_url: '/validate-url',
          download_data: '/download-data',
          health: '/health'
        },
        cors_proxy: {
          fallback_proxies: [
            'https://cors-anywhere.herokuapp.com/',
            'https://api.allorigins.win/get?url=',
            'https://thingproxy.freeboard.io/fetch/'
          ],
          enable_heuristics: true
        }
      };

      this.dataQualityConfig = (config as any).data_quality || {
        enabled: true,
        require_backend: true,
        iso_25012_metrics: {}
      };
    } catch (error) {
      console.warn('Failed to load backend configuration:', error);
      // Use default configuration from environment variable
      this.backendConfig = {
        enabled: false,
        url: process.env.REACT_APP_BACKEND_URL || '/api',
        endpoints: {
          validate_url: '/validate-url',
          download_data: '/download-data',
          health: '/health'
        },
        cors_proxy: {
          fallback_proxies: [
            'https://cors-anywhere.herokuapp.com/',
            'https://api.allorigins.win/get?url=',
            'https://thingproxy.freeboard.io/fetch/'
          ],
          enable_heuristics: true
        }
      };

      this.dataQualityConfig = {
        enabled: true,
        require_backend: true,
        iso_25012_metrics: {}
      };
    }
  }

  /**
   * Check if backend server is enabled and available (with caching)
   */
  async isBackendAvailable(): Promise<boolean> {
    if (!this.backendConfig.enabled) {
      return false;
    }

    // Check cache first
    const now = Date.now();
    if (this.healthCheckCache && (now - this.healthCheckCache.timestamp) < this.HEALTH_CHECK_TTL) {
      return this.healthCheckCache.available;
    }

    try {
      const healthUrl = `${this.backendConfig.url}${this.backendConfig.endpoints.health}`;
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const available = response.ok;
      
      // Update cache
      this.healthCheckCache = {
        available,
        timestamp: now
      };
      
      return available;
    } catch (error) {
      console.warn('Backend server not available:', error);
      
      // Cache the negative result too
      this.healthCheckCache = {
        available: false,
        timestamp: now
      };
      
      return false;
    }
  }

  /**
   * Check if data quality features should be enabled
   */
  async shouldEnableDataQuality(): Promise<boolean> {
    if (!this.dataQualityConfig.enabled) {
      return false;
    }

    if (this.dataQualityConfig.require_backend) {
      return await this.isBackendAvailable();
    }

    return true;
  }

  /**
   * Validate multiple URLs in batch (more efficient)
   */
  async validateURLAccessibilityBatch(urls: string[]): Promise<Record<string, { accessible: boolean; status?: number; error?: string }>> {
    if (!urls || urls.length === 0) {
      return {};
    }

    const backendAvailable = await this.isBackendAvailable();
    
    if (backendAvailable) {
      return this.validateURLsBatchWithBackend(urls);
    } else if (this.backendConfig.cors_proxy.enable_heuristics) {
      // Fallback to heuristics for all URLs
      const results: Record<string, { accessible: boolean; status?: number; error?: string }> = {};
      for (const url of urls) {
        results[url] = this.validateURLWithHeuristics(url);
      }
      return results;
    } else {
      const results: Record<string, { accessible: boolean; status?: number; error?: string }> = {};
      for (const url of urls) {
        results[url] = { accessible: false, error: 'URL validation service not available' };
      }
      return results;
    }
  }

  /**
   * Validate URLs in batch using backend server
   */
  private async validateURLsBatchWithBackend(urls: string[]): Promise<Record<string, { accessible: boolean; status?: number; error?: string }>> {
    try {
      const batchUrl = `${this.backendConfig.url}/validate-urls-batch`;
      const response = await fetch(batchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ urls }),
      });

      if (!response.ok) {
        throw new Error(`Batch validation failed: HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.results || {};
    } catch (error) {
      console.error('Backend batch URL validation failed:', error);
      
      // Fallback to individual validations
      const results: Record<string, { accessible: boolean; status?: number; error?: string }> = {};
      for (const url of urls) {
        results[url] = { accessible: false, error: `Batch validation failed: ${error}` };
      }
      return results;
    }
  }

  /**
   * Validate URL accessibility with backend or heuristics (single URL)
   */
  async validateURLAccessibility(url: string): Promise<{ accessible: boolean; status?: number; error?: string }> {
    const backendAvailable = await this.isBackendAvailable();
    
    if (backendAvailable) {
      return this.validateURLWithBackend(url);
    } else if (this.backendConfig.cors_proxy.enable_heuristics) {
      return this.validateURLWithHeuristics(url);
    } else {
      return { accessible: false, error: 'URL validation service not available' };
    }
  }

  /**
   * Validate URL using backend server
   */
  private async validateURLWithBackend(url: string): Promise<{ accessible: boolean; status?: number; error?: string }> {
    try {
      const validateUrl = `${this.backendConfig.url}${this.backendConfig.endpoints.validate_url}`;
      const response = await fetch(validateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Backend URL validation failed:', error);
      return { accessible: false, error: `Backend validation failed: ${error}` };
    }
  }

  /**
   * Validate URL using heuristics (for GitHub Pages)
   */
  private validateURLWithHeuristics(url: string): { accessible: boolean; status?: number; error?: string } {
    try {
      // Basic URL validation
      const urlObj = new URL(url);
      
      // Check for common valid protocols
      if (!['http:', 'https:', 'ftp:'].includes(urlObj.protocol)) {
        return { accessible: false, error: 'Invalid protocol' };
      }

      // Check for localhost or private IPs (likely not accessible from GitHub Pages)
      if (urlObj.hostname === 'localhost' || 
          urlObj.hostname.startsWith('127.') || 
          urlObj.hostname.startsWith('192.168.') || 
          urlObj.hostname.startsWith('10.') ||
          urlObj.hostname.startsWith('172.')) {
        return { accessible: false, error: 'Local or private network URL' };
      }

      // Check for common file extensions that are likely accessible
      const path = urlObj.pathname.toLowerCase();
      const dataExtensions = ['.csv', '.json', '.xml', '.xlsx', '.pdf', '.zip', '.txt'];
      const hasDataExtension = dataExtensions.some(ext => path.endsWith(ext));

      if (hasDataExtension) {
        return { accessible: true, status: 200 };
      }

      // For other URLs, assume accessible (heuristic)
      return { accessible: true, status: 200 };
    } catch (error) {
      return { accessible: false, error: `Invalid URL: ${error}` };
    }
  }

  /**
   * Download data with backend or CORS proxy fallback
   */
  async downloadData(url: string): Promise<string> {
    const backendAvailable = await this.isBackendAvailable();
    
    if (backendAvailable) {
      return this.downloadDataWithBackend(url);
    } else {
      return this.downloadDataWithProxy(url);
    }
  }

  /**
   * Download data using backend server
   */
  private async downloadDataWithBackend(url: string): Promise<string> {
    try {
      const downloadUrl = `${this.backendConfig.url}${this.backendConfig.endpoints.download_data}`;
      const response = await fetch(downloadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Backend HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      if (!result.data) {
        throw new Error('Backend returned no data');
      }
      
      return result.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Backend data download failed:', errorMessage);
      
      // If it's an SSL certificate error, provide specific guidance
      if (errorMessage.includes('certificate') || errorMessage.includes('SSL') || errorMessage.includes('TLS')) {
        throw new Error(`SSL Certificate error - URL may have invalid/self-signed certificate: ${errorMessage}`);
      }
      
      throw new Error(`Backend download failed: ${errorMessage}`);
    }
  }

  /**
   * Download data using CORS proxy fallback
   */
  private async downloadDataWithProxy(url: string): Promise<string> {
    const proxies = this.backendConfig.cors_proxy.fallback_proxies;
    
    for (const proxy of proxies) {
      try {
        let proxyUrl: string;
        
        if (proxy.includes('allorigins')) {
          proxyUrl = `${proxy}${encodeURIComponent(url)}`;
        } else {
          proxyUrl = `${proxy}${url}`;
        }

        const response = await fetch(proxyUrl);
        
        if (response.ok) {
          let data = await response.text();
          
          // Handle allorigins response format
          if (proxy.includes('allorigins')) {
            try {
              const jsonResponse = JSON.parse(data);
              data = jsonResponse.contents;
            } catch (e) {
              // If not JSON, use as is
            }
          }
          
          return data;
        }
      } catch (error) {
        console.warn(`Proxy ${proxy} failed:`, error);
        continue;
      }
    }
    
    throw new Error('All CORS proxies failed');
  }

  /**
   * Get backend configuration
   */
  getBackendConfig(): BackendConfig {
    return this.backendConfig;
  }

  /**
   * Get data quality configuration
   */
  getDataQualityConfig(): DataQualityConfig {
    return this.dataQualityConfig;
  }

  /**
   * Check if we're running in development mode
   */
  isDevelopmentMode(): boolean {
    return process.env.NODE_ENV === 'development' || 
           window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1';
  }

  /**
   * Check if we're running on GitHub Pages
   */
  isGitHubPages(): boolean {
    return window.location.hostname.endsWith('.github.io') ||
           window.location.hostname.endsWith('.github.com');
  }
}

export const backendService = new BackendService();