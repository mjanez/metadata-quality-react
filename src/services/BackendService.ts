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
    url: 'http://localhost:3001',
    endpoints: {
      validate_url: '/api/validate-url',
      download_data: '/api/download-data',
      health: '/api/health'
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

  constructor() {
    // Load configuration dynamically
    this.loadConfig();
  }

  private async loadConfig() {
    try {
      const configModule = await import('../config/mqa-config.json');
      const config = configModule.default || configModule;
      
      this.backendConfig = (config as any).backend_server || {
        enabled: false,
        url: 'http://localhost:3001',
        endpoints: {
          validate_url: '/api/validate-url',
          download_data: '/api/download-data',
          health: '/api/health'
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
      // Use default configuration
      this.backendConfig = {
        enabled: false,
        url: 'http://localhost:3001',
        endpoints: {
          validate_url: '/api/validate-url',
          download_data: '/api/download-data',
          health: '/api/health'
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
   * Check if backend server is enabled and available
   */
  async isBackendAvailable(): Promise<boolean> {
    if (!this.backendConfig.enabled) {
      return false;
    }

    try {
      const response = await fetch(`${this.backendConfig.url}${this.backendConfig.endpoints.health}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch (error) {
      console.warn('Backend server not available:', error);
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
   * Validate URL accessibility with backend or heuristics
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
      const response = await fetch(`${this.backendConfig.url}${this.backendConfig.endpoints.validate_url}`, {
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
      const response = await fetch(`${this.backendConfig.url}${this.backendConfig.endpoints.download_data}`, {
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