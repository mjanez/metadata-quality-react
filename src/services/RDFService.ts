import { Parser as N3Parser, Writer as N3Writer, Store as N3Store } from 'n3';
import { RdfXmlParser } from 'rdfxml-streaming-parser';
import { RDFFormat, ValidationProfile, SHACLReport, ProfileSelection } from '../types';
import { SHACLValidationService } from './SHACLValidationService';
import { backendService } from './BackendService';

export class RDFService {
  /**
   * Detect RDF format from content
   */
  public static detectFormat(content: string): RDFFormat {
    const trimmed = content.trim();
    
    if (trimmed.startsWith('<?xml') || 
        trimmed.includes('<rdf:RDF') || 
        trimmed.includes('<RDF') ||
        trimmed.includes('xmlns:rdf=')) {
      return 'rdfxml';
    }
    
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed['@context'] || parsed['@graph'] || parsed['@id']) {
          return 'jsonld';
        }
      } catch (e) {
        // Not valid JSON, continue checking
      }
    }
    
    if (trimmed.includes('<') && trimmed.includes('>') && trimmed.includes(' .')) {
      const lines = trimmed.split('\n');
      const ntriplesPattern = /^<[^>]+>\s+<[^>]+>\s+.*\s+\.$/;
      if (lines.some(line => ntriplesPattern.test(line.trim()))) {
        return 'ntriples';
      }
    }
    
    return 'turtle';
  }

  /**
   * Convert RDF/XML to Turtle
   */
  public static async convertRdfXmlToTurtle(rdfXmlContent: string, baseIRI: string = 'http://example.org/'): Promise<string> {
    try {
      console.debug('🔄 Converting RDF/XML to Turtle...');
      
      // Pre-process RDF/XML to fix invalid IRIs with spaces
      const { processedContent, warnings } = this.preprocessRdfForInvalidIRIs(rdfXmlContent);
      
      // Display warnings if any IRI issues were found and fixed
      if (warnings.length > 0) {
        console.warn(`⚠️ RDF Syntax Issues Detected: Applied ${warnings.length} automatic correction(s):`);
        warnings.forEach(warning => console.warn(`   • ${warning}`));
        console.warn('⚠️ Important: Original RDF contains syntax violations. While automatically corrected for processing,');
        console.warn('   consider fixing these issues in the source data to ensure full W3C RDF compliance.');
      }
      
      const parser = new RdfXmlParser({ baseIRI });
      const store = new N3Store();
      
      return new Promise((resolve, reject) => {
        parser.on('data', (quad) => {
          store.addQuad(quad);
        });
        
        parser.on('error', (error) => {
          console.error('❌ RDF/XML Parser error:', error);
          reject(new Error(`RDF/XML parsing failed: ${error.message}`));
        });
        
        parser.on('end', () => {
          try {
            const writer = new N3Writer({
              prefixes: {
                rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
                rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
                dct: 'http://purl.org/dc/terms/',
                dcat: 'http://www.w3.org/ns/dcat#',
                dcatap: 'http://data.europa.eu/r5r/',
                dcatapes: 'https://datosgobes.github.io/DCAT-AP-ES/',
                foaf: 'http://xmlns.com/foaf/0.1/',
                vcard: 'http://www.w3.org/2006/vcard/ns#',
                adms: 'http://www.w3.org/ns/adms#',
                xsd: 'http://www.w3.org/2001/XMLSchema#',
                }
            });

            const quads = store.getQuads();
            console.log(`✅ Parsed ${quads.length} quads from RDF/XML`);
            
            // Include warnings in the final success message if any were generated
            if (warnings.length > 0) {
              console.log(`⚠️ Conversion completed with ${warnings.length} syntax correction(s) - original RDF had compliance issues`);
            }
            
            writer.addQuads(quads);
            writer.end((error, result) => {
              if (error) {
                reject(error);
              } else {
                console.debug('✅ RDF/XML successfully converted to Turtle');
                resolve(result);
              }
            });
          } catch (conversionError) {
            reject(conversionError);
          }
        });

        parser.write(processedContent);
        parser.end();
      });
      
    } catch (error) {
      console.error('❌ Failed to convert RDF/XML to Turtle:', error);
      throw new Error(`RDF/XML conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Static property to store the latest preprocessing warnings
  private static lastPreprocessingWarnings: string[] = [];

  /**
   * Get the warnings from the last preprocessing operation
   */
  public static getLastPreprocessingWarnings(): string[] {
    return [...this.lastPreprocessingWarnings];
  }

  /**
   * Clear stored preprocessing warnings
   */
  public static clearPreprocessingWarnings(): void {
    this.lastPreprocessingWarnings = [];
  }

  /**
   * Preprocess RDF content to fix common IRI issues (works with RDF/XML, Turtle, etc.)
   */
  public static preprocessRdfForInvalidIRIs(content: string): { 
    processedContent: string; 
    warnings: string[] 
  } {
    const warnings: string[] = [];
    
    try {
      // Fix IRIs with spaces by URL encoding them
      // Pattern 1: RDF/XML attributes (rdf:about="...")
      const xmlAttributePattern = /((?:rdf:about|rdf:resource|rdf:datatype)\s*=\s*["'])(.*?)(["'])/gi;
      // Pattern 2: Turtle/N-Triples IRIs (<...>)
      const turtleIriPattern = /(<)((?:https?|ftp):\/\/[^>\s]*\s[^>]*)(>)/gi;
      
      let processedContent = content;
      
      // Process RDF/XML attributes
      processedContent = processedContent.replace(xmlAttributePattern, (match, prefix, iri, suffix) => {
        try {
          // Check if IRI contains spaces or other invalid characters
          if (iri.includes(' ') || iri.includes('\n') || iri.includes('\t')) {
            const fixedIRI = this.encodeInvalidIRI(iri);
            const warningMessage = `Invalid IRI with spaces/whitespace in XML attribute: '${iri}' → automatically encoded to '${fixedIRI}'`;
            warnings.push(warningMessage);
            console.warn(`⚠️ RDF Syntax Warning: ${warningMessage}`);
            return `${prefix}${fixedIRI}${suffix}`;
          }
          return match;
        } catch (error) {
          return match;
        }
      });
      
      // Process Turtle/N-Triples IRIs
      processedContent = processedContent.replace(turtleIriPattern, (match, prefix, iri, suffix) => {
        try {
          // Check if IRI contains spaces or other invalid characters
          if (iri.includes(' ') || iri.includes('\n') || iri.includes('\t')) {
            const fixedIRI = this.encodeInvalidIRI(iri);
            const warningMessage = `Invalid IRI with spaces/whitespace in Turtle: '${iri}' → automatically encoded to '${fixedIRI}'`;
            warnings.push(warningMessage);
            console.warn(`⚠️ RDF Syntax Warning: ${warningMessage}`);
            return `${prefix}${fixedIRI}${suffix}`;
          }
          return match;
        } catch (error) {
          return match;
        }
      });
      
      // Store warnings for external access
      this.lastPreprocessingWarnings = [...warnings];
      
      return { processedContent, warnings };
    } catch (error) {
      console.warn('⚠️ Failed to preprocess RDF for invalid IRIs:', error);
      return { processedContent: content, warnings }; // Return original content if preprocessing fails
    }
  }

  /**
   * Encode invalid IRI by URL encoding problematic characters
   */
  private static encodeInvalidIRI(iri: string): string {
    try {
      // URL encode the IRI while preserving the scheme and authority
      const url = new URL(iri);
      const encodedPathname = encodeURI(url.pathname);
      const encodedSearch = url.search ? encodeURI(url.search) : '';
      const encodedHash = url.hash ? encodeURI(url.hash) : '';
      return `${url.protocol}//${url.host}${encodedPathname}${encodedSearch}${encodedHash}`;
    } catch (urlError) {
      // If URL constructor fails, try simple space encoding
      return iri.replace(/ /g, '%20').replace(/\n/g, '').replace(/\t/g, '');
    }
  }

  /**
   * Fetch RDF content from URL with backend support and CORS fallback
   */
  public static async fetchFromUrl(url: string): Promise<string> {
    console.debug(`🌐 Fetching content from URL: ${url}`);
    
    // First try: Use backend service if available
    try {
      const isBackendAvailable = await backendService.isBackendAvailable();
      if (isBackendAvailable) {
        console.debug('🔧 Using backend service for RDF download');
        const content = await backendService.downloadData(url);
        console.debug(`✅ Content successfully fetched via backend (${content.length} chars)`);
        return content;
      }
    } catch (backendError) {
      console.warn('⚠️ Backend fetch failed, falling back to direct methods:', backendError);
    }

    // Second try: Direct fetch (might fail due to CORS)
    try {
      console.debug('📡 Attempting direct fetch');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/rdf+xml, text/turtle, application/n-triples, application/ld+json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (compatible; RDF-Validator/1.0)'
        },
        cache: 'no-cache'
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const content = await response.text();
      console.debug(`✅ Content successfully fetched directly (${content.length} chars)`);
      return content;
      
    } catch (directError) {
      console.warn('⚠️ Direct fetch failed:', directError);
      
      // Create user-friendly error for CORS issues
      if (directError instanceof Error) {
        if (directError.name === 'AbortError') {
          throw new Error('TIMEOUT: Request timeout (>15s). The server may be slow or unreachable.');
        } else if (directError.message.includes('CORS') || directError.message.includes('ERR_FAILED') || directError.message.includes('Failed to fetch')) {
          throw new Error('CORS_ERROR: Cross-origin restrictions prevent automatic download.');
        } else {
          throw new Error(`NETWORK_ERROR: ${directError.message}`);
        }
      } else {
        throw new Error('UNKNOWN_ERROR: An unknown network error occurred.');
      }
    }
  }

  /**
   * Convert N-Triples to Turtle
   */
  public static async convertNTriplesToTurtle(ntriplesContent: string): Promise<string> {
    try {
      console.debug('🔄 Converting N-Triples to Turtle...');
      
      const parser = new N3Parser({ format: 'application/n-triples' });
      const store = new N3Store();
      
      return new Promise((resolve, reject) => {
        parser.parse(ntriplesContent, (error, quad, prefixes) => {
          if (error) {
            console.error('❌ N-Triples Parser error:', error);
            reject(new Error(`N-Triples parsing failed: ${error.message}`));
          } else if (quad) {
            store.addQuad(quad);
          } else {
            // End of parsing
            try {
              const writer = new N3Writer({
                prefixes: {
                  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
                  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
                  dct: 'http://purl.org/dc/terms/',
                  dcat: 'http://www.w3.org/ns/dcat#',
                  dcatap: 'http://data.europa.eu/r5r/',
                  dcatapes: 'https://datosgobes.github.io/DCAT-AP-ES/',
                  foaf: 'http://xmlns.com/foaf/0.1/',
                  vcard: 'http://www.w3.org/2006/vcard/ns#',
                  adms: 'http://www.w3.org/ns/adms#',
                  xsd: 'http://www.w3.org/2001/XMLSchema#',
                }
              });

              const quads = store.getQuads();
              console.log(`✅ Parsed ${quads.length} quads from N-Triples`);
              
              writer.addQuads(quads);
              writer.end((error, result) => {
                if (error) {
                  reject(error);
                } else {
                  console.debug('✅ N-Triples successfully converted to Turtle');
                  resolve(result);
                }
              });
            } catch (conversionError) {
              reject(conversionError);
            }
          }
        });
      });
      
    } catch (error) {
      console.error('❌ Failed to convert N-Triples to Turtle:', error);
      throw new Error(`N-Triples conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert JSON-LD to Turtle using N3Parser
   */
  public static async convertJsonLdToTurtle(jsonldContent: string): Promise<string> {
    try {
      console.debug('🔄 Converting JSON-LD to Turtle...');
      
      // First validate that it's valid JSON
      const parsed = JSON.parse(jsonldContent);
      
      // For now, JSON-LD conversion is complex without proper library
      // We'll provide a basic error message and suggest using Turtle format
      throw new Error(
        'JSON-LD to Turtle conversion is not fully supported yet. ' +
        'Please convert your JSON-LD to Turtle format using an external tool like: ' +
        'https://www.easyrdf.org/converter or use Turtle format directly.'
      );
      
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON-LD format: ${error.message}`);
      }
      console.error('❌ JSON-LD conversion error:', error);
      throw error;
    }
  }

  /**
   * Parse and count RDF statistics
   */
  public static async parseAndCount(turtleContent: string): Promise<{ 
    triples: number; 
    subjects: number; 
    predicates: number; 
    objects: number;
    datasets: number;
    dataServices: number;
    distributions: number;
  }> {
    return new Promise((resolve, reject) => {
      const store = new N3Store();
      const parser = new N3Parser({ format: 'text/turtle' });

      parser.parse(turtleContent, (error, quad, prefixes) => {
        if (error) {
          reject(error);
        } else if (quad) {
          store.addQuad(quad);
        } else {
          // End of parsing
          const subjects = new Set();
          const predicates = new Set();
          const objects = new Set();
          
          // DCAT entity counters
          const datasets = new Set();
          const dataServices = new Set();
          const distributions = new Set();

          const quads = store.getQuads();
          quads.forEach(quad => {
            subjects.add(quad.subject.value);
            predicates.add(quad.predicate.value);
            objects.add(quad.object.value);
            
            // Count DCAT entities based on rdf:type
            if (quad.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
              const objectValue = quad.object.value;
              if (objectValue === 'http://www.w3.org/ns/dcat#Dataset') {
                datasets.add(quad.subject.value);
              } else if (objectValue === 'http://www.w3.org/ns/dcat#DataService') {
                dataServices.add(quad.subject.value);
              } else if (objectValue === 'http://www.w3.org/ns/dcat#Distribution') {
                distributions.add(quad.subject.value);
              }
            }
          });

          resolve({
            triples: store.size,
            subjects: subjects.size,
            predicates: predicates.size,
            objects: objects.size,
            datasets: datasets.size,
            dataServices: dataServices.size,
            distributions: distributions.size
          });
        }
      });
    });
  }

  /**
   * Normalize RDF content to Turtle format
   */
  public static async normalizeToTurtle(content: string, isUrl: boolean = false, originalFormat?: string): Promise<string> {
    if (isUrl) {
      content = await this.fetchFromUrl(content);
    }

    // Use provided format or auto-detect, resolve 'auto' to actual format
    let format = originalFormat || this.detectFormat(content);
    if (format === 'auto') {
      format = this.detectFormat(content);
    }
    
    console.debug(`🔄 Normalizing ${format} to Turtle...`);
    
    if (format === 'rdfxml') {
      return await this.convertRdfXmlToTurtle(content);
    } else if (format === 'turtle') {
      // Apply preprocessing to Turtle content as well
      const { processedContent, warnings } = this.preprocessRdfForInvalidIRIs(content);
      if (warnings.length > 0) {
        console.warn(`⚠️ Turtle preprocessing applied ${warnings.length} automatic correction(s):`);
        warnings.forEach(warning => console.warn(`   • ${warning}`));
        console.warn('⚠️ Original Turtle content had syntax violations that were automatically corrected.');
      }
      return processedContent;
    } else if (format === 'ntriples') {
      return await this.convertNTriplesToTurtle(content);
    } else if (format === 'jsonld') {
      return await this.convertJsonLdToTurtle(content);
    } else {
      throw new Error(`Unsupported RDF format: ${format}. Supported formats: rdfxml, turtle, ntriples, jsonld`);
    }
  }

  /**
   * Validate RDF content against SHACL shapes for profile compliance
   */
  public static async validateWithSHACL(
    content: string, 
    profileSelection: ProfileSelection | ValidationProfile,
    format: RDFFormat = 'turtle'
  ): Promise<SHACLReport> {
    try {
      // Extract profile string from ProfileSelection or use as-is if it's a string
      const profile: ValidationProfile = typeof profileSelection === 'string' 
        ? profileSelection 
        : profileSelection.profile;
        
      // Normalize content to turtle if needed
      let normalizedContent = content;
      if (format !== 'turtle') {
        normalizedContent = await this.normalizeToTurtle(content);
      }

      // Perform SHACL validation
      return await SHACLValidationService.validateRDF(normalizedContent, profile, 'turtle');
    } catch (error) {
      console.error('SHACL validation error in RDFService:', error);
      throw error;
    }
  }

  /**
   * Calculate compliance score based on SHACL validation results
   */
  public static calculateComplianceScore(shaclReport: SHACLReport): number {
    return SHACLValidationService.calculateComplianceScore(shaclReport);
  }

  /**
   * Export SHACL report as Turtle
   */
  public static async exportSHACLReport(
    shaclReport: SHACLReport, 
    profileSelection?: ProfileSelection,
    profileVersion?: string
  ): Promise<string> {
    return await SHACLValidationService.exportReportAsTurtle(shaclReport, profileSelection, profileVersion);
  }
}

export default RDFService;
