/**
 * RDF Parsing and Format Detection Utilities
 * 
 * Server-side utilities for RDF parsing using N3.js and format detection.
 */

const N3 = require('n3');
const { RdfXmlParser } = require('rdfxml-streaming-parser');
const { Readable } = require('stream');

/**
 * Detect RDF format from content
 */
function detectFormat(content) {
  const trimmed = content.trim();
  
  // Turtle detection - check first for Turtle-specific patterns
  // @prefix and @base are Turtle-only constructs
  if (trimmed.includes('@prefix') || 
      trimmed.includes('@base') ||
      /^PREFIX\s+/im.test(trimmed) ||
      /^BASE\s+/im.test(trimmed)) {
    return 'turtle';
  }
  
  // RDF/XML detection - must start with XML declaration or have RDF namespace
  if (trimmed.startsWith('<?xml') || 
      trimmed.startsWith('<rdf:RDF') ||
      trimmed.startsWith('<RDF') ||
      (trimmed.startsWith('<') && trimmed.includes('xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"'))) {
    return 'rdfxml';
  }
  
  // JSON-LD detection
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed['@context'] || parsed['@graph'] || parsed['@id']) {
        return 'jsonld';
      }
    } catch (e) {
      // Not valid JSON
    }
  }
  
  // N-Triples detection - lines with <subject> <predicate> <object|"literal"> .
  if (trimmed.includes('<') && trimmed.includes('>') && trimmed.includes(' .')) {
    const lines = trimmed.split('\n');
    const ntriplesPattern = /^<[^>]+>\s+<[^>]+>\s+.*\s+\.$/;
    if (lines.some(line => ntriplesPattern.test(line.trim()))) {
      return 'ntriples';
    }
  }
  
  // Default to Turtle (most common format)
  return 'turtle';
}

/**
 * Preprocess RDF content to fix common IRI issues
 */
function preprocessRdfForInvalidIRIs(content) {
  const warnings = [];
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
    console.warn('IRI preprocessing failed:', error.message);
  }
  
  return { processedContent, warnings };
}

/**
 * Encode invalid IRI by URL encoding problematic characters
 */
function encodeInvalidIRI(iri) {
  try {
    const url = new URL(iri);
    const encodedPathname = encodeURI(url.pathname);
    const encodedSearch = url.search ? encodeURI(url.search) : '';
    const encodedHash = url.hash ? encodeURI(url.hash) : '';
    return `${url.protocol}//${url.host}${encodedPathname}${encodedSearch}${encodedHash}`;
  } catch (urlError) {
    return iri.replace(/ /g, '%20').replace(/\n/g, '').replace(/\t/g, '');
  }
}

/**
 * Parse RDF content and extract statistics
 * Implements fallback: if specified format fails, auto-detect and retry
 */
async function parseRDF(content, format) {
  // Try with specified format first
  try {
    return await parseRDFWithFormat(content, format);
  } catch (firstError) {
    // If explicit format was given and it failed, try auto-detection
    const autoDetected = detectFormat(content);
    if (autoDetected !== format) {
      console.warn(`⚠️ Parsing with format '${format}' failed, trying auto-detected format '${autoDetected}'...`);
      try {
        return await parseRDFWithFormat(content, autoDetected);
      } catch (secondError) {
        // Both failed, throw the original error
        throw firstError;
      }
    }
    throw firstError;
  }
}

/**
 * Parse RDF with a specific format (internal helper)
 */
async function parseRDFWithFormat(content, format) {
  return new Promise((resolve, reject) => {
    const store = new N3.Store();
    
    // Handle RDF/XML with rdfxml-streaming-parser
    if (format === 'rdfxml') {
      const rdfXmlParser = new RdfXmlParser();
      const stream = Readable.from([content]);
      
      stream.pipe(rdfXmlParser)
        .on('data', (quad) => {
          store.addQuad(quad);
        })
        .on('error', (error) => {
          reject(error);
        })
        .on('end', () => {
          resolve(store);
        });
      return;
    }
    
    // Handle JSON-LD (N3.js supports it)
    if (format === 'jsonld') {
      const parser = new N3.Parser({ format: 'application/ld+json' });
      
      parser.parse(content, (error, quad, prefixes) => {
        if (error) {
          reject(error);
        } else if (quad) {
          store.addQuad(quad);
        } else {
          resolve(store);
        }
      });
      return;
    }
    
    // Handle Turtle, N-Triples, N3 with N3.js
    const formatMap = {
      'turtle': 'text/turtle',
      'ntriples': 'application/n-triples',
      'n3': 'text/n3'
    };
    
    const parserFormat = formatMap[format] || 'text/turtle';
    const parser = new N3.Parser({ format: parserFormat });
    
    parser.parse(content, (error, quad, prefixes) => {
      if (error) {
        reject(error);
      } else if (quad) {
        store.addQuad(quad);
      } else {
        // Parsing complete
        resolve(store);
      }
    });
  });
}

/**
 * Count entities by type in RDF store
 */
function countEntitiesByType(store, typeURI) {
  const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  
  const typeQuads = store.getQuads(null, RDF_TYPE, typeURI, null);
  return typeQuads.length;
}

/**
 * Get RDF statistics from store
 */
function getRDFStats(store) {
  const subjects = new Set();
  const predicates = new Set();
  const objects = new Set();
  
  const DCAT_DATASET = 'http://www.w3.org/ns/dcat#Dataset';
  const DCAT_DISTRIBUTION = 'http://www.w3.org/ns/dcat#Distribution';
  const DCAT_CATALOG = 'http://www.w3.org/ns/dcat#Catalog';
  const DCAT_DATASERVICE = 'http://www.w3.org/ns/dcat#DataService';
  
  store.getQuads().forEach(quad => {
    subjects.add(quad.subject.value);
    predicates.add(quad.predicate.value);
    objects.add(quad.object.value);
  });
  
  return {
    triples: store.size,
    subjects: subjects.size,
    predicates: predicates.size,
    objects: objects.size,
    datasets: countEntitiesByType(store, DCAT_DATASET),
    distributions: countEntitiesByType(store, DCAT_DISTRIBUTION),
    catalogs: countEntitiesByType(store, DCAT_CATALOG),
    dataServices: countEntitiesByType(store, DCAT_DATASERVICE)
  };
}

/**
 * Convert RDF/XML to Turtle
 */
async function convertRdfXmlToTurtle(rdfXmlContent) {
  // For now, throw an error as RDF/XML parsing requires additional dependencies
  // The frontend handles this conversion
  throw new Error('RDF/XML conversion is handled by the frontend. Please send content in Turtle format or use the frontend application.');
}

/**
 * Validate RDF syntax
 */
async function validateRDFSyntax(content, format) {
  try {
    const store = await parseRDF(content, format);
    return {
      valid: true,
      tripleCount: store.size
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
      lineNumber: extractLineNumber(error.message)
    };
  }
}

/**
 * Extract line number from error message
 */
function extractLineNumber(errorMessage) {
  const lineMatch = errorMessage.match(/line[:\s]+(\d+)/i);
  if (lineMatch) {
    return parseInt(lineMatch[1], 10);
  }
  return null;
}

module.exports = {
  detectFormat,
  preprocessRdfForInvalidIRIs,
  encodeInvalidIRI,
  parseRDF,
  countEntitiesByType,
  getRDFStats,
  convertRdfXmlToTurtle,
  validateRDFSyntax,
  extractLineNumber
};
