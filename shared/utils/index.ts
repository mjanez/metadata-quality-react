/**
 * Shared Utilities
 * 
 * Isomorphic utility functions for MQA services.
 */

// ============================================================================
// Environment Detection
// ============================================================================

export const isNode = typeof window === 'undefined';
export const isBrowser = !isNode;

// ============================================================================
// Property Expansion
// ============================================================================

export const PREFIXES: { [key: string]: string } = {
  'rdf:': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  'rdfs:': 'http://www.w3.org/2000/01/rdf-schema#',
  'dct:': 'http://purl.org/dc/terms/',
  'dcat:': 'http://www.w3.org/ns/dcat#',
  'dcatap:': 'http://data.europa.eu/r5r/',
  'dcatapes:': 'https://datosgobes.github.io/DCAT-AP-ES/',
  'foaf:': 'http://xmlns.com/foaf/0.1/',
  'vcard:': 'http://www.w3.org/2006/vcard/ns#',
  'adms:': 'http://www.w3.org/ns/adms#',
  'xsd:': 'http://www.w3.org/2001/XMLSchema#',
  'sh:': 'http://www.w3.org/ns/shacl#'
};

/**
 * Expand short property name to full URI
 */
export function expandProperty(property: string): string {
  for (const [prefix, uri] of Object.entries(PREFIXES)) {
    if (property.startsWith(prefix)) {
      return property.replace(prefix, uri);
    }
  }
  return property;
}

/**
 * Compact full URI to prefixed form
 */
export function compactProperty(uri: string): string {
  for (const [prefix, namespace] of Object.entries(PREFIXES)) {
    if (uri.startsWith(namespace)) {
      return uri.replace(namespace, prefix);
    }
  }
  return uri;
}

// ============================================================================
// RDF Constants
// ============================================================================

export const RDF_URIS = {
  RDF_TYPE: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
  RDFS_LABEL: 'http://www.w3.org/2000/01/rdf-schema#label',
  RDF_VALUE: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value'
} as const;

export const ENTITY_TYPE_URIS = {
  Dataset: 'http://www.w3.org/ns/dcat#Dataset',
  Distribution: 'http://www.w3.org/ns/dcat#Distribution',
  Catalog: 'http://www.w3.org/ns/dcat#Catalog',
  DataService: 'http://www.w3.org/ns/dcat#DataService'
} as const;

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Detect RDF format from content
 */
export function detectRDFFormat(content: string): 'turtle' | 'rdfxml' | 'jsonld' | 'ntriples' {
  const trimmed = content.trim();
  
  // RDF/XML detection
  if (trimmed.startsWith('<?xml') || 
      trimmed.includes('<rdf:RDF') || 
      trimmed.includes('<RDF') ||
      trimmed.includes('xmlns:rdf=')) {
    return 'rdfxml';
  }
  
  // JSON-LD detection
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed['@context'] || parsed['@graph'] || parsed['@id']) {
        return 'jsonld';
      }
    } catch {
      // Not valid JSON
    }
  }
  
  // N-Triples detection
  if (trimmed.includes('<') && trimmed.includes('>') && trimmed.includes(' .')) {
    const lines = trimmed.split('\n');
    const ntriplesPattern = /^<[^>]+>\s+<[^>]+>\s+.*\s+\.$/;
    if (lines.some(line => ntriplesPattern.test(line.trim()))) {
      return 'ntriples';
    }
  }
  
  // Default to Turtle
  return 'turtle';
}

// ============================================================================
// IRI Preprocessing
// ============================================================================

/**
 * Preprocess RDF content to fix common IRI issues
 */
export function preprocessRdfForInvalidIRIs(content: string): { 
  processedContent: string; 
  warnings: string[] 
} {
  const warnings: string[] = [];
  let processedContent = content;
  
  try {
    // Fix IRIs with spaces - RDF/XML attributes
    const xmlAttributePattern = /((?:rdf:about|rdf:resource|rdf:datatype)\s*=\s*["'])(.*?)(["'])/gi;
    processedContent = processedContent.replace(xmlAttributePattern, (match, prefix, iri, suffix) => {
      if (iri.includes(' ') || iri.includes('\n') || iri.includes('\t')) {
        const fixedIRI = encodeInvalidIRI(iri);
        warnings.push(`Fixed invalid IRI with spaces: '${iri.substring(0, 50)}...'`);
        return `${prefix}${fixedIRI}${suffix}`;
      }
      return match;
    });
    
    // Fix IRIs with spaces - Turtle/N-Triples
    const turtleIriPattern = /(<)((?:https?|ftp):\/\/[^>\s]*\s[^>]*)(>)/gi;
    processedContent = processedContent.replace(turtleIriPattern, (match, prefix, iri, suffix) => {
      if (iri.includes(' ') || iri.includes('\n') || iri.includes('\t')) {
        const fixedIRI = encodeInvalidIRI(iri);
        warnings.push(`Fixed invalid IRI with spaces: '${iri.substring(0, 50)}...'`);
        return `${prefix}${fixedIRI}${suffix}`;
      }
      return match;
    });
  } catch (error) {
    console.warn('IRI preprocessing failed:', error);
  }
  
  return { processedContent, warnings };
}

/**
 * Encode invalid IRI by URL encoding problematic characters
 */
export function encodeInvalidIRI(iri: string): string {
  try {
    const url = new URL(iri);
    const encodedPathname = encodeURI(url.pathname);
    const encodedSearch = url.search ? encodeURI(url.search) : '';
    const encodedHash = url.hash ? encodeURI(url.hash) : '';
    return `${url.protocol}//${url.host}${encodedPathname}${encodedSearch}${encodedHash}`;
  } catch {
    return iri.replace(/ /g, '%20').replace(/\n/g, '').replace(/\t/g, '');
  }
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Normalize value for comparison (lowercase, trim)
 */
export function normalizeValue(value: string | undefined | null): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value.toLowerCase().trim();
}

/**
 * Round score to consistent decimal places
 */
export function roundScore(value: number, decimals: number = 3): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Escape CSV value (handle commas, quotes, newlines)
 */
export function escapeCsvValue(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ============================================================================
// Metric Entity Type Classification
// ============================================================================

/**
 * Determine entity type for a specific metric
 */
export function getMetricEntityType(metricId: string): 'Dataset' | 'Distribution' | 'Catalog' | 'Multi' {
  const multiEntityMetrics = [
    'dct_issued', 'dct_modified', 'dct_title', 'dct_description'
  ];
  
  const datasetMetrics = [
    'dcat_keyword', 'dcat_theme', 'dct_spatial', 'dct_temporal',
    'dct_creator', 'dct_language', 'dcat_contact_point', 
    'dct_access_rights', 'dct_publisher', 'dct_publisher_nti_risp', 
    'dct_access_rights_vocabulary', 'dct_license_nti_risp', 
    'dct_license_vocabulary_nti_risp', 'dct_issued_nti_risp', 
    'dct_modified_nti_risp'
  ];
  
  const distributionMetrics = [
    'dcat_access_url', 'dcat_download_url', 'dct_format', 'dcat_media_type',
    'dcat_byte_size', 'dct_rights', 'dct_format_vocabulary', 
    'dct_format_machine_readable', 'dct_format_vocabulary_nti_risp', 
    'dcat_media_type_vocabulary_nti_risp', 'dct_format_nonproprietary_nti_risp', 
    'dct_format_machine_readable_nti_risp', 'dcat_media_type_vocabulary', 
    'dct_format_nonproprietary', 'dcat_access_url_status', 
    'dcat_download_url_status', 'dct_license', 'dct_license_vocabulary'
  ];
  
  const catalogMetrics = [
    'dcat_ap_compliance', 'dcat_ap_es_compliance', 'nti_risp_compliance'
  ];
  
  if (multiEntityMetrics.includes(metricId)) return 'Multi';
  if (distributionMetrics.includes(metricId)) return 'Distribution';
  if (datasetMetrics.includes(metricId)) return 'Dataset';
  if (catalogMetrics.includes(metricId)) return 'Catalog';
  return 'Catalog';
}

/**
 * Get vocabulary metric information
 */
export function getVocabularyMetricInfo(metricId: string): { 
  baseProperty: string; 
  vocabularyName: string; 
  ntiRispProperty?: string 
} | null {
  const vocabularyMetrics: { [key: string]: { baseProperty: string; vocabularyName: string; ntiRispProperty?: string } } = {
    'dct_format_vocabulary': { baseProperty: 'dct:format', vocabularyName: 'file_types' },
    'dcat_media_type_vocabulary': { baseProperty: 'dcat:mediaType', vocabularyName: 'media_types' },
    'dct_format_vocabulary_nti_risp': { baseProperty: 'dct:format', vocabularyName: 'file_types', ntiRispProperty: 'rdfs:label' },
    'dcat_media_type_vocabulary_nti_risp': { baseProperty: 'dct:format', vocabularyName: 'media_types', ntiRispProperty: 'rdf:value' },
    'dct_format_nonproprietary_nti_risp': { baseProperty: 'dct:format', vocabularyName: 'non_proprietary', ntiRispProperty: 'rdfs:label' },
    'dct_format_machine_readable_nti_risp': { baseProperty: 'dct:format', vocabularyName: 'machine_readable', ntiRispProperty: 'rdfs:label' },
    'dct_format_nonproprietary': { baseProperty: 'dct:format', vocabularyName: 'non_proprietary' },
    'dct_format_machine_readable': { baseProperty: 'dct:format', vocabularyName: 'machine_readable' },
    'dct_license_vocabulary': { baseProperty: 'dct:license', vocabularyName: 'licenses' },
    'dct_access_rights_vocabulary': { baseProperty: 'dct:accessRights', vocabularyName: 'access_rights' },
    'dct_license_vocabulary_nti_risp': { baseProperty: 'dct:license', vocabularyName: 'licenses' }
  };
  
  return vocabularyMetrics[metricId] || null;
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Fetch content from URL (isomorphic)
 */
export async function fetchContent(url: string, timeout: number = 30000): Promise<string> {
  if (isNode) {
    // Node.js environment
    const https = await import('https');
    const http = await import('http');
    const { URL } = await import('url');
    
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const request = client.get(url, {
        headers: {
          'Accept': 'text/turtle, application/rdf+xml, application/ld+json, application/n-triples, */*',
          'User-Agent': 'MQA-API/1.0.0'
        }
      }, (response) => {
        if (response.statusCode && (response.statusCode >= 300 && response.statusCode < 400) && response.headers.location) {
          // Follow redirect
          fetchContent(response.headers.location, timeout).then(resolve).catch(reject);
          return;
        }
        
        if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 400)) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
        response.on('error', reject);
      });
      
      request.on('error', reject);
      request.setTimeout(timeout, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  } else {
    // Browser environment
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/turtle, application/rdf+xml, application/ld+json, application/n-triples, */*'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.text();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

export default {
  isNode,
  isBrowser,
  PREFIXES,
  RDF_URIS,
  ENTITY_TYPE_URIS,
  expandProperty,
  compactProperty,
  detectRDFFormat,
  preprocessRdfForInvalidIRIs,
  encodeInvalidIRI,
  normalizeValue,
  roundScore,
  escapeCsvValue,
  getMetricEntityType,
  getVocabularyMetricInfo,
  fetchContent
};
