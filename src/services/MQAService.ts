import { Store as N3Store, Parser as N3Parser } from 'n3';
import { RdfXmlParser } from 'rdfxml-streaming-parser';
import { ValidationProfile, MQAConfig, QualityResult, QualityMetric, VocabularyItem, SHACLReport, ProfileSelection, RDFValidationResult } from '../types';
import { RDFService } from './RDFService';
import { detectRDFFormat } from '../utils/formatDetection';
import mqaConfig from '../config/mqa-config.json';
import i18n from '../i18n';
import { backendService } from './BackendService';

export class MQAService {
  private static instance: MQAService;
  private config: MQAConfig;
  private vocabularies: Map<string, VocabularyItem[]> = new Map();
  private vocabularyLoadPromises: Map<string, Promise<VocabularyItem[]>> = new Map();

  // RDF URI constants for better maintainability
  private static readonly RDF_URIS = {
    RDFS_LABEL: 'http://www.w3.org/2000/01/rdf-schema#label',
    RDF_VALUE: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value',
    RDF_TYPE: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
  } as const;

  private constructor() {
    this.config = mqaConfig as unknown as MQAConfig;
    // Pre-load common vocabularies to avoid repeated requests
    this.preloadVocabularies();
  }

  /**
   * Pre-load commonly used vocabularies
   */
  private async preloadVocabularies(): Promise<void> {
    const commonVocabularies = [
      'licenses',
      'access_rights',
      'file_types',
      'media_types',
      'non_proprietary',
      'machine_readable'
    ];

    console.log('Pre-loading common vocabularies...');
    const loadPromises = commonVocabularies.map(name => this.loadVocabulary(name));
    
    try {
      await Promise.all(loadPromises);
      console.log('✅ All common vocabularies loaded');
    } catch (error) {
      console.warn('⚠️ Some vocabularies failed to pre-load:', error);
    }
  }

  public static getInstance(): MQAService {
    if (!MQAService.instance) {
      MQAService.instance = new MQAService();
    }
    return MQAService.instance;
  }

  /**
   * Load vocabulary from JSONL file (with deduplication of concurrent requests)
   */
  private async loadVocabulary(name: string): Promise<VocabularyItem[]> {
    try {
      // Return cached vocabulary if available
      if (this.vocabularies.has(name)) {
        return this.vocabularies.get(name)!;
      }

      // Return existing load promise if already loading (prevents duplicate requests)
      if (this.vocabularyLoadPromises.has(name)) {
        return this.vocabularyLoadPromises.get(name)!;
      }


      // Create load promise
      const loadPromise = (async () => {
    let basePath = process.env.PUBLIC_URL || '/';
    // Ensure basePath ends with exactly one /
    if (!basePath.endsWith('/')) basePath += '/';
    const response = await fetch(`${basePath}data/${name}.jsonl`);
        if (!response.ok) {
          throw new Error(`Failed to load vocabulary ${name}: ${response.statusText}`);
        }

        const text = await response.text();
        const items: VocabularyItem[] = text
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));

        this.vocabularies.set(name, items);
        this.vocabularyLoadPromises.delete(name); // Clean up promise
        console.log(`✅ Loaded ${items.length} items for vocabulary: ${name}`);
        return items;
      })();

      // Store promise to prevent duplicate requests
      this.vocabularyLoadPromises.set(name, loadPromise);
      
      return await loadPromise;
    } catch (error) {
      console.warn(`⚠️ Failed to load vocabulary ${name}:`, error);
      this.vocabularyLoadPromises.delete(name); // Clean up on error
      return [];
    }
  }

  /**
   * Validate RDF syntax before processing
   */
  private async validateRDFSyntax(content: string, format?: string): Promise<RDFValidationResult> {
    // Auto-detect format if not specified or is 'auto'
    const detectedFormat = (!format || format === 'auto') ? detectRDFFormat(content) : format;
    
    
    switch (detectedFormat) {
      case 'rdfxml':
        return this.validateRDFXMLSyntax(content);
      case 'jsonld':
        return this.validateJSONLDSyntax(content);
      case 'ntriples':
        return this.validateNTriplesSyntax(content);
      case 'turtle':
      default:
        return this.validateTurtleSyntax(content);
    }
  }

  /**
   * Validate RDF/XML syntax using proper RDF/XML parser
   */
  private async validateRDFXMLSyntax(content: string): Promise<RDFValidationResult> {
    return new Promise((resolve) => {
      try {
        const parser = new RdfXmlParser();
        let hasError = false;
        let errorMessage = '';
        let lineNumber = 0;
        let quadCount = 0;

        parser.on('data', () => {
          quadCount++;
        });

        parser.on('error', (error: any) => {
          if (!hasError) {
            hasError = true;
            errorMessage = error.message || 'RDF/XML parsing error';
            
            // Try to extract line number from error
            const lineMatch = errorMessage.match(/line[:\s]+(\d+)/i) || 
                             errorMessage.match(/position[:\s]+(\d+)/i);
            if (lineMatch) {
              lineNumber = parseInt(lineMatch[1], 10);
            }
            
            console.error(`❌ RDF/XML Syntax Error at line ${lineNumber}: ${errorMessage}`);
            resolve({ valid: false, error: errorMessage, lineNumber });
          }
        });

        parser.on('end', () => {
          if (!hasError) {
            console.debug(`✅ RDF/XML syntax validation passed (${quadCount} triples parsed)`);
            resolve({ valid: true });
          }
        });

        // Parse the content
        parser.write(content);
        parser.end();

      } catch (error: any) {
        console.error(`❌ RDF/XML Parsing Exception:`, error);
        resolve({ 
          valid: false, 
          error: error.message || 'Failed to parse RDF/XML content',
          lineNumber: 0
        });
      }
    });
  }

  /**
   * Validate Turtle syntax using N3Parser
   */
  private async validateTurtleSyntax(content: string): Promise<RDFValidationResult> {
    return new Promise((resolve) => {
      const parser = new N3Parser({ format: 'text/turtle' });
      let hasError = false;
      let errorMessage = '';
      let lineNumber = 0;

      try {
        parser.parse(content, (error, quad, prefixes) => {
          if (error && !hasError) {
            hasError = true;
            errorMessage = error.message || 'Unknown parsing error';
            
            // Extract line number from error message if available
            const lineMatch = errorMessage.match(/line (\d+)/i);
            if (lineMatch) {
              lineNumber = parseInt(lineMatch[1], 10);
            }
            
            console.error(`❌ Turtle Syntax Error at line ${lineNumber}: ${errorMessage}`);
            resolve({ valid: false, error: errorMessage, lineNumber });
          } else if (!quad && !hasError) {
            // End of parsing - success
            resolve({ valid: true });
          }
        });
      } catch (error: any) {
        console.error(`❌ Turtle Parsing Exception:`, error);
        resolve({ 
          valid: false, 
          error: error.message || 'Failed to parse Turtle content',
          lineNumber: 0
        });
      }
    });
  }

  /**
   * Validate N-Triples syntax using N3Parser
   */
  private async validateNTriplesSyntax(content: string): Promise<RDFValidationResult> {
    return new Promise((resolve) => {
      const parser = new N3Parser({ format: 'application/n-triples' });
      let hasError = false;
      let errorMessage = '';
      let lineNumber = 0;

      try {
        parser.parse(content, (error, quad, prefixes) => {
          if (error && !hasError) {
            hasError = true;
            errorMessage = error.message || 'Unknown parsing error';
            
            // Extract line number from error message if available
            const lineMatch = errorMessage.match(/line (\d+)/i);
            if (lineMatch) {
              lineNumber = parseInt(lineMatch[1], 10);
            }
            
            console.error(`❌ N-Triples Syntax Error at line ${lineNumber}: ${errorMessage}`);
            resolve({ valid: false, error: errorMessage, lineNumber });
          } else if (!quad && !hasError) {
            // End of parsing - success
            resolve({ valid: true });
          }
        });
      } catch (error: any) {
        console.error(`❌ N-Triples Parsing Exception:`, error);
        resolve({ 
          valid: false, 
          error: error.message || 'Failed to parse N-Triples content',
          lineNumber: 0
        });
      }
    });
  }

  /**
   * Validate JSON-LD syntax specifically
   */
  private async validateJSONLDSyntax(content: string): Promise<RDFValidationResult> {
    try {
      // First check if it's valid JSON
      const parsed = JSON.parse(content);
      
      // Basic JSON-LD structure validation
      if (typeof parsed !== 'object' || parsed === null) {
        return {
          valid: false,
          error: 'JSON-LD must be a JSON object or array',
          lineNumber: 1
        };
      }

      // For more thorough validation, we could use a JSON-LD library
      // but for now, valid JSON that's an object is considered valid JSON-LD
      console.debug(`✅ JSON-LD syntax validation passed`);
      return { valid: true };
      
    } catch (error: any) {
      // Parse JSON error message to extract line number
      const lineMatch = error.message.match(/line (\d+)/i) || 
                       error.message.match(/position (\d+)/i);
      let lineNumber = 0;
      
      if (lineMatch) {
        const position = parseInt(lineMatch[1], 10);
        // Rough estimation of line number from position
        lineNumber = content.substring(0, position).split('\n').length;
      }

      return {
        valid: false,
        error: `JSON syntax error: ${error.message}`,
        lineNumber
      };
    }
  }

  /**
   * Parse RDF content into N3 Store
   */
  private async parseRDF(content: string, format?: string): Promise<N3Store> {
    return new Promise((resolve, reject) => {
      const store = new N3Store();
      
      // Map our RDFFormat to N3Parser format strings  
      const formatMap: Record<string, string> = {
        'turtle': 'text/turtle',
        'rdfxml': 'application/rdf+xml',
        'jsonld': 'application/ld+json',
        'ntriples': 'application/n-triples',
        'auto': 'text/turtle' // Default fallback
      };

      const parserFormat = format && formatMap[format] ? formatMap[format] : 'text/turtle';
      const parser = new N3Parser({ format: parserFormat });

      parser.parse(content, (error, quad, prefixes) => {
        if (error) {
          reject(error);
        } else if (quad) {
          store.addQuad(quad);
        } else {
          // End of parsing
          resolve(store);
        }
      });
    });
  }

  /**
   * Check if property exists in store
   */
  private hasProperty(store: N3Store, property: string, profile?: ValidationProfile): { found: boolean; values: string[] } {
    const quads = store.getQuads();
    const matchingQuads = quads.filter(quad => quad.predicate.value === property);
    const values: string[] = [];
    
    matchingQuads.forEach(quad => {
      const extractedValues = this.extractValuesFromQuad(quad, store, property, profile);
      values.push(...extractedValues);
    });

    // Remove duplicates
    const uniqueValues = values.filter((value, index) => values.indexOf(value) === index);

    return {
      found: matchingQuads.length > 0,
      values: uniqueValues
    };
  }

  /**
   * Extract values from a quad based on object type and profile
   */
  private extractValuesFromQuad(quad: any, store: N3Store, property: string, profile?: ValidationProfile): string[] {
    const values: string[] = [];

    switch (quad.object.termType) {
      case 'Literal':
        values.push(quad.object.value);
        break;
        
      case 'NamedNode':
        values.push(quad.object.value);
        // Extract nested properties for specific profiles
        if (profile === 'nti_risp') {
          values.push(...this.extractProfileSpecificProperties(quad.object, store, profile));
        }
        break;
        
      case 'BlankNode':
        const blankNodeValues = this.extractBlankNodeValues(quad.object, store, property, profile);
        values.push(...blankNodeValues);
        break;
        
      default:
        values.push(quad.object.value);
        break;
    }

    return values;
  }

  /**
   * Extract values from BlankNode based on profile
   */
  private extractBlankNodeValues(blankNode: any, store: N3Store, property: string, profile?: ValidationProfile): string[] {
    
    if (profile === 'nti_risp') {
      return this.extractNTIRISPBlankNodeValues(blankNode, store);
    } else {
      // For other profiles, return the BlankNode ID (existing behavior)
      return [blankNode.value];
    }
  }

  /**
   * Extract nested properties for specific profiles
   */
  private extractProfileSpecificProperties(node: any, store: N3Store, profile?: ValidationProfile): string[] {
    switch (profile) {
      case 'nti_risp':
        return this.extractNTIRISPProperties(node, store);
      
      // Future profiles can be added here
      case 'dcat_ap':
      case 'dcat_ap_es':
      default:
        return []; // No special extraction for other profiles
    }
  }

  /**
   * Extract properties for NTI-RISP profile (unified method)
   */
  private extractNTIRISPProperties(node: any, store: N3Store): string[] {
    return this.extractRDFProperties(node, store, [
      MQAService.RDF_URIS.RDFS_LABEL,
      MQAService.RDF_URIS.RDF_VALUE
    ], 'NTI-RISP');
  }

  /**
   * Extract values from BlankNode for NTI-RISP profile
   * Handles IMT (Internet Media Type) structures with rdfs:label and rdf:value
   */
  private extractNTIRISPBlankNodeValues(blankNode: any, store: N3Store): string[] {
    return this.extractNTIRISPProperties(blankNode, store);
  }

  /**
   * Generic method to extract RDF properties from a node
   */
  private extractRDFProperties(node: any, store: N3Store, propertyUris: string[], context: string = ''): string[] {
    const values: string[] = [];
    
    propertyUris.forEach(propertyUri => {
      const quads = store.getQuads().filter(q => 
        q.subject.equals(node) && 
        q.predicate.value === propertyUri
      );
      
      quads.forEach(quad => {
        if (quad.object.termType === 'Literal') {
          values.push(quad.object.value);
          //const propertyName = this.getPropertyDisplayName(propertyUri);
          //console.debug(`Found ${propertyName} from ${context}: ${quad.object.value}`);
        }
      });
    });

    return values;
  }

  /**
   * Get display name for RDF property URI
   */
  private getPropertyDisplayName(propertyUri: string): string {
    const propertyNames: { [key: string]: string } = {
      [MQAService.RDF_URIS.RDFS_LABEL]: 'rdfs:label',
      [MQAService.RDF_URIS.RDF_VALUE]: 'rdf:value',
      [MQAService.RDF_URIS.RDF_TYPE]: 'rdf:type'
    };
    
    return propertyNames[propertyUri] || propertyUri.split('#').pop() || propertyUri;
  }

  /**
   * Get vocabulary metric information for vocabulary-based metrics
   */
  private getVocabularyMetricInfo(metricId: string): { baseProperty: string; vocabularyName: string } | null {
    const vocabularyMetrics: { [key: string]: { baseProperty: string; vocabularyName: string } } = {
      'dct_format_vocabulary': { baseProperty: 'dct:format', vocabularyName: 'file_types' },
      'dcat_media_type_vocabulary': { baseProperty: 'dcat:mediaType', vocabularyName: 'media_types' },
      'dct_format_vocabulary_nti_risp': { baseProperty: 'dct:format', vocabularyName: 'file_types' },
      'dcat_media_type_vocabulary_nti_risp': { baseProperty: 'dcat:mediaType', vocabularyName: 'media_types' },
      'dct_format_nonproprietary': { baseProperty: 'dct:format', vocabularyName: 'non_proprietary' },
      'dct_format_machine_readable': { baseProperty: 'dct:format', vocabularyName: 'machine_readable' },
      'dct_license_vocabulary': { baseProperty: 'dct:license', vocabularyName: 'licenses' },
      'dct_access_rights_vocabulary': { baseProperty: 'dct:accessRights', vocabularyName: 'access_rights' }
    };
    
    return vocabularyMetrics[metricId] || null;
  }

  /**
   * Determine entity type for a specific metric
   */
  private getMetricEntityType(metricId: string): 'Dataset' | 'Distribution' | 'Catalog' | 'Multi' {
    // Metrics that apply to multiple entity types simultaneously
    const multiEntityMetrics = [
      'dct_issued', 'dct_modified', 'dct_title', 'dct_description'
    ];
    
    // Metrics that apply to Datasets only
    const datasetMetrics = [
      'dcat_keyword', 'dcat_theme', 'dct_spatial', 'dct_temporal',
      'dct_creator', 'dct_language', 'dcat_contact_point', 
      'dct_access_rights', 'dcat_ap_compliance', 'dcat_ap_es_compliance', 
      'nti_risp_compliance', 'dct_publisher', 'dct_access_rights_vocabulary', 'dct_license_nti_risp'
    ];
    
    // Metrics that apply to Distributions only
    const distributionMetrics = [
      'dcat_access_url', 'dcat_download_url', 'dct_format', 'dcat_media_type',
      'dcat_byte_size', 'dct_format_vocabulary', 'dct_format_machine_readable',
      'dct_format_vocabulary_nti_risp', 'dcat_media_type_vocabulary_nti_risp',
      'dcat_media_type_vocabulary', 'dct_format_nonproprietary',
      'dcat_access_url_status', 'dcat_download_url_status', 'dct_license',
      'dct_license_vocabulary'
    ];
    
    // Metrics that apply to Catalogs only
    const catalogMetrics = [
      // Catalog-specific metrics would go here
    ];
    
    // Priority classification
    if (multiEntityMetrics.includes(metricId)) return 'Multi';
    if (distributionMetrics.includes(metricId)) return 'Distribution';
    if (datasetMetrics.includes(metricId)) return 'Dataset';
    return 'Catalog'; // Default fallback
  }

  /**
   * Get URI for entity type
   */
  private getEntityTypeURI(entityType: 'Dataset' | 'Distribution' | 'Catalog'): string {
    const typeMap = {
      'Dataset': 'http://www.w3.org/ns/dcat#Dataset',
      'Distribution': 'http://www.w3.org/ns/dcat#Distribution',
      'Catalog': 'http://www.w3.org/ns/dcat#Catalog'
    };
    
    return typeMap[entityType];
  }

  /**
   * Count total entities of a specific type in the RDF store
   */
  private countEntitiesByType(store: N3Store, entityType: 'Dataset' | 'Distribution' | 'Catalog'): number {
    const typeURI = this.getEntityTypeURI(entityType);
    const typeQuads = store.getQuads().filter(quad => 
      quad.predicate.value === MQAService.RDF_URIS.RDF_TYPE && 
      quad.object.value === typeURI
    );
    
    const count = typeQuads.length;
    //console.debug(`Found ${count} entities of type ${entityType}`);
    
    return count;
  }

  /**
   * Count entities that comply with a specific metric property
   */
  private countCompliantEntities(
    store: N3Store, 
    property: string, 
    entityType: 'Dataset' | 'Distribution' | 'Catalog',
    profile: ValidationProfile
  ): number {
    const typeURI = this.getEntityTypeURI(entityType);
    const fullProperty = this.expandProperty(property);
    
    // Get all entities of the specified type
    const entityQuads = store.getQuads().filter(quad => 
      quad.predicate.value === MQAService.RDF_URIS.RDF_TYPE && 
      quad.object.value === typeURI
    );
    
    let compliantCount = 0;
    
    entityQuads.forEach(entityQuad => {
      const entityURI = entityQuad.subject;
      
      // Check if this entity has the required property
      const propertyQuads = store.getQuads().filter(quad => 
        quad.subject.equals(entityURI) && 
        quad.predicate.value === fullProperty
      );
      
      if (propertyQuads.length > 0) {
        // For some metrics, we need to validate the property values
        const hasValidValue = this.validatePropertyValues(propertyQuads, property, store, profile);
        if (hasValidValue) {
          compliantCount++;
        }
      }
    });
    
    console.debug(`✅ ${compliantCount}/${entityQuads.length} ${entityType} entities comply with ${property}`);
    
    return compliantCount;
  }

  /**
   * Count entities that comply with vocabulary-based metrics
   * For vocabulary metrics, we need to evaluate ALL entities and check if their values are in vocabulary
   */
  private async countVocabularyCompliantEntities(
    store: N3Store,
    baseProperty: string, // e.g., 'dct:format'
    vocabularyName: string, // e.g., 'non_proprietary' 
    entityType: 'Dataset' | 'Distribution' | 'Catalog',
    profile: ValidationProfile
  ): Promise<number> {
    const typeURI = this.getEntityTypeURI(entityType);
    const fullProperty = this.expandProperty(baseProperty);
    
    // Get all entities of the specified type
    const entityQuads = store.getQuads().filter(quad => 
      quad.predicate.value === MQAService.RDF_URIS.RDF_TYPE && 
      quad.object.value === typeURI
    );
    
    let compliantCount = 0;
    
    for (const entityQuad of entityQuads) {
      const entityURI = entityQuad.subject;
      
      // Check if this entity has the base property
      const propertyQuads = store.getQuads().filter(quad => 
        quad.subject.equals(entityURI) && 
        quad.predicate.value === fullProperty
      );
      
      if (propertyQuads.length > 0) {
        // Extract values from property
        const values: string[] = [];
        propertyQuads.forEach(quad => {
          const extractedValues = this.extractValuesFromQuad(quad, store, baseProperty, profile);
          values.push(...extractedValues);
        });
        
        // Filter valid values
        const validValues = values.filter(value => value && value.trim().length > 0);
        
        if (validValues.length > 0) {
          // Check if any value is in the vocabulary
          const isInVocabulary = await this.checkVocabularyMatch(validValues, vocabularyName);
          if (isInVocabulary) {
            compliantCount++;
          }
        }
      }
      // Note: Entities WITHOUT the base property are counted as non-compliant (0 points)
      // This reflects that they don't meet the vocabulary requirement
    }
    
    console.debug(`🏷️ ${compliantCount}/${entityQuads.length} ${entityType} entities have valid ${vocabularyName} vocabulary values for ${baseProperty}`);
    
    return compliantCount;
  }

  /**
   * Validate if property values meet metric requirements
   */
  private validatePropertyValues(
    propertyQuads: any[], 
    property: string, 
    store: N3Store, 
    profile: ValidationProfile
  ): boolean {
    // For most metrics, presence is enough
    // But for specific cases, we might need value validation
    
    // Extract values for validation
    const values: string[] = [];
    propertyQuads.forEach(quad => {
      const extractedValues = this.extractValuesFromQuad(quad, store, property, profile);
      values.push(...extractedValues);
    });
    
    // Filter out empty values
    const validValues = values.filter(value => value && value.trim().length > 0);
    
    return validValues.length > 0;
  }

  /**
   * Evaluate multi-entity metrics (those that apply to both Datasets and Distributions)
   */
  private evaluateMultiEntityMetric(
    store: N3Store,
    property: string,
    profile: ValidationProfile
  ): { totalEntities: number; compliantEntities: number; datasetStats: { total: number; compliant: number }; distributionStats: { total: number; compliant: number } } {
    // Count datasets
    const datasetTotal = this.countEntitiesByType(store, 'Dataset');
    const datasetCompliant = this.countCompliantEntities(store, property, 'Dataset', profile);
    
    // Count distributions
    const distributionTotal = this.countEntitiesByType(store, 'Distribution');
    const distributionCompliant = this.countCompliantEntities(store, property, 'Distribution', profile);
    
    const totalEntities = datasetTotal + distributionTotal;
    const compliantEntities = datasetCompliant + distributionCompliant;
    
    //console.debug(`🔄 Multi-entity metric evaluation: ${compliantEntities}/${totalEntities} total (Datasets: ${datasetCompliant}/${datasetTotal}, Distributions: ${distributionCompliant}/${distributionTotal})`);
    
    return {
      totalEntities,
      compliantEntities,
      datasetStats: { total: datasetTotal, compliant: datasetCompliant },
      distributionStats: { total: distributionTotal, compliant: distributionCompliant }
    };
  }

  /**
   * Check if value is in vocabulary (deprecated, use checkVocabularyMatch instead)
   */
  private async isInVocabulary(value: string, vocabularyName: string): Promise<boolean> {
    console.warn(`⚠️ isInVocabulary is deprecated. Use checkVocabularyMatch instead.`);
    return this.checkVocabularyMatch([value], vocabularyName);
  }

  /**
   * Evaluate a single metric with proportional scoring
   */
  private async evaluateMetric(
    store: N3Store, 
    metricConfig: any, 
    profile: ValidationProfile,
    category: string
  ): Promise<QualityMetric> {
    const { id, weight, property } = metricConfig;
    const label = this.getMetricLabel(id);
    
    // Determine entity type for this metric
    const entityType = this.getMetricEntityType(id);
    
    let score = 0;
    let found = false;
    let values: string[] = [];
    let compliantEntities = 0;
    let compliancePercentage = 0;
    let totalEntities = 0;
    let datasetStats: { total: number; compliant: number } | undefined;
    let distributionStats: { total: number; compliant: number } | undefined;

    try {
      if (entityType === 'Multi') {
        // Handle multi-entity metrics (Datasets + Distributions)
        const multiStats = this.evaluateMultiEntityMetric(store, property, profile);
        totalEntities = multiStats.totalEntities;
        compliantEntities = multiStats.compliantEntities;
        datasetStats = multiStats.datasetStats;
        distributionStats = multiStats.distributionStats;
        
        if (totalEntities === 0) {
          //console.debug(`⚠️ No Dataset or Distribution entities found for multi-entity metric ${id}`);
          
          return {
            id,
            name: label.en || id,
            score: 0,
            maxScore: weight,
            weight,
            description: label.es || label.en || id,
            category: category as any,
            property,
            found: false,
            value: `No Dataset or Distribution entities found`,
            entityType,
            totalEntities: 0,
            compliantEntities: 0,
            compliancePercentage: 0,
            datasetEntities: datasetStats,
            distributionEntities: distributionStats
          };
        }
      } else {
        // Handle single-entity metrics
        totalEntities = this.countEntitiesByType(store, entityType as 'Dataset' | 'Distribution' | 'Catalog');
        
        if (totalEntities === 0) {
          //console.debug(`⚠️ No ${entityType} entities found for metric ${id}`);
          
          return {
            id,
            name: label.en || id,
            score: 0,
            maxScore: weight,
            weight,
            description: label.es || label.en || id,
            category: category as any,
            property,
            found: false,
            value: `No ${entityType} entities found`,
            entityType,
            totalEntities: 0,
            compliantEntities: 0,
            compliancePercentage: 0
          };
        }
        
        // Check if this is a vocabulary-based metric
        const vocabularyMetricInfo = this.getVocabularyMetricInfo(id);
        
        if (vocabularyMetricInfo) {
          // Use special vocabulary evaluation
          compliantEntities = await this.countVocabularyCompliantEntities(
            store, 
            vocabularyMetricInfo.baseProperty, 
            vocabularyMetricInfo.vocabularyName, 
            entityType as 'Dataset' | 'Distribution' | 'Catalog', 
            profile
          );
        } else if (id === 'dcat_access_url_status' || id === 'dcat_downloadURL_status') {
          // Special handling for HTTP status check metrics
          compliantEntities = await this.countHttpStatusCompliantEntities(
            store, 
            property, 
            entityType as 'Dataset' | 'Distribution' | 'Catalog', 
            profile
          );
        } else {
          // Count compliant entities for regular single-entity metric
          compliantEntities = this.countCompliantEntities(store, property, entityType as 'Dataset' | 'Distribution' | 'Catalog', profile);
        }
      }
      
      found = compliantEntities > 0;
      
      // Calculate proportional score
      const proportionalRatio = compliantEntities / totalEntities;
      score = proportionalRatio * weight;
      compliancePercentage = proportionalRatio * 100;

      // Get sample values for display (optional, for backwards compatibility)
      if (found) {
        const fullProperty = this.expandProperty(property);
        const propertyCheck = this.hasProperty(store, fullProperty, profile);
        values = propertyCheck.values.slice(0, 3); // Limit to 3 examples
      }

      //console.debug(`Metric ${id}: ${compliantEntities}/${totalEntities} ${entityType} entities comply (${compliancePercentage.toFixed(1)}%)`);

    } catch (error) {
      console.warn(`Warning evaluating metric ${id}:`, error);
      score = 0;
      compliantEntities = 0;
      compliancePercentage = 0;
    }

    // Prepare descriptive value showing compliance ratio
    let valueDescription: string;
    
    if (entityType === 'Multi') {
      const datasetPercent = datasetStats!.total > 0 ? ((datasetStats!.compliant / datasetStats!.total) * 100).toFixed(1) : '0';
      const distributionPercent = distributionStats!.total > 0 ? ((distributionStats!.compliant / distributionStats!.total) * 100).toFixed(1) : '0';
      
      valueDescription = totalEntities > 0 
        ? `${compliantEntities}/${totalEntities} entities comply (${compliancePercentage.toFixed(1)}%) - Datasets: ${datasetStats!.compliant}/${datasetStats!.total} (${datasetPercent}%), Distributions: ${distributionStats!.compliant}/${distributionStats!.total} (${distributionPercent}%)`
        : `No Dataset or Distribution entities found`;
    } else {
      valueDescription = totalEntities > 0 
        ? `${compliantEntities}/${totalEntities} ${entityType}s comply (${compliancePercentage.toFixed(1)}%)`
        : `No ${entityType} entities found`;
    }

    const result: any = {
      id,
      name: label.en || id,
      score: Math.round(score * 100) / 100, // Round to 2 decimal places
      maxScore: weight,
      weight,
      description: label.es || label.en || id,
      category: category as any,
      property,
      found,
      value: valueDescription,
      // Proportional evaluation fields
      entityType,
      totalEntities,
      compliantEntities,
      compliancePercentage: Math.round(compliancePercentage * 100) / 100
    };
    
    // Add multi-entity specific fields if applicable
    if (entityType === 'Multi') {
      result.datasetEntities = datasetStats;
      result.distributionEntities = distributionStats;
    }
    
    return result;
  }

  /**
   * Calculate score for a specific metric based on its type and values
   */
  private async calculateMetricScore(metricId: string, values: string[], maxWeight: number, profile?: ValidationProfile): Promise<number> {
    if (!values || values.length === 0) {
      return 0;
    }

    switch (metricId) {
      // Format-related metrics
      case 'dct_format_vocabulary':
        return await this.checkVocabularyMatch(values, 'file_types') ? maxWeight : 0;
        
      case 'dcat_media_type_vocabulary':
        return await this.checkVocabularyMatch(values, 'media_types') ? maxWeight : 0;

      case 'dcat_mediaType':
        return await this.checkVocabularyMatch(values, 'media_types') ? maxWeight : 0;

      // NTI-RISP specific vocabulary metrics
      case 'dct_format_vocabulary_nti_risp':
        //console.debug(`🏷️ Evaluating NTI-RISP format vocabulary for values:`, values);
        return await this.checkNTIRISPVocabularyMatch(values, 'file_types', profile) ? maxWeight : 0;
        
      case 'dcat_media_type_vocabulary_nti_risp':
        //console.debug(`📱 Evaluating NTI-RISP media type vocabulary for values:`, values);
        return await this.checkNTIRISPVocabularyMatch(values, 'media_types', profile) ? maxWeight : 0;

      case 'dct_format_nonproprietary':
        return await this.checkVocabularyMatch(values, 'non_proprietary') ? maxWeight : 0;

      case 'dct_format_machine_readable':
        //console.debug(` Checking machine-readable formats for values:`, values);
        return await this.checkVocabularyMatch(values, 'machine_readable') ? maxWeight : 0;

      // License-related metrics
      case 'dct_license_vocabulary':
        return await this.checkVocabularyMatch(values, 'licenses') ? maxWeight : 0;

      // Access rights metrics
      case 'dct_access_rights_vocabulary':
        return await this.checkVocabularyMatch(values, 'access_rights') ? maxWeight : 0;

      // URL status checks - HTTP HEAD request validation
      case 'dcat_access_url_status':
      case 'dcat_downloadURL_status':
        if (!this.checkValidUrls(values)) return 0;
        const accessibilityResult = await this.checkURLAccessibility(values);
        return accessibilityResult.score * maxWeight;

      // Existence-based metrics (presence = full score)
      case 'dct_title':
      case 'dct_description': 
      case 'dcat_keyword':
      case 'dcat_theme':
      case 'dct_spatial':
      case 'dct_temporal':
      case 'dct_format':
      case 'dcat_accessURL':
      case 'dcat_downloadURL':
      case 'dct_license':
      case 'dct_license_nti_risp':
      case 'dct_access_rights':
      case 'dct_language':
      case 'dct_conformsTo':
      case 'dct_creator':
      case 'dct_publisher':
      case 'dct_contactPoint':
      case 'dcat_distribution':
      case 'dct_issued':
      case 'dct_modified':
        return maxWeight; // Full score for presence

      // Quality-based metrics (can have partial scores)
      case 'dct_title_length':
        return this.evaluateTextLength(values[0], 10, 100) * maxWeight;

      case 'dct_description_length':
        return this.evaluateTextLength(values[0], 50, 500) * maxWeight;

      default:
        // Default: full score for presence
        return maxWeight;
    }
  }

  /**
   * Check if any value matches entries in the specified vocabulary
   */
  private async checkVocabularyMatch(values: string[], vocabularyName: string): Promise<boolean> {
    const vocabulary = await this.loadVocabulary(vocabularyName);
    
    // Filter out empty or invalid values
    const validValues = values.filter(value => value && typeof value === 'string' && value.trim().length > 0);
    
    //console.debug(`Checking ${validValues.length} values against vocabulary '${vocabularyName}' (${vocabulary.length} entries)`);
    
    const result = validValues.some(value => {
      const match = vocabulary.some(item => {
        // Compare with URI (primary field in JSONL files)
        const uriMatch = item.uri && this.normalizeValue(item.uri) === this.normalizeValue(value);
        // Compare with legacy value field (backwards compatibility)
        const valueMatch = item.value && this.normalizeValue(item.value) === this.normalizeValue(value);
        // Compare with label (for human-readable matching)
        const labelMatch = item.label && this.normalizeValue(item.label) === this.normalizeValue(value);
        
        // Special handling for media types: extract MIME type from IANA URIs
        let mimeTypeMatch = false;
        if (vocabularyName === 'media_types' && item.uri) {
          const mimeTypeRegex = /http:\/\/www\.iana\.org\/assignments\/media-types\/(.+)/;
          const match = item.uri.match(mimeTypeRegex);
          if (match) {
            const extractedMimeType = match[1];
            mimeTypeMatch = this.normalizeValue(extractedMimeType) === this.normalizeValue(value);
          }
        }
        
        if (uriMatch || valueMatch || labelMatch || mimeTypeMatch) {
          //console.debug(`✅ Found match for '${value}' in vocabulary '${vocabularyName}': ${item.uri || item.value} (${item.label})`);
          return true;
        }
        return false;
      });
      
      if (match) {
        //console.debug(`✅ Found match for value in vocabulary '${vocabularyName}'`);
      } else {
        //console.debug(`❌ No match found for value in vocabulary '${vocabularyName}'`);
      }
      
      return match;
    });
    
    //console.debug(`🎯 Vocabulary match result for '${vocabularyName}': ${result}`);
    return result;
  }

  /**
   * Check vocabulary match specifically for NTI-RISP metrics
   * This method is optimized for IMT (Internet Media Type) structures with BlankNodes
   */
  private async checkNTIRISPVocabularyMatch(values: string[], vocabularyName: string, profile?: ValidationProfile): Promise<boolean> {
    if (profile !== 'nti_risp') {
      // Fall back to standard vocabulary matching for non-NTI-RISP profiles
      return this.checkVocabularyMatch(values, vocabularyName);
    }

    //console.debug(`🏷️ NTI-RISP vocabulary check for '${vocabularyName}' with values:`, values);
    
    const vocabulary = await this.loadVocabulary(vocabularyName);
    
    // Filter out empty or invalid values
    const validValues = values.filter(value => value && typeof value === 'string' && value.trim().length > 0);
    
    //console.debug(`Checking ${validValues.length} NTI-RISP values against vocabulary '${vocabularyName}' (${vocabulary.length} entries)`);
    
    const result = validValues.some(value => {
      const match = vocabulary.some(item => {
        // Compare with URI (primary field in JSONL files)
        const uriMatch = item.uri && this.normalizeValue(item.uri) === this.normalizeValue(value);
        // Compare with legacy value field (backwards compatibility)
        const valueMatch = item.value && this.normalizeValue(item.value) === this.normalizeValue(value);
        // Compare with label (for human-readable matching - important for NTI-RISP)
        const labelMatch = item.label && this.normalizeValue(item.label) === this.normalizeValue(value);
        
        // Enhanced MIME type matching for NTI-RISP media types
        let mimeTypeMatch = false;
        if (vocabularyName === 'media_types' && item.uri) {
          const mimeTypeRegex = /http:\/\/www\.iana\.org\/assignments\/media-types\/(.+)/;
          const uriMatch = item.uri.match(mimeTypeRegex);
          if (uriMatch) {
            const extractedMimeType = uriMatch[1];
            mimeTypeMatch = this.normalizeValue(extractedMimeType) === this.normalizeValue(value);
          }
        }
        
        // Enhanced file type matching for NTI-RISP file formats
        let fileTypeMatch = false;
        if (vocabularyName === 'file_types') {
          // Check common format abbreviations (case insensitive)
          const normalizedValue = this.normalizeValue(value);
          const normalizedLabel = this.normalizeValue(item.label || '');
          const normalizedUri = this.normalizeValue(item.uri || '');
          
          // More restrictive matching: exact label match or exact extraction from URI
          fileTypeMatch = normalizedLabel === normalizedValue ||
                        // Extract file type from URI path (e.g., /file-type/CSV -> CSV)
                        normalizedUri.endsWith(`/file-type/${normalizedValue}`) ||
                        normalizedUri.endsWith(`/${normalizedValue}`) ||
                        // Allow exact URI matches
                        normalizedUri === normalizedValue;
          
          // Debug the comparison
          if (fileTypeMatch) {
            //console.debug(`🎯 Exact file type match: '${value}' matches '${item.label}' (URI: ${item.uri})`);
          }
        }
        
        if (uriMatch || valueMatch || labelMatch || mimeTypeMatch || fileTypeMatch) {
          //console.debug(`✅ NTI-RISP match found for '${value}' in vocabulary '${vocabularyName}': ${item.uri || item.value} (${item.label})`);
          return true;
        }
        return false;
      });
      
      if (match) {
        //console.debug(`✅ NTI-RISP vocabulary match found for value '${value}' in vocabulary '${vocabularyName}'`);
      } else {
        //console.debug(`❌ No NTI-RISP vocabulary match found for value '${value}' in vocabulary '${vocabularyName}'`);
      }
      
      return match;
    });
    
    //console.debug(`🎯 NTI-RISP vocabulary match result for '${vocabularyName}': ${result}`);
    return result;
  }

  /**
   * Check if values are valid URLs
   */
  private checkValidUrls(values: string[]): boolean {
    try {
      return values.every(value => {
        new URL(value);
        return true;
      });
    } catch {
      return false;
    }
  }

  /**
   * Evaluate text length quality (0-1 score)
   */
  private evaluateTextLength(text: string, minLength: number, idealLength: number): number {
    if (!text) return 0;
    const length = text.length;
    if (length < minLength) return 0.5; // Too short
    if (length >= idealLength) return 1.0; // Ideal or longer
    return 0.5 + (length - minLength) / (idealLength - minLength) * 0.5; // Partial score
  }

  /**
   * Normalize value for comparison
   */
  private normalizeValue(value: string | undefined | null): string {
    if (!value || typeof value !== 'string') {
      return '';
    }
    return value.toLowerCase().trim();
  }

  /**
   * Expand short property names to full URIs
   */
  private expandProperty(property: string): string {
    const prefixes: { [key: string]: string } = {
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
    };

    for (const [prefix, uri] of Object.entries(prefixes)) {
      if (property.startsWith(prefix)) {
        return property.replace(prefix, uri);
      }
    }

    // If already a full URI or no prefix found, return as is
    return property;
  }

  /**
   * Get metric label from translations
   */
  private getMetricLabel(metricId: string): { en: string; es: string } {
    try {
      // Use the imported i18n instance directly
      const enLabel = i18n.t(`metrics.specific.${metricId}`, { lng: 'en' });
      const esLabel = i18n.t(`metrics.specific.${metricId}`, { lng: 'es' });

      // Check if translation was found (i18n returns the key if not found)
      if (enLabel && !enLabel.startsWith('metrics.specific.')) {
        return { en: enLabel, es: esLabel };
      }
    } catch (error) {
      //console.debug('Failed to get translation for metric:', metricId, error);
    }
    
    // Fallback to metric ID if no translation found
    console.warn(`Missing translation for metric: ${metricId}`);
    return { en: metricId, es: metricId };
  }

  /**
   * Calculate quality with SHACL validation included
   */
  public async calculateQualityWithSHACL(
    content: string, 
    profileSelection: ProfileSelection | ValidationProfile,
    format?: string,
    skipSyntaxValidation?: boolean
  ): Promise<{ quality: QualityResult; shaclReport: SHACLReport }> {
    try {
      // Extract profile string from ProfileSelection or use as-is if it's a string
      const profile: ValidationProfile = typeof profileSelection === 'string' 
        ? profileSelection 
        : profileSelection.profile;
        
      console.debug(`Starting MQA+SHACL evaluation for profile: ${profile}`);

      // Validate RDF syntax first (unless already validated)
      if (!skipSyntaxValidation) {
        console.debug(`Validating RDF syntax...`);
        const syntaxValidation = await this.validateRDFSyntax(content, format);
        
        if (!syntaxValidation.valid) {
          const errorMsg = `RDF Syntax Error${syntaxValidation.lineNumber ? ` at line ${syntaxValidation.lineNumber}` : ''}: ${syntaxValidation.error}`;
          console.error(`❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        console.debug(`✅ RDF syntax validation passed`);
      } else {
        console.debug(`⏭️ Skipping syntax validation (already validated)`);
      }

      // Run standard MQA evaluation
      const quality = await this.calculateQuality(content, profile, format, true); // Skip syntax validation in calculateQuality too

      // Run SHACL validation
      const shaclReport = await RDFService.validateWithSHACL(content, profile);

      // Update compliance metric if it exists
      const complianceMetric = quality.metrics.find(m => m.id.includes('compliance'));
      if (complianceMetric) {
        const complianceScore = RDFService.calculateComplianceScore(shaclReport);
        complianceMetric.score = Math.round((complianceScore / 100) * complianceMetric.maxScore);
        complianceMetric.found = shaclReport.conforms;
        complianceMetric.value = shaclReport.conforms ? 'compliant' : 'non-compliant';

        // Recalculate totals
        const totalScore = quality.metrics.reduce((sum, m) => sum + m.score, 0);
        const maxScore = quality.metrics.reduce((sum, m) => sum + m.maxScore, 0);
        const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

        quality.totalScore = totalScore;
        quality.percentage = percentage;

        // Update category totals
        for (const [, categoryData] of Object.entries(quality.byCategory)) {
          const categoryMetrics = categoryData.metrics;
          const categoryScore = categoryMetrics.reduce((sum: number, m: QualityMetric) => sum + m.score, 0);
          const categoryMaxScore = categoryMetrics.reduce((sum: number, m: QualityMetric) => sum + m.maxScore, 0);
          
          categoryData.score = categoryScore;
          categoryData.percentage = categoryMaxScore > 0 ? (categoryScore / categoryMaxScore) * 100 : 0;
        }
      }

      console.debug(`✅ MQA+SHACL evaluation completed. SHACL conforms: ${shaclReport.conforms}`);

      return { quality, shaclReport };

    } catch (error) {
      console.error('❌ MQA+SHACL evaluation failed:', error);
      throw error;
    }
  }

  /**
   * Calculate quality assessment for RDF content
   */
  public async calculateQuality(
    content: string, 
    profile: ValidationProfile, 
    format?: string, 
    skipSyntaxValidation?: boolean
  ): Promise<QualityResult> {
    try {
      console.debug(`Starting MQA evaluation for profile: ${profile}`);
      
      // Validate RDF syntax first (unless already validated)
      if (!skipSyntaxValidation) {
        console.debug(`Validating RDF syntax...`);
        const syntaxValidation = await this.validateRDFSyntax(content, format);
        
        if (!syntaxValidation.valid) {
          const errorMsg = `RDF Syntax Error${syntaxValidation.lineNumber ? ` at line ${syntaxValidation.lineNumber}` : ''}: ${syntaxValidation.error}`;
          console.error(`❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        console.debug(`✅ RDF syntax validation passed`);
      } else {
        console.debug(`⏭️ Skipping syntax validation (already validated)`);
      }
      
      // Parse RDF content
      const store = await this.parseRDF(content, format);
      console.debug(`Parsed RDF store with ${store.size} triples`);

      // Check if RDF content is empty or contains no meaningful data
      if (store.size === 0) {
        console.warn(`No RDF data found for quality evaluation. Content appears to be empty or contains only comments/whitespace.`);
        
        // Return empty quality result with zero scores for empty content
        const allMetrics: QualityMetric[] = [];
        const byCategory: any = {};
        
        // Get profile configuration to create empty metrics structure
        const profileConfig = this.config.profiles[profile];
        const metricsConfig = this.config.profile_metrics[profile];

        if (!profileConfig || !metricsConfig) {
          throw new Error(`Profile ${profile} not found in configuration`);
        }

        // Create zero-score metrics for all categories
        for (const [category, metrics] of Object.entries(metricsConfig)) {
          const categoryMetrics: QualityMetric[] = [];
          
          for (const metricConfig of metrics) {
            const metricLabel = this.getMetricLabel(metricConfig.id);
            const metric: QualityMetric = {
              id: metricConfig.id,
              name: metricLabel.es || metricLabel.en || metricConfig.id, // Use Spanish first, fallback to English or ID
              property: metricConfig.property,
              score: 0, // Zero score for empty content
              maxScore: metricConfig.weight,
              weight: metricConfig.weight,
              found: false,
              value: undefined, // Use undefined instead of null
              description: `No data available to evaluate ${metricConfig.property} - content is empty`,
              category: category as any,
              entityType: this.getMetricEntityType(metricConfig.id),
              totalEntities: 0,
              compliantEntities: 0,
              compliancePercentage: 0
            };
            categoryMetrics.push(metric);
            allMetrics.push(metric);
          }

          const categoryScore = 0; // Zero score for empty content
          const categoryMaxScore = categoryMetrics.reduce((sum, m) => sum + m.maxScore, 0);
          
          byCategory[category] = {
            score: categoryScore,
            maxScore: categoryMaxScore,
            percentage: 0,
            metrics: categoryMetrics
          };
        }

        console.log(`✅ MQA evaluation completed for empty content: 0/${allMetrics.reduce((sum, m) => sum + m.maxScore, 0)} (0%)`);

        return {
          totalScore: 0,
          maxScore: allMetrics.reduce((sum, m) => sum + m.maxScore, 0),
          percentage: 0,
          metrics: allMetrics,
          byCategory
        };
      }

      // Get profile configuration
      const profileConfig = this.config.profiles[profile];
      const metricsConfig = this.config.profile_metrics[profile];

      if (!profileConfig || !metricsConfig) {
        throw new Error(`Profile ${profile} not found in configuration`);
      }

      // Evaluate metrics by category
      const allMetrics: QualityMetric[] = [];
      const byCategory: any = {};

      for (const [category, metrics] of Object.entries(metricsConfig)) {
        //console.debug(` Evaluating ${metrics.length} metrics for category: ${category}`);
        
        const categoryMetrics: QualityMetric[] = [];
        
        for (const metricConfig of metrics) {
          const metric = await this.evaluateMetric(store, metricConfig, profile, category);
          categoryMetrics.push(metric);
          allMetrics.push(metric);
        }

        const categoryScore = categoryMetrics.reduce((sum, m) => sum + m.score, 0);
        const categoryMaxScore = categoryMetrics.reduce((sum, m) => sum + m.maxScore, 0);
        
        byCategory[category] = {
          score: categoryScore,
          maxScore: categoryMaxScore,
          percentage: categoryMaxScore > 0 ? (categoryScore / categoryMaxScore) * 100 : 0,
          metrics: categoryMetrics
        };
      }

      // Calculate totals
      const totalScore = allMetrics.reduce((sum, m) => sum + m.score, 0);
      const maxScore = allMetrics.reduce((sum, m) => sum + m.maxScore, 0);
      const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

      console.log(`✅ MQA evaluation completed: ${Math.round(totalScore)}/${maxScore} (${percentage.toFixed(1)}%)`);

      return {
        totalScore,
        maxScore,
        percentage,
        metrics: allMetrics,
        byCategory
      };

    } catch (error) {
      console.error('❌ MQA evaluation failed:', error);
      throw error;
    }
  }

  /**
   * Validate RDF syntax (public method) with automatic preprocessing
   */
  public async validateRDF(content: string, format?: string): Promise<RDFValidationResult> {

    
    try {
      // Apply preprocessing to fix common IRI issues before validation
      const { RDFService } = await import('./RDFService');
      const { processedContent, warnings } = RDFService.preprocessRdfForInvalidIRIs(content);
      
      // Display warnings if any IRI issues were found and fixed
      if (warnings.length > 0) {
        console.warn(`⚠️ RDF Preprocessing: Applied ${warnings.length} automatic correction(s) before syntax validation:`);
        warnings.forEach((warning: string) => console.warn(`   • ${warning}`));
        console.warn('⚠️ Note: Original RDF had syntax violations that were automatically corrected for validation.');
      }
      
      // Validate the preprocessed content
      const result = await this.validateRDFSyntax(processedContent, format);
      
      // Add warnings to the result if preprocessing was applied
      if (warnings.length > 0) {
        result.warnings = warnings;
        result.preprocessingApplied = true;
        
        if (result.valid) {
          console.info(`✅ RDF syntax validation passed after ${warnings.length} automatic correction(s)`);
        }
      }
      
      return result;
      
    } catch (preprocessError) {
      console.warn('⚠️ Preprocessing failed, attempting direct validation:', preprocessError);
      // Fallback to direct validation if preprocessing fails
      return await this.validateRDFSyntax(content, format);
    }
  }

  /**
   * Get profile information
   */
  public getProfileInfo(profile: ValidationProfile) {
    return this.config.profiles[profile];
  }

  /**
   * Check URL accessibility using multiple strategies for client-side validation
   * @param urls Array of URLs to check
   * @param maxSample Maximum number of URLs to sample (default: 20)
   * @returns Object with accessibility results and proportional score
   */
  public async checkURLAccessibility(urls: string[], maxSample: number = 20): Promise<{
    totalUrls: number;
    checkedUrls: number;
    accessibleUrls: number;
    successRate: number;
    score: number;
    details: Array<{ url: string; accessible: boolean; method: 'direct' | 'pattern' | 'failed' | 'proxy' | 'heuristic' | 'backend'; }>;
  }> {
    if (!urls || urls.length === 0) {
      return {
        totalUrls: 0,
        checkedUrls: 0,
        accessibleUrls: 0,
        successRate: 0,
        score: 0,
        details: []
      };
    }

    // Filter valid URLs
    const validUrls = urls.filter(url => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });

    if (validUrls.length === 0) {
      return {
        totalUrls: urls.length,
        checkedUrls: 0,
        accessibleUrls: 0,
        successRate: 0,
        score: 0,
        details: []
      };
    }

    // Sample URLs if more than maxSample
    let urlsToCheck = validUrls;
    if (validUrls.length > maxSample) {
      // Random sampling
      const shuffled = [...validUrls].sort(() => 0.5 - Math.random());
      urlsToCheck = shuffled.slice(0, maxSample);
      console.debug(`Sampling ${maxSample} URLs out of ${validUrls.length} for accessibility check`);
    }

    // Check if backend is available
    const isBackendAvailable = await backendService.isBackendAvailable();
    console.debug(`Backend availability for URL checking: ${isBackendAvailable}`);

    let accessibleCount = 0;
    const details: Array<{ url: string; accessible: boolean; method: 'direct' | 'pattern' | 'failed' | 'proxy' | 'heuristic' | 'backend'; }> = [];

    // OPTIMIZATION: Use batch validation if backend is available
    if (isBackendAvailable && urlsToCheck.length > 1) {
      console.debug(`Using batch validation for ${urlsToCheck.length} URLs`);
      try {
        const batchResults = await backendService.validateURLAccessibilityBatch(urlsToCheck);
        
        for (const url of urlsToCheck) {
          const result = batchResults[url];
          if (result && result.accessible) {
            accessibleCount++;
            details.push({ url, accessible: true, method: 'backend' });
          } else {
            // Fallback to heuristics for failed URLs
            const heuristicResult = this.enhancedUrlHeuristics(url);
            if (heuristicResult.accessible) {
              accessibleCount++;
              details.push({ url, accessible: true, method: 'heuristic' });
            } else {
              details.push({ url, accessible: false, method: 'failed' });
            }
          }
        }
      } catch (error) {
        console.warn('Batch validation failed, falling back to individual checks:', error);
        // Fall through to individual validation below
      }
    } else {
      // Individual URL validation (original code)
      for (const url of urlsToCheck) {
        let accessible = false;
        let method: 'direct' | 'pattern' | 'failed' | 'proxy' | 'heuristic' | 'backend' = 'failed';
        
        if (isBackendAvailable) {
          // Strategy 1: Use backend server for accurate validation (preferred when available)
          try {
            const backendResult = await backendService.validateURLAccessibility(url);
            accessible = backendResult.accessible;
            method = 'backend';
            
            if (!accessible && backendResult.error) {
              //console.debug(`Backend validation failed for ${url}: ${backendResult.error}`);
            }
          } catch (error) {
            console.warn(`Backend validation error for ${url}:`, error);
            // Fall through to heuristic methods if backend fails
          }
        }

        // Fallback strategies if backend not available or failed
        if (!accessible) {
          // Strategy 2: Enhanced heuristic analysis (faster and more reliable)
          const heuristicResult = this.enhancedUrlHeuristics(url);
          if (heuristicResult.accessible) {
            accessible = true;
            method = 'heuristic';
          } else {
            // Strategy 3: Try public CORS proxy services (only if heuristics fail)
            const proxyResult = await this.checkUrlViaProxy(url);
            if (proxyResult.accessible) {
              accessible = true;
              method = 'proxy';
            }
          }
        }
        
        if (accessible) accessibleCount++;
        details.push({ url, accessible, method });
      }
    }

    const successRate = urlsToCheck.length > 0 ? (accessibleCount / urlsToCheck.length) : 0;
    const methodSummary = this.getMethodSummary(details);
    console.info(`URL Accessibility Check: ${accessibleCount}/${urlsToCheck.length} accessible (${(successRate * 100).toFixed(1)}%) - Methods: ${methodSummary}`);

    return {
      totalUrls: urls.length,
      checkedUrls: urlsToCheck.length,
      accessibleUrls: accessibleCount,
      successRate,
      score: successRate,
      details
    };
  }

  /**
   * Get summary of methods used for URL accessibility checking
   */
  private getMethodSummary(details: Array<{ url: string; accessible: boolean; method: string; }>): string {
    const methodCounts = details.reduce((acc, detail) => {
      acc[detail.method] = (acc[detail.method] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(methodCounts)
      .map(([method, count]) => `${method}: ${count}`)
      .join(', ');
  }

  /**
   * Count entities that comply with HTTP status check metrics
   */
  private async countHttpStatusCompliantEntities(
    store: N3Store,
    property: string,
    entityType: 'Dataset' | 'Distribution' | 'Catalog',
    profile: ValidationProfile
  ): Promise<number> {
    const typeURI = this.getEntityTypeURI(entityType);
    const fullProperty = this.expandProperty(property);
    
    // Get all entities of the specified type
    const entityQuads = store.getQuads().filter(quad => 
      quad.predicate.value === MQAService.RDF_URIS.RDF_TYPE && 
      quad.object.value === typeURI
    );
    
    if (entityQuads.length === 0) {
      return 0;
    }

    // Collect all URLs from all entities
    const allUrls: string[] = [];
    entityQuads.forEach(entityQuad => {
      const entityURI = entityQuad.subject;
      
      // Get URLs from this entity
      const propertyQuads = store.getQuads().filter(quad => 
        quad.subject.equals(entityURI) && 
        quad.predicate.value === fullProperty
      );
      
      propertyQuads.forEach(quad => {
        const extractedValues = this.extractValuesFromQuad(quad, store, property, profile);
        allUrls.push(...extractedValues);
      });
    });

    if (allUrls.length === 0) {
      console.debug(`No URLs found for HTTP status check in ${entityType} entities`);
      return 0;
    }

    // Check accessibility of all URLs
    const accessibilityResult = await this.checkURLAccessibility(allUrls);
    
    // Calculate compliant entities proportionally
    // If we have 100 entities and 50% of URLs are accessible, then 50 entities are considered compliant
    const compliantEntities = Math.round(entityQuads.length * accessibilityResult.successRate);
    
    console.debug(`🌐 HTTP Status Check: ${accessibilityResult.accessibleUrls}/${accessibilityResult.checkedUrls} URLs accessible (${(accessibilityResult.successRate * 100).toFixed(1)}%) -> ${compliantEntities}/${entityQuads.length} entities compliant`);
    
    return compliantEntities;
  }



  /**
   * Check URL accessibility via public CORS proxy services
   */
  private async checkUrlViaProxy(url: string): Promise<{ accessible: boolean; proxy?: string; error?: string }> {
    // Skip proxy checks in GitHub Pages environment due to CORS limitations
    if (window.location.hostname.includes('github.io')) {
      console.info('ℹ️ GitHub Pages detected: Using heuristic analysis instead of proxy verification for URL accessibility');
      console.debug('🚫 Skipping proxy checks in GitHub Pages environment for:', url);
      return { accessible: false, error: 'GitHub Pages CORS limitations - using heuristic analysis' };
    }

    // Lista de proxies públicos gratuitos (con limitaciones)
    // Get CORS proxies from configuration
    const configProxies = backendService.getBackendConfig().cors_proxy.fallback_proxies;
    const publicProxies = configProxies.map(proxy => {
      if (proxy.includes('allorigins')) {
        return (url: string) => `${proxy}${encodeURIComponent(url)}`;
      } else if (proxy.includes('corsproxy.io')) {
        return (url: string) => `${proxy}${url}`;
      } else {
        return (url: string) => `${proxy}${url}`;
      }
    });

    for (let index = 0; index < publicProxies.length; index++) {
      const proxyFn = publicProxies[index];
      try {
        const proxyUrl = proxyFn(url);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // Reduced timeout for better performance

        
        const response = await fetch(proxyUrl, {
          method: 'HEAD', // Use HEAD instead of GET for faster response
          signal: controller.signal,
          headers: {
            'Accept': '*/*',
            'Cache-Control': 'no-cache'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          //console.debug(`✅ Proxy verification successful: ${url} via proxy ${index + 1}`);
          return { accessible: true, proxy: `proxy-${index + 1}` };
        }
      } catch (error: any) {
        //console.debug(`❌ Proxy ${index + 1} failed for ${url}:`, error?.message || 'Unknown error');
        // Don't break immediately, try next proxy
        continue;
      }
    }

    //console.debug(`🚫 All proxies failed for: ${url}`);
    return { accessible: false, error: 'All proxies failed or CORS blocked' };
  }

  /**
   * Enhanced heuristic analysis for URL accessibility
   */
  private enhancedUrlHeuristics(url: string): { accessible: boolean; confidence: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;
    const maxScore = 100;

    try {
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname.toLowerCase();
      const path = parsedUrl.pathname.toLowerCase();
      const extension = path.split('.').pop()?.toLowerCase() || '';
      
      // Factor 1: Protocolo seguro (+20 puntos)
      if (parsedUrl.protocol === 'https:') {
        score += 25;
        reasons.push('HTTPS protocol');
      }
      
      // Factor 2: Dominios gubernamentales y oficiales (+30 puntos)
      const officialDomains = [
        /\.gob\.es$/,
        /\.gov\./,
        /\.europa\.eu$/,
        /\.administracion(es)?\.gob\.es$/,
        /datos(abiertos)?\..*\.(gob|gov)$/,
        /catalog[ou]?\..*\.(gob|gov|eu)$/,
        /www\.ine\.es$/,
        /opendata\..*\.(gob|gov)$/
      ];
      
      if (officialDomains.some(pattern => pattern.test(domain))) {
        score += 30;
        reasons.push('Official government domain');
      }
      
      // Factor 3: Dominios de confianza (+25 puntos)
      const trustedDomains = [
        'github.com', 'raw.githubusercontent.com', 'gitlab.com',
        'zenodo.org', 'figshare.com', 'doi.org', 'dx.doi.org',
        'archive.org', 'web.archive.org', 'data.europa.eu',
        'publications.europa.eu', 'op.europa.eu'
      ];
      
      if (trustedDomains.some(trusted => domain.includes(trusted))) {
        score += 25;
        reasons.push('Trusted domain');
      }
      
      // Factor 4: Extensiones de archivo de datos (+15 puntos)
      const dataExtensions = ['csv', 'json', 'jsonld', 'xml', 'rdf', 'ttl', 'n3', 'xlsx', 'xls'];
      if (dataExtensions.includes(extension)) {
        score += 15;
        reasons.push(`Data file extension: ${extension.toUpperCase()}`);
      }
      
      // Factor 5: Patrones de ruta de datos (+10 puntos)
      const dataPathPatterns = [
        /\/download\//,
        /\/dataset\//,
        /\/resource\//,
        /\/files?\//,
        /\/data\//,
        /\/export\//,
        /\/api\//,
        /\/catalog\//,
        /\/opendata\//
      ];
      
      if (dataPathPatterns.some(pattern => pattern.test(path))) {
        score += 10;
        reasons.push('Data-like URL path');
      }
      
      // Penalizaciones
      const suspiciousPatterns = [
        /^\d+\.\d+\.\d+\.\d+/,  // IP address
        /localhost/,
        /127\.0\.0\.1/,
        /\.local$/,
        /\.test$/,
        /\.internal$/
      ];
      
      if (suspiciousPatterns.some(pattern => pattern.test(domain))) {
        score -= 50;
        reasons.push('Suspicious domain pattern');
      }
      
      const confidence = Math.max(0, Math.min(100, score));
      const accessible = confidence >= 60; // Umbral de confianza del 60%
      
      //console.debug(`🎯 Heuristic analysis for ${url}: ${confidence}% confidence, accessible: ${accessible}`);
      //console.debug(`   Reasons: ${reasons.join(', ')}`);
      
      return { accessible, confidence, reasons };
      
    } catch (error) {
      return { accessible: false, confidence: 0, reasons: ['Invalid URL format'] };
    }
  }

  /**
   * Use heuristic patterns to assume URL accessibility when direct checks fail (DEPRECATED)
   */
  private assumeUrlAccessibilityFromPattern(url: string, originalError: any): boolean {
    try {
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname.toLowerCase();
      const extension = parsedUrl.pathname.split('.').pop()?.toLowerCase() || '';
      
      // Government domains (especially Spanish) - usually very strict CORS but files exist
      const governmentPatterns = [
        /\.gob\.es$/,
        /\.gov\./,
        /\.europa\.eu$/,
        /\.administracion(es)?\.gob\.es$/,
        /datos(abiertos)?\..*\.gov/,
        /catalog[ou]?\..*\.(gob|gov|eu)/
      ];
      
      const isGovernmentDomain = governmentPatterns.some(pattern => pattern.test(domain));
      
      if (isGovernmentDomain) {
        // Government domains: assume accessible if it looks like a proper data file
        const dataFileExtensions = ['csv', 'json', 'xml', 'rdf', 'ttl', 'jsonld', 'xlsx', 'xls', 'pdf'];
        const isDataFile = dataFileExtensions.includes(extension);
        
        if (isDataFile) {
          //console.debug(`🏛️ Government domain verified: ${url} (${extension.toUpperCase()} file)`);
          return true;
        }
        
        // Check for data-like path patterns
        const dataPathPatterns = [
          /\/download\//,
          /\/dataset\//,
          /\/resource\//,
          /\/files?\//,
          /\/data\//,
          /\/export\//
        ];
        
        const hasDataPath = dataPathPatterns.some(pattern => pattern.test(parsedUrl.pathname));
        if (hasDataPath) {
          //console.debug(`🏛️ Government domain verified: ${url} (data path pattern)`);
          return true;
        }
      }
      
      // Well-known reliable domains
      const reliableDomains = [
        'github.com',
        'raw.githubusercontent.com',
        'gitlab.com',
        'bitbucket.org',
        'api.github.com',
        'zenodo.org',
        'figshare.com',
        'doi.org',
        'dx.doi.org'
      ];
      
      const isReliableDomain = reliableDomains.some(reliable => domain.includes(reliable));
      if (isReliableDomain) {
        //console.debug(`✅ Reliable domain verified: ${url}`);
        return true;
      }
      
      // HTTPS with data file extension on reasonable domain
      if (parsedUrl.protocol === 'https:' && ['csv', 'json', 'xml', 'rdf', 'ttl'].includes(extension)) {
        // Not suspicious patterns (no IP addresses, reasonable TLD)
        const suspiciousPatterns = [
          /^\d+\.\d+\.\d+\.\d+/, // IP address
          /localhost/,
          /127\.0\.0\.1/,
          /\.local$/,
          /\.test$/
        ];
        
        const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(domain));
        if (!isSuspicious) {
          //console.debug(`📄 HTTPS data file verified: ${url} (${extension.toUpperCase()})`);
          return true;
        }
      }
      
      // Default: if we can't categorize it and got CORS error, assume not accessible
      //console.debug(`❓ Pattern verification failed: ${url} - marked as inaccessible`);
      return false;
      
    } catch (parseError) {
      //console.debug(`❌ URL ${url}: Invalid URL format - not accessible`);
      return false;
    }
  }

  /**
   * Batch URL accessibility check with intelligent sampling
   */
  public async batchCheckURLAccessibility(
    urls: string[], 
    options: {
      maxSample?: number;
      confidenceThreshold?: number;
      useProxyFirst?: boolean;
      timeout?: number;
    } = {}
  ): Promise<{
    totalUrls: number;
    checkedUrls: number;
    accessibleUrls: number;
    successRate: number;
    score: number;
    details: Array<{ 
      url: string; 
      accessible: boolean; 
      method: 'direct' | 'pattern' | 'failed' | 'proxy' | 'heuristic' | 'backend';
      confidence?: number;
      reasons?: string[];
    }>;
    summary: {
      backendSuccess: number;
      proxySuccess: number;
      heuristicSuccess: number;
      failed: number;
      avgConfidence: number;
    };
  }> {
    const {
      maxSample = 20,
      confidenceThreshold = 60,
      useProxyFirst = true,
      timeout = 8000
    } = options;

    if (!urls || urls.length === 0) {
      return {
        totalUrls: 0,
        checkedUrls: 0,
        accessibleUrls: 0,
        successRate: 0,
        score: 0,
        details: [],
        summary: { backendSuccess: 0, proxySuccess: 0, heuristicSuccess: 0, failed: 0, avgConfidence: 0 }
      };
    }

    // Filter and sample URLs
    const validUrls = urls.filter(url => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });

    if (validUrls.length === 0) {
      return {
        totalUrls: urls.length,
        checkedUrls: 0,
        accessibleUrls: 0,
        successRate: 0,
        score: 0,
        details: [],
        summary: { backendSuccess: 0, proxySuccess: 0, heuristicSuccess: 0, failed: 0, avgConfidence: 0 }
      };
    }

    let urlsToCheck = validUrls;
    if (validUrls.length > maxSample) {
      // Intelligent sampling: prioritize diverse domains and data file extensions
      const shuffbled = [...validUrls].sort(() => 0.5 - Math.random());
      urlsToCheck = shuffbled.slice(0, maxSample);
      console.debug(`Intelligent sampling: ${maxSample} URLs out of ${validUrls.length}`);
    }

    let accessibleCount = 0;
    let proxySuccess = 0;
    let heuristicSuccess = 0;
    let failed = 0;
    let totalConfidence = 0;
    const details: Array<{ 
      url: string; 
      accessible: boolean; 
      method: 'direct' | 'pattern' | 'failed' | 'proxy' | 'heuristic' | 'backend';
      confidence?: number;
      reasons?: string[];
    }> = [];

    // Check if backend is available
    const isBackendAvailable = await backendService.isBackendAvailable();
    let backendSuccess = 0;

    for (const url of urlsToCheck) {
      let accessible = false;
      let method: 'direct' | 'pattern' | 'failed' | 'proxy' | 'heuristic' | 'backend' = 'failed';
      let confidence = 0;
      let reasons: string[] = [];

      // Strategy 1: Use backend server for accurate validation (preferred when available)
      if (isBackendAvailable) {
        try {
          const backendResult = await backendService.validateURLAccessibility(url);
          if (backendResult.accessible) {
            accessible = true;
            method = 'backend';
            confidence = 95; // High confidence for backend validation
            reasons = ['Validated via backend server'];
            backendSuccess++;
          } else if (backendResult.error) {
            reasons = [`Backend validation failed: ${backendResult.error}`];
          }
        } catch (error) {
          reasons = [`Backend error: ${error}`];
          console.warn(`Backend validation error for ${url}:`, error);
        }
      }

      // Fallback strategies if backend not available or failed
      if (!accessible) {
        // Strategy 2: Enhanced heuristic analysis (faster and more reliable in CORS-restricted environments)
        const heuristicResult = this.enhancedUrlHeuristics(url);
        if (heuristicResult.accessible) {
          accessible = true;
          method = 'heuristic';
          confidence = heuristicResult.confidence || 0;
          reasons = heuristicResult.reasons || [];
          heuristicSuccess++;
        } else {
          // Strategy 3: Only try proxy if heuristics fail AND proxy is specifically requested AND not in GitHub Pages
          if (useProxyFirst && !window.location.hostname.includes('github.io')) {
            const proxyResult = await this.checkUrlViaProxy(url);
            if (proxyResult.accessible) {
              accessible = true;
              method = 'proxy';
              confidence = 85; // Slightly lower confidence due to proxy limitations
              reasons = ['Accessible via CORS proxy'];
              proxySuccess++;
            }
          }
        }
      }

      // Update success counters
      if (accessible) {
        accessibleCount++;
      } else {
        failed++;
        if (reasons.length === 0) {
          reasons = ['URL not accessible via any method'];
        }
      }

      totalConfidence += confidence;
      
      details.push({ url, accessible, method, confidence, reasons });
    }

    const successRate = urlsToCheck.length > 0 ? (accessibleCount / urlsToCheck.length) : 0;
    const avgConfidence = urlsToCheck.length > 0 ? (totalConfidence / urlsToCheck.length) : 0;

    console.info(`Enhanced URL Accessibility Summary: ${accessibleCount}/${urlsToCheck.length} accessible (${(successRate * 100).toFixed(1)}%)`);
    console.info(`   Methods: ${backendSuccess} backend, ${proxySuccess} proxy, ${heuristicSuccess} heuristic, ${failed} failed`);
    console.info(`   Average confidence: ${avgConfidence.toFixed(1)}%`);

    return {
      totalUrls: urls.length,
      checkedUrls: urlsToCheck.length,
      accessibleUrls: accessibleCount,
      successRate,
      score: successRate,
      details,
      summary: {
        backendSuccess,
        proxySuccess,
        heuristicSuccess,
        failed,
        avgConfidence
      }
    };
  }

  /**
   * Get all available profiles
   */
  public getAvailableProfiles() {
    return Object.keys(this.config.profiles) as ValidationProfile[];
  }
}

export default MQAService.getInstance();
