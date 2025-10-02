import { CatalogDataset, CatalogDistribution } from '../types/dataQuality';
import { ExtendedValidationResult } from '../types';
import RDFService from './RDFService';
import { Parser as N3Parser } from 'n3';
import { backendService } from './BackendService';

/**
 * Service for discovering datasets and distributions from validated RDF catalogs
 * Uses data from MQA validation results instead of external API calls
 */
export class DataDiscoveryService {
  private static instance: DataDiscoveryService;
  private validatedResults: ExtendedValidationResult[] = [];
  
  private constructor() {}
  
  public static getInstance(): DataDiscoveryService {
    if (!DataDiscoveryService.instance) {
      DataDiscoveryService.instance = new DataDiscoveryService();
    }
    return DataDiscoveryService.instance;
  }

  /**
   * Set validated RDF results from MQA validation
   */
  public setValidationResults(results: ExtendedValidationResult[]): void {
    this.validatedResults = results;
  }

  /**
   * Add a validation result to the available datasets
   */
  public addValidationResult(result: ExtendedValidationResult): void {
    // Remove existing result with same content to avoid duplicates
    this.validatedResults = this.validatedResults.filter(r => r.content !== result.content);
    this.validatedResults.push(result);
  }

  /**
   * Search for datasets from validated RDF catalogs
   */
  async searchDatasets(query?: string, limit: number = 50): Promise<CatalogDataset[]> {
    try {
      const allDatasets: CatalogDataset[] = [];
      
      // Extract datasets from all validated RDF results
      for (const result of this.validatedResults) {
        const datasets = await this.extractDatasetsFromRDF(result);
        allDatasets.push(...datasets);
      }
      
      // Filter by query if provided
      let filteredDatasets = allDatasets;
      if (query && query.trim()) {
        const queryLower = query.toLowerCase();
        filteredDatasets = allDatasets.filter(dataset => 
          dataset.title.toLowerCase().includes(queryLower) ||
          dataset.description?.toLowerCase().includes(queryLower) ||
          dataset.keywords?.some(keyword => keyword.toLowerCase().includes(queryLower)) ||
          dataset.theme?.some(theme => theme.toLowerCase().includes(queryLower))
        );
      }
      
      return filteredDatasets.slice(0, limit);
    } catch (error) {
      console.error('Error searching datasets from validated RDF:', error);
      return [];
    }
  }

  /**
   * Get datasets with CSV or JSON distributions only
   */
  async getDataQualityCompatibleDatasets(query?: string, limit: number = 50): Promise<CatalogDataset[]> {
    const allDatasets = await this.searchDatasets(query, limit);
    
    return allDatasets
      .map(dataset => ({
        ...dataset,
        distributions: dataset.distributions.filter(dist => 
          this.isSupportedFormat(dist.format) || this.isSupportedMediaType(dist.mediaType)
        )
      }))
      .filter(dataset => dataset.distributions.length > 0);
  }

  /**
   * Get all distributions that support data quality analysis
   */
  async getCompatibleDistributions(query?: string, limit: number = 200): Promise<CatalogDistribution[]> {
    const datasets = await this.getDataQualityCompatibleDatasets(query, limit);
    return datasets.flatMap(dataset => dataset.distributions);
  }

  /**
   * Extract datasets from validated RDF content
   */
  private async extractDatasetsFromRDF(result: ExtendedValidationResult): Promise<CatalogDataset[]> {
    try {
      const datasets: CatalogDataset[] = [];
      
      // Normalize content to Turtle format
      const turtleContent = await RDFService.normalizeToTurtle(result.content, false);
      
      // Parse RDF content using N3 parser
      const parser = new N3Parser();
      const quads: any[] = [];
      
      await new Promise<void>((resolve, reject) => {
        parser.parse(turtleContent, (error: any, quad: any, prefixes: any) => {
          if (error) {
            reject(error);
          } else if (quad) {
            quads.push(quad);
          } else {
            // End of parsing
            resolve();
          }
        });
      });
      
      // Extract datasets using SPARQL-like queries on the parsed RDF
      const datasetTriples = quads.filter((triple: any) => 
        triple.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
        triple.object.value === 'http://www.w3.org/ns/dcat#Dataset'
      );
      
      for (const datasetTriple of datasetTriples) {
        const datasetUri = datasetTriple.subject.value;
        const dataset = await this.extractDatasetInfo(quads, datasetUri, result);
        if (dataset && dataset.distributions.length > 0) {
          datasets.push(dataset);
          console.debug(`Added dataset: ${dataset.title} with ${dataset.distributions.length} compatible distributions`);
        }
      }
      
      console.debug(`Extracted ${datasets.length} datasets with compatible distributions from RDF`);
      return datasets;
    } catch (error) {
      console.error('Error extracting datasets from RDF:', error);
      return [];
    }
  }

  /**
   * Extract dataset information from RDF quads
   */
  private async extractDatasetInfo(quads: any[], datasetUri: string, result: ExtendedValidationResult): Promise<CatalogDataset | null> {
    try {
      // Extract basic dataset properties
      const getProperty = (predicate: string): string | undefined => {
        const quad = quads.find((q: any) => 
          q.subject.value === datasetUri && q.predicate.value === predicate
        );
        return quad?.object.value;
      };
      
      const getProperties = (predicate: string): string[] => {
        return quads
          .filter((q: any) => q.subject.value === datasetUri && q.predicate.value === predicate)
          .map((q: any) => q.object.value);
      };
      
      const title = getProperty('http://purl.org/dc/terms/title') || 
                   getProperty('http://xmlns.com/foaf/0.1/name') || 
                   'Unnamed Dataset';
      
      const description = getProperty('http://purl.org/dc/terms/description');
      const issued = getProperty('http://purl.org/dc/terms/issued');
      const modified = getProperty('http://purl.org/dc/terms/modified');
      const publisher = getProperty('http://purl.org/dc/terms/publisher');
      
      // Extract themes and keywords
      const themes = getProperties('http://www.w3.org/ns/dcat#theme');
      const keywords = getProperties('http://www.w3.org/ns/dcat#keyword');
      
      // Extract distributions
      const distributionUris = getProperties('http://www.w3.org/ns/dcat#distribution');
      const distributions: CatalogDistribution[] = [];
      
      for (const distUri of distributionUris) {
        const distribution = await this.extractDistributionInfo(quads, distUri, {
          id: datasetUri,
          title,
          description
        });
        if (distribution && this.isDistributionCompatible(distribution)) {
          distributions.push(distribution);
        }
      }
      
      if (distributions.length === 0) {
        return null; // No compatible distributions
      }
      
      return {
        id: datasetUri,
        title,
        description,
        distributions,
        theme: themes.length > 0 ? themes : undefined,
        keywords: keywords.length > 0 ? keywords : undefined,
        publisher,
        issued,
        modified
      };
    } catch (error) {
      console.error('Error extracting dataset info:', error);
      return null;
    }
  }

  /**
   * Extract distribution information from RDF quads
   */
  private async extractDistributionInfo(quads: any[], distributionUri: string, dataset: { id: string; title: string; description?: string }): Promise<CatalogDistribution | null> {
    try {
      const getProperty = (predicate: string): string | undefined => {
        const quad = quads.find((q: any) => 
          q.subject.value === distributionUri && q.predicate.value === predicate
        );
        return quad?.object.value;
      };
      
      const title = getProperty('http://purl.org/dc/terms/title') || 'Distribution';
      const description = getProperty('http://purl.org/dc/terms/description');
      const accessURL = getProperty('http://www.w3.org/ns/dcat#accessURL');
      const downloadURL = getProperty('http://www.w3.org/ns/dcat#downloadURL');
      
      // Handle complex format objects (dct:IMT with rdf:value)
      const formatUri = getProperty('http://purl.org/dc/terms/format') || 
                       getProperty('http://www.w3.org/ns/dcat#format');
      const format = await this.resolveFormatFromUri(quads, formatUri, accessURL);
      
      const mediaType = getProperty('http://www.w3.org/ns/dcat#mediaType');
      const byteSize = getProperty('http://www.w3.org/ns/dcat#byteSize');
      
      // Only use downloadURL, or accessURL if it points to a .csv or .json file
      let primaryURL: string | undefined = downloadURL;
      
      if (!primaryURL && accessURL) {
        // Check if accessURL ends with .csv or .json (case insensitive)
        const urlLower = accessURL.toLowerCase();
        const hasValidExtension = urlLower.endsWith('.csv') || urlLower.endsWith('.json');
        
        if (hasValidExtension) {
          primaryURL = accessURL;
        }
      }
      
      if (!primaryURL) {
        return null; // No valid URL for data download
      }
      
      // Determine format with fallback chain
      let finalFormat = format;
      if (!finalFormat || finalFormat === 'unknown') {
        // Try mediaType as format source
        finalFormat = mediaType ? this.normalizeFormatValue(mediaType) : 'unknown';
      }
      if (!finalFormat || finalFormat === 'unknown') {
        // Fallback to URL-based detection, using primary URL
        finalFormat = this.extractFormatFromUrl(primaryURL);
      }
      
      // Skip validation here to avoid blocking the UI with multiple HTTP requests
      // Validation will be done when user selects a distribution for analysis
      
      return {
        id: distributionUri,
        title,
        description,
        accessURL: accessURL || '',
        downloadURL: downloadURL,
        format: finalFormat,
        mediaType,
        byteSize: byteSize ? parseInt(byteSize) : undefined,
        dataset
      };
    } catch (error) {
      console.error('Error extracting distribution info:', error);
      return null;
    }
  }

  /**
   * Resolve format from URI, handling complex dct:IMT objects
   */
  private async resolveFormatFromUri(quads: any[], formatUri?: string, fallbackUrl?: string): Promise<string> {
    if (!formatUri) {
      return fallbackUrl ? this.extractFormatFromUrl(fallbackUrl) : 'unknown';
    }
    
    // First, check if it's a simple string value (direct format)
    const directFormat = this.extractSimpleFormat(formatUri);
    if (directFormat !== 'unknown') {
      return directFormat;
    }
    
    // Handle complex format objects (dct:IMT) - can be URI or blank node
    let formatQuads = quads.filter((q: any) => 
      q.subject.value === formatUri || q.subject.id === formatUri
    );
    
    // If no quads found with URI, try to find by blank node ID
    if (formatQuads.length === 0 && formatUri.startsWith('_:')) {
      formatQuads = quads.filter((q: any) => q.subject.id === formatUri);
    }
    
    // Look for rdf:type dct:IMT
    const isIMT = formatQuads.some((q: any) => 
      q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
      (q.object.value === 'http://purl.org/dc/terms/IMT' || q.object.value.endsWith('#IMT'))
    );
    
    if (isIMT) {
      // Look for rdf:value property
      const valueQuad = formatQuads.find((q: any) => 
        q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value'
      );
      
      if (valueQuad) {
        const formatValue = valueQuad.object.value;
        console.debug('Found format rdf:value:', formatValue);
        return this.normalizeFormatValue(formatValue);
      }
      
      // Look for rdfs:label as fallback
      const labelQuad = formatQuads.find((q: any) => 
        q.predicate.value === 'http://www.w3.org/2000/01/rdf-schema#label'
      );
      
      if (labelQuad) {
        const labelValue = labelQuad.object.value;
        console.debug('Found format rdfs:label:', labelValue);
        return this.normalizeFormatValue(labelValue);
      }
      
      // Debug: log all format-related quads
      console.debug('Format quads for', formatUri, ':', formatQuads);
    }
    
    // Fallback to URL-based detection
    return fallbackUrl ? this.extractFormatFromUrl(fallbackUrl) : 'unknown';
  }
  
  /**
   * Extract simple format from direct string values
   */
  private extractSimpleFormat(formatString: string): string {
    const formatLower = formatString.toLowerCase();
    
    // EU Publications Office URIs and similar
    if (formatString.includes('publications.europa.eu') || formatString.includes('europa.eu')) {
      if (formatString.includes('CSV') || formatString.includes('csv')) return 'csv';
      if (formatString.includes('JSON') || formatString.includes('json')) return 'json';
    }
    
    // W3C and other standard URIs
    if (formatString.includes('w3.org') || formatString.includes('iana.org')) {
      if (formatLower.includes('csv') || formatLower.includes('comma-separated')) return 'csv';
      if (formatLower.includes('json')) return 'json';
    }
    
    // IANA media types
    if (formatLower.includes('text/csv') || formatLower.includes('application/csv')) return 'csv';
    if (formatLower.includes('application/json') || formatLower.includes('text/json')) return 'json';
    
    // Fragment identifiers and simple formats
    if (formatString.includes('#csv') || formatLower === 'csv' || formatLower === 'text/csv') return 'csv';
    if (formatString.includes('#json') || formatLower === 'json' || formatLower === 'application/json') return 'json';
    
    // File extension patterns in URIs
    if (formatString.endsWith('/CSV') || formatString.endsWith('/csv')) return 'csv';
    if (formatString.endsWith('/JSON') || formatString.endsWith('/json')) return 'json';
    
    return 'unknown';
  }
  
  /**
   * Normalize format values from rdf:value or rdfs:label
   */
  private normalizeFormatValue(value: string): string {
    const valueLower = value.toLowerCase().trim();
    
    // Direct matches
    if (valueLower === 'csv' || valueLower === 'text/csv' || valueLower === 'application/csv') {
      return 'csv';
    }
    if (valueLower === 'json' || valueLower === 'application/json' || valueLower === 'text/json') {
      return 'json';
    }
    
    // Partial matches and variations
    if (valueLower.includes('csv') || valueLower.includes('comma-separated') || 
        valueLower.includes('comma separated values') || valueLower.includes('delimiter-separated')) {
      return 'csv';
    }
    if (valueLower.includes('json') || valueLower.includes('javascript object notation')) {
      return 'json';
    }
    
    // Handle labels in other languages
    if (valueLower.includes('valores separados por comas')) return 'csv';
    if (valueLower.includes('notación de objetos javascript')) return 'json';
    
    return 'unknown';
  }

  /**
   * Check if distribution is compatible for data quality analysis
   */
  private isDistributionCompatible(distribution: CatalogDistribution): boolean {
    return this.isSupportedFormat(distribution.format) || 
           this.isSupportedMediaType(distribution.mediaType) ||
           this.extractFormatFromUrl(distribution.accessURL) !== 'unknown';
  }

  /**
   * Check if format is supported for data quality analysis
   */
  private isSupportedFormat(format?: string): boolean {
    if (!format) return false;
    
    const formatLower = format.toLowerCase();
    
    // EU Publications Office URIs
    if (format.includes('publications.europa.eu')) {
      return format.includes('CSV') || format.includes('JSON') || 
             format.includes('csv') || format.includes('json');
    }
    
    // Standard format checks
    const supportedFormats = [
      'csv', 'json',
      'text/csv', 'text/json',
      'application/csv', 'application/json',
      'comma-separated-values'
    ];
    
    return supportedFormats.some(supported => formatLower.includes(supported));
  }

  /**
   * Check if media type is supported
   */
  private isSupportedMediaType(mediaType?: string): boolean {
    if (!mediaType) return false;
    
    const supportedTypes = [
      'text/csv',
      'application/csv',
      'application/json',
      'text/json'
    ];
    
    return supportedTypes.includes(mediaType.toLowerCase());
  }

  /**
   * Extract format from URL extension
   */
  private extractFormatFromUrl(url: string): string {
    try {
      const urlLower = url.toLowerCase();
      
      // Direct file extensions
      if (urlLower.endsWith('.csv')) return 'csv';
      if (urlLower.endsWith('.json')) return 'json';
      
      // Query parameters
      if (urlLower.includes('format=csv') || urlLower.includes('fmt=csv')) return 'csv';
      if (urlLower.includes('format=json') || urlLower.includes('fmt=json')) return 'json';
      
      // Path indicators
      if (urlLower.includes('/csv/') || urlLower.includes('-csv-')) return 'csv';
      if (urlLower.includes('/json/') || urlLower.includes('-json-')) return 'json';
      
      // Datastore dump patterns (common in CKAN)
      if (urlLower.includes('/dump/') && urlLower.includes('format=csv')) return 'csv';
      if (urlLower.includes('/dump/') && urlLower.includes('format=json')) return 'json';
      
      // API endpoints
      if (urlLower.includes('/api/') && (urlLower.includes('.csv') || urlLower.includes('csv'))) return 'csv';
      if (urlLower.includes('/api/') && (urlLower.includes('.json') || urlLower.includes('json'))) return 'json';
      
      // Export patterns
      if (urlLower.includes('export') && urlLower.includes('csv')) return 'csv';
      if (urlLower.includes('export') && urlLower.includes('json')) return 'json';
      
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get dataset by ID from validated results
   */
  async getDatasetById(id: string): Promise<CatalogDataset | null> {
    try {
      const allDatasets = await this.searchDatasets();
      return allDatasets.find(dataset => dataset.id === id) || null;
    } catch (error) {
      console.error('Error finding dataset by ID:', error);
      return null;
    }
  }

  /**
   * Get available validation results
   */
  public getValidationResults(): ExtendedValidationResult[] {
    return this.validatedResults;
  }

  /**
   * Validate if a URL is accessible for data quality analysis
   */
  async validateDistributionAccess(distribution: CatalogDistribution): Promise<boolean> {
    try {
      // First check if URL looks valid
      if (!distribution.accessURL || !distribution.accessURL.startsWith('http')) {
        return false;
      }
      
      const response = await fetch(distribution.accessURL, {
        method: 'HEAD',
        mode: 'cors'
      });
      return response.ok;
    } catch (error) {
      // CORS issues are common, try different approach
      try {
        const response = await fetch(distribution.accessURL, {
          method: 'GET',
          mode: 'no-cors'
        });
        return true; // If no error, assume accessible
      } catch {
        return false;
      }
    }
  }
  
  /**
   * Check if there are validation results available
   */
  public hasValidationResults(): boolean {
    return this.validatedResults.length > 0;
  }
  
  /**
   * Validate that a URL returns actual data (CSV/JSON) and not HTML
   * This is now only called on-demand when user selects a distribution
   */
  async validateDataURL(url: string, expectedFormat: string): Promise<boolean> {
    // Skip validation for unknown formats
    if (expectedFormat === 'unknown') {
      return false;
    }
    
    try {
      // Use backend service for validation if available
      const backendAvailable = await backendService.isBackendAvailable();
      
      if (backendAvailable) {
        // Let backend handle validation
        const validation = await backendService.validateURLAccessibility(url);
        return validation.accessible;
      }
      
      // For client-side validation, do a HEAD request first
      try {
        const headResponse = await fetch(url, { 
          method: 'HEAD',
          mode: 'cors',
          cache: 'no-cache'
        });
        
        if (!headResponse.ok) {
          return false;
        }
        
        const contentType = headResponse.headers.get('content-type')?.toLowerCase() || '';
        
        // Check if content-type matches expected format
        if (expectedFormat === 'csv') {
          return contentType.includes('csv') || contentType.includes('text/plain');
        } else if (expectedFormat === 'json') {
          return contentType.includes('json');
        }
        
        // If content-type is HTML, reject immediately
        if (contentType.includes('text/html')) {
          return false;
        }
        
        // For ambiguous content-types, fetch first few bytes to check
        const partialResponse = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-cache',
          headers: {
            'Range': 'bytes=0-1024' // Get first 1KB
          }
        });
        
        const partialText = await partialResponse.text();
        const trimmedText = partialText.trim();
        
        // Check if it starts with HTML markers
        if (trimmedText.startsWith('<!DOCTYPE') || 
            trimmedText.startsWith('<html') || 
            trimmedText.startsWith('<HTML')) {
          return false;
        }
        
        // For JSON, check if it starts with { or [
        if (expectedFormat === 'json') {
          return trimmedText.startsWith('{') || trimmedText.startsWith('[');
        }
        
        // For CSV, assume valid if not HTML
        return true;
        
      } catch (corsError) {
        // CORS errors are common, assume URL might be valid
        // but needs backend or proxy to access
        console.debug(`CORS validation failed for ${url}, assuming valid:`, corsError);
        return true;
      }
      
    } catch (error) {
      console.debug(`URL validation error for ${url}:`, error);
      // In case of errors, be permissive and allow the URL
      return true;
    }
  }
}

export default DataDiscoveryService;