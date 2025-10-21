import { Validator } from 'shacl-engine';
import { validations as sparqlValidations } from 'shacl-engine/sparql.js';
import rdfDataModel from '@rdfjs/data-model';
import rdfDataset from '@rdfjs/dataset';
import { Parser as N3Parser } from 'n3';
import { 
  ValidationProfile, 
  SHACLValidationResult, 
  SHACLReport, 
  SHACLViolation, 
  SHACLSeverity,
  MQAConfig,
  ProfileSelection
} from '../types';
import mqaConfigData from '../config/mqa-config.json';
import i18n from '../i18n';

export class SHACLValidationService {
  private static shaclShapesCache: Map<ValidationProfile, any> = new Map();

  /**
   * Parse SHACL content asynchronously and filter problematic regex patterns
   */
  private static async parseSHACLContent(content: string, fileName: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      // Pre-process content to fix problematic regex patterns
      const cleanedContent = this.cleanSHACLRegexPatterns(content);
      
      const parser = new N3Parser({ factory: rdfDataModel });
      const parsedQuads: any[] = [];
      
      parser.parse(cleanedContent, (error, quad, prefixes) => {
        if (error) {
          console.error(`❌ Parse error in ${fileName}:`, error);
          reject(error);
          return;
        }
        if (quad) {
          parsedQuads.push(quad);
        } else {
          // quad is null means parsing is complete
          resolve(parsedQuads);
        }
      });
    });
  }

  /**
   * Clean problematic regex patterns in SHACL content
   */
  private static cleanSHACLRegexPatterns(content: string): string {
    let cleaned = content;
    let replacements = 0;
    
    // The specific problematic pattern found: sh:pattern "^(?s)(?=.*\\S).*$" ;
    // This pattern checks for non-empty strings (containing at least one non-whitespace character)
    const problematicPattern = /sh:pattern\s+"[^"]*\(\?\:?s\)[^"]*"\s*;/g;
    const matches = content.match(problematicPattern);
    
    if (matches) {
      
      // Replace with a JavaScript-compatible pattern that does the same thing
      // Original: "^(?s)(?=.*\\S).*$" (matches any string with at least one non-whitespace char)
      // Replacement: "^[\\s\\S]*\\S[\\s\\S]*$" (JavaScript equivalent)
      cleaned = cleaned.replace(
        /sh:pattern\s+"[^"]*\(\?\:?s\)\(\?\=\.\*\\+S\)[^"]*"\s*;/g,
        'sh:pattern "^[\\\\s\\\\S]*\\\\S[\\\\s\\\\S]*$" ;'
      );
      
      // More specific replacement for the exact pattern we found
      cleaned = cleaned.replace(
        'sh:pattern "^(?s)(?=.*\\\\S).*$"',
        'sh:pattern "^[\\\\s\\\\S]*\\\\S[\\\\s\\\\S]*$"'
      );
      
      replacements = matches.length;
    }
    
    
    return cleaned;
  }

  /**
   * Get SHACL shapes for a given profile with improved import handling
   */
  private static async getSHACLShapes(profile: ValidationProfile): Promise<any> {
    if (this.shaclShapesCache.has(profile)) {
      return this.shaclShapesCache.get(profile);
    }

    try {
      const shaclFiles = this.getSHACLFilesForProfile(profile);
      const dataset = rdfDataset.dataset();

      
      let totalQuadsLoaded = 0;
      const loadedFiles: string[] = [];
      const failedFiles: string[] = [];

      // Load files

      // Load all SHACL files for the profile
      for (const shaclFile of shaclFiles) {
        try {
          
          // Determine if this is a local file or remote URL
          const isLocalFile = !shaclFile.startsWith('http://') && !shaclFile.startsWith('https://');
          const fileUrl = isLocalFile ? `/${shaclFile}` : shaclFile;
          
          
          const response = await fetch(fileUrl);
          if (!response.ok) {
            console.warn(`❌ Failed to fetch SHACL file: ${fileUrl} (${response.status} ${response.statusText})`);
            failedFiles.push(shaclFile);
            continue; // Skip this file but continue with others
          }
          const shaclContent = await response.text();
          
          // Show first few lines for debugging
          const lines = shaclContent.split('\n').slice(0, 5);
          
          // Parse the SHACL file content using async method
          const fileQuads = await this.parseSHACLContent(shaclContent, shaclFile);
          totalQuadsLoaded += fileQuads.length;
          loadedFiles.push(shaclFile);
          
          // Add all quads to the dataset
          for (const quad of fileQuads) {
            dataset.add(quad);
          }
        } catch (error) {
          console.error(`❌ Error loading SHACL file ${shaclFile}:`, error);
          failedFiles.push(shaclFile);
        }
      }

      
      if (failedFiles.length > 0) {
        console.warn(`⚠️ Some SHACL files failed to load:`, failedFiles);
      }

      // Validate that we have meaningful SHACL shapes
      if (totalQuadsLoaded === 0) {
        console.error(`❌ No SHACL quads loaded for profile ${profile}! Check file URLs and network connectivity.`);
      } else {
        // Count actual shape definitions
        const shapeCount = this.countShapeDefinitions(dataset);
        
        if (shapeCount === 0) {
          console.warn(`⚠️ No SHACL shape definitions found in loaded files for ${profile}. This may indicate import issues.`);
        }
      }

      this.shaclShapesCache.set(profile, dataset);
      return dataset;
    } catch (error) {
      console.error(`Error loading SHACL shapes for profile ${profile}:`, error);
      throw error;
    }
  }

    /**
   * Count actual SHACL shape definitions in the dataset
   */
  private static countShapeDefinitions(dataset: any): number {
    let shapeCount = 0;
    
    try {
      for (const quad of dataset) {
        // Count triples where the object is sh:NodeShape or sh:PropertyShape
        if (quad.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
            (quad.object.value === 'http://www.w3.org/ns/shacl#NodeShape' ||
             quad.object.value === 'http://www.w3.org/ns/shacl#PropertyShape')) {
          shapeCount++;
        }
      }
    } catch (error) {

    }
    
    return shapeCount;
  }

  /**
   * Get SHACL files for a given profile
   */
  private static getSHACLFilesForProfile(profile: ValidationProfile): string[] {
    const mqaConfig = (mqaConfigData as any);
    const profileConfig = mqaConfig.profiles[profile];
    
    if (!profileConfig) {
      console.warn(`❌ No configuration found for profile: ${profile}`);
      return [];
    }

    const defaultVersion = profileConfig.defaultVersion;
    const versionConfig = profileConfig.versions[defaultVersion];
    
    if (!versionConfig) {
      console.warn(`❌ No version configuration found for profile: ${profile}, version: ${defaultVersion}`);
      return [];
    }

    // Get SHACL files from configuration
    const shaclFiles = versionConfig.shaclFiles || [];
    
    if (shaclFiles.length === 0) {
      console.warn(`⚠️ No SHACL files configured for profile: ${profile}, version: ${defaultVersion}`);
    }

    return shaclFiles;
  }

  /**
   * Parse RDF content into a dataset
   */
  private static async parseRDFContent(content: string, format: string = 'turtle'): Promise<any> {
    try {
      
      const dataset = rdfDataset.dataset();
      const parsedQuads = await this.parseSHACLContent(content, `RDF-${format}`);
      
      
      // Log sample quads for debugging
      if (parsedQuads.length > 0) {
        parsedQuads.slice(0, 5).forEach((quad, index) => {

        });
        if (parsedQuads.length > 5) {

        }
      }

      for (const quad of parsedQuads) {
        dataset.add(quad);
      }

      return dataset;
    } catch (error) {
      console.error('❌ Error parsing RDF content:', error);
      throw error;
    }
  }

  /**
   * Extract value from shacl-engine RDF Term or complex object
   */
  private static extractTermValue(term: any): string {
    if (!term) return '';
    
    // If it's already a string
    if (typeof term === 'string') return term;
    
    // If it's an array, take the first element
    if (Array.isArray(term)) {
      return term.length > 0 ? this.extractTermValue(term[0]) : '';
    }
    
    // If it's a termType object (NamedNode, Literal, BlankNode)
    if (term.termType && term.value) {
      return term.value;
    }
    
    // If it has a .value property
    if (term.value !== undefined) {
      return typeof term.value === 'string' ? term.value : String(term.value);
    }
    
    // Try other common RDF term properties
    if (term.uri !== undefined) {
      return typeof term.uri === 'string' ? term.uri : String(term.uri);
    }
    
    if (term.id !== undefined) {
      return typeof term.id === 'string' ? term.id : String(term.id);
    }
    
    if (term.iri !== undefined) {
      return typeof term.iri === 'string' ? term.iri : String(term.iri);
    }
    
    // If it's an object with a toString method that doesn't return [object Object]
    if (typeof term === 'object' && term.toString) {
      const stringValue = term.toString();
      if (stringValue !== '[object Object]') {
        return stringValue;
      }
    }
    
    // Last resort: check if it's a function (some RDF libraries use functions)
    if (typeof term === 'function') {
      try {
        const result = term();
        if (typeof result === 'string') {
          return result;
        }
      } catch (e) {
        // Ignore function call errors
      }
    }
    
    // Fallback to empty string rather than [object Object]
    console.warn('⚠️ Could not extract term value from:', term);
    return '';
  }

  /**
   * Extract path from shacl-engine path array based on the actual shacl-engine structure
   */
  private static extractPath(path: any): string {
    if (!path) return '';
    
    // If it's already a string
    if (typeof path === 'string') return path;
    
    // If it's not an array, try to extract value directly
    if (!Array.isArray(path)) {
      return this.extractTermValue(path);
    }
    
    // Process array of Step objects
    const pathParts: string[] = [];
    
    for (const step of path) {
      if (!step) continue;
      
      // Each step should have predicates array
      if (step.predicates && Array.isArray(step.predicates)) {
        const predicateValues = step.predicates.map((pred: any) => this.extractTermValue(pred)).filter(Boolean);
        
        if (predicateValues.length === 1) {
          pathParts.push(predicateValues[0]);
        } else if (predicateValues.length > 1) {
          // Multiple predicates means alternative path
          pathParts.push(`(${predicateValues.join(' | ')})`);
        }
      } else {
        // Fallback: try to extract value from step directly
        const stepValue = this.extractTermValue(step);
        if (stepValue) pathParts.push(stepValue);
      }
    }
    
    return pathParts.length > 0 ? pathParts.join('/') : '';
  }

  /**
   * Parse SHACL validation result from shacl-engine
   */
  private static parseSHACLResult(validationReport: any, shaclShapes?: any, profile?: ValidationProfile, language: string = 'es'): SHACLValidationResult {
    const results: SHACLViolation[] = [];

    // shacl-engine returns results in validationReport.results
    if (validationReport.results) {
      for (const result of validationReport.results) {
        // // Debug logging to understand shacl-engine result structure
        // console.debug('SHACL result structure:', {
        //   resultKeys: Object.keys(result),
        //   hasSourceConstraintComponent: !!result.sourceConstraintComponent,
        //   hasSourceShape: !!result.sourceShape,
        //   hasConstraint: !!result.constraint,
        //   hasShape: !!result.shape,
        //   hasValidator: !!result.validator,
        //   hasValidation: !!result.validation,
        //   constraintType: result.constraint ? typeof result.constraint : 'undefined',
        //   shapeType: result.shape ? typeof result.shape : 'undefined',
        //   validatorType: result.validator ? typeof result.validator : 'undefined',
        //   validationType: result.validation ? typeof result.validation : 'undefined',
        //   fullResult: result
        // });

        const { translationKey, translationParams } = this.getTranslationMetadata(result);
        
        const violation: SHACLViolation = {
          focusNode: this.extractTermValue(result.focusNode),
          path: this.extractPath(result.path),
          value: this.extractTermValue(result.value),
          message: this.extractMessages(result, language),
          severity: this.mapSeverityFromSHACLEngine(result.severity),
          sourceConstraintComponent: this.extractSourceConstraintComponent(result),
          sourceShape: this.extractSourceShape(result),
          resultSeverity: this.extractTermValue(result.resultSeverity),
          foafPage: this.extractFoafPage(result, shaclShapes),
          translationKey,
          translationParams
        };

        results.push(violation);
      }
    }

    return {
      conforms: validationReport.conforms || false,
      results,
      text: validationReport.text,
      graph: undefined // Remove problematic dataset access
    };
  }

  /**
   * Extract messages from SHACL result
   */
  private static extractMessages(result: any, language: string = 'es'): string[] {
    const messages: string[] = [];
    
    if (result.message) {
      if (Array.isArray(result.message)) {
        // Handle array of messages
        for (const msg of result.message) {
          const extractedValue = this.extractTermValue(msg);
          if (extractedValue) {
            // Check if it's a language-tagged literal
            if (msg && msg.language) {
              messages.push(`"${extractedValue}"@${msg.language}`);
            } else {
              messages.push(`"${extractedValue}"`);
            }
          }
        }
      } else {
        // Handle single message
        const extractedValue = this.extractTermValue(result.message);
        if (extractedValue) {
          // Check if it's a language-tagged literal
          if (result.message && result.message.language) {
            messages.push(`"${extractedValue}"@${result.message.language}`);
          } else {
            messages.push(`"${extractedValue}"`);
          }
        }
      }
    }
    
    // If no messages found, generate a descriptive message based on constraint type
    if (messages.length === 0) {
      const generatedMessage = this.generateConstraintMessage(result, language);
      messages.push(`"${generatedMessage}"`);
    }
    
    return messages;
  }

  /**
   * Generate a descriptive message based on constraint component and available information
   */
  private static generateConstraintMessage(result: any, language: string = 'es'): string {
    const constraint = this.extractSourceConstraintComponent(result);
    const path = this.extractPath(result.path);
    const value = this.extractTermValue(result.value);
    
    // Extract constraint parameters if available
    const params: Record<string, any> = {
      path,
      value,
      constraintType: constraint.replace('sh:', '').replace('ConstraintComponent', '')
    };
    
    // Check for common SHACL constraint parameters
    if (result.constraint) {
      if (result.constraint.minCount !== undefined) {
        params.min = result.constraint.minCount;
      }
      if (result.constraint.maxCount !== undefined) {
        params.max = result.constraint.maxCount;
      }
      if (result.constraint.pattern) {
        params.pattern = this.extractTermValue(result.constraint.pattern);
      }
      if (result.constraint.minLength !== undefined) {
        params.min = result.constraint.minLength;
      }
      if (result.constraint.maxLength !== undefined) {
        params.max = result.constraint.maxLength;
      }
      if (result.constraint.datatype) {
        params.datatype = this.extractTermValue(result.constraint.datatype);
      }
      if (result.constraint.nodeKind) {
        params.nodeKind = this.extractTermValue(result.constraint.nodeKind);
      }
      if (result.constraint.class) {
        params.class = this.extractTermValue(result.constraint.class);
      }
    }
    
    // Generate message based on constraint type using i18n
    const constraintType = params.constraintType;
    let translationKey = '';
    
    switch (constraintType) {
      case 'MinCount':
        translationKey = 'shacl.constraints.minCount';
        break;
      case 'MaxCount':
        translationKey = 'shacl.constraints.maxCount';
        break;
      case 'Pattern':
        translationKey = 'shacl.constraints.pattern';
        break;
      case 'MinLength':
        translationKey = 'shacl.constraints.minLength';
        break;
      case 'MaxLength':
        translationKey = 'shacl.constraints.maxLength';
        break;
      case 'Datatype':
        translationKey = 'shacl.constraints.datatype';
        break;
      case 'NodeKind':
        translationKey = 'shacl.constraints.nodeKind';
        break;
      case 'Class':
        translationKey = 'shacl.constraints.class';
        break;
      case 'Or':
        translationKey = 'shacl.constraints.orConstraint';
        break;
      case 'And':
        translationKey = 'shacl.constraints.andConstraint';
        break;
      case 'Not':
        translationKey = 'shacl.constraints.notConstraint';
        break;
      case 'Xone':
        translationKey = 'shacl.constraints.xone';
        break;
      case 'Closed':
        translationKey = 'shacl.constraints.closed';
        break;
      case 'HasValue':
        translationKey = 'shacl.constraints.hasValue';
        break;
      case 'In':
        translationKey = 'shacl.constraints.in';
        break;
      case 'LanguageIn':
        translationKey = 'shacl.constraints.languageIn';
        break;
      case 'UniqueLang':
        translationKey = 'shacl.constraints.uniqueLang';
        break;
      case 'Equals':
        translationKey = 'shacl.constraints.equals';
        break;
      case 'Disjoint':
        translationKey = 'shacl.constraints.disjoint';
        break;
      case 'LessThan':
        translationKey = 'shacl.constraints.lessThan';
        break;
      case 'LessThanOrEquals':
        translationKey = 'shacl.constraints.lessThanOrEquals';
        break;
      case 'QualifiedMinCount':
        translationKey = 'shacl.constraints.qualifiedMinCount';
        break;
      case 'QualifiedMaxCount':
        translationKey = 'shacl.constraints.qualifiedMaxCount';
        break;
      default:
        // Generic message with more context
        if (path && value) {
          translationKey = 'shacl.constraints.genericWithPathValue';
        } else if (path) {
          translationKey = 'shacl.constraints.genericWithPath';
        } else {
          translationKey = 'shacl.constraints.generic';
        }
    }
    
    // Use i18n to translate the message
    return i18n.t(translationKey, { ...params, lng: language });
  }

  /**
   * Get translation metadata (key and params) for a SHACL result
   * This allows dynamic translation when language changes
   */
  private static getTranslationMetadata(result: any): { 
    translationKey?: string; 
    translationParams?: Record<string, any> 
  } {
    // Check if the result already has explicit messages
    if (result.message && Array.isArray(result.message) && result.message.length > 0) {
      // Has explicit SHACL messages, don't need translation metadata
      return {};
    }
    
    const constraint = this.extractSourceConstraintComponent(result);
    const path = this.extractPath(result.path);
    const value = this.extractTermValue(result.value);
    
    // Extract constraint parameters if available
    const params: Record<string, any> = {
      path,
      value,
      constraintType: constraint.replace('sh:', '').replace('ConstraintComponent', '')
    };
    
    // Check for common SHACL constraint parameters
    if (result.constraint) {
      if (result.constraint.minCount !== undefined) {
        params.min = result.constraint.minCount;
      }
      if (result.constraint.maxCount !== undefined) {
        params.max = result.constraint.maxCount;
      }
      if (result.constraint.pattern) {
        params.pattern = this.extractTermValue(result.constraint.pattern);
      }
      if (result.constraint.minLength !== undefined) {
        params.min = result.constraint.minLength;
      }
      if (result.constraint.maxLength !== undefined) {
        params.max = result.constraint.maxLength;
      }
      if (result.constraint.datatype) {
        params.datatype = this.extractTermValue(result.constraint.datatype);
      }
      if (result.constraint.nodeKind) {
        params.nodeKind = this.extractTermValue(result.constraint.nodeKind);
      }
      if (result.constraint.class) {
        params.class = this.extractTermValue(result.constraint.class);
      }
    }
    
    // Determine translation key based on constraint type
    const constraintType = params.constraintType;
    let translationKey = '';
    
    switch (constraintType) {
      case 'MinCount':
        translationKey = 'shacl.constraints.minCount';
        break;
      case 'MaxCount':
        translationKey = 'shacl.constraints.maxCount';
        break;
      case 'Pattern':
        translationKey = 'shacl.constraints.pattern';
        break;
      case 'MinLength':
        translationKey = 'shacl.constraints.minLength';
        break;
      case 'MaxLength':
        translationKey = 'shacl.constraints.maxLength';
        break;
      case 'Datatype':
        translationKey = 'shacl.constraints.datatype';
        break;
      case 'NodeKind':
        translationKey = 'shacl.constraints.nodeKind';
        break;
      case 'Class':
        translationKey = 'shacl.constraints.class';
        break;
      case 'Or':
        translationKey = 'shacl.constraints.orConstraint';
        break;
      case 'And':
        translationKey = 'shacl.constraints.andConstraint';
        break;
      case 'Not':
        translationKey = 'shacl.constraints.notConstraint';
        break;
      case 'Xone':
        translationKey = 'shacl.constraints.xone';
        break;
      case 'Closed':
        translationKey = 'shacl.constraints.closed';
        break;
      case 'HasValue':
        translationKey = 'shacl.constraints.hasValue';
        break;
      case 'In':
        translationKey = 'shacl.constraints.in';
        break;
      case 'LanguageIn':
        translationKey = 'shacl.constraints.languageIn';
        break;
      case 'UniqueLang':
        translationKey = 'shacl.constraints.uniqueLang';
        break;
      case 'Equals':
        translationKey = 'shacl.constraints.equals';
        break;
      case 'Disjoint':
        translationKey = 'shacl.constraints.disjoint';
        break;
      case 'LessThan':
        translationKey = 'shacl.constraints.lessThan';
        break;
      case 'LessThanOrEquals':
        translationKey = 'shacl.constraints.lessThanOrEquals';
        break;
      case 'QualifiedMinCount':
        translationKey = 'shacl.constraints.qualifiedMinCount';
        break;
      case 'QualifiedMaxCount':
        translationKey = 'shacl.constraints.qualifiedMaxCount';
        break;
      default:
        // Generic message with more context
        if (path && value) {
          translationKey = 'shacl.constraints.genericWithPathValue';
        } else if (path) {
          translationKey = 'shacl.constraints.genericWithPath';
        } else {
          translationKey = 'shacl.constraints.generic';
        }
    }
    
    return {
      translationKey,
      translationParams: params
    };
  }

  /**
   * Extract source constraint component from SHACL result
   */
  private static extractSourceConstraintComponent(result: any): string {
    // Based on shacl-engine result structure, check for constraintComponent.value
    if (result.constraintComponent && result.constraintComponent.value) {
      const componentURI = result.constraintComponent.value;
      // Convert full URI to short form: http://www.w3.org/ns/shacl#MinCountConstraintComponent -> sh:MinCountConstraintComponent
      if (componentURI.includes('#')) {
        const componentName = componentURI.split('#')[1];
        return `sh:${componentName}`;
      }
      return componentURI;
    }
    
    // Fallback to existing logic
    if (result.sourceConstraintComponent) {
      return this.extractTermValue(result.sourceConstraintComponent);
    }
    
    // Default fallback
    return 'sh:ConstraintComponent';
  }

  /**
   * Extract source shape from SHACL result
   */
  private static extractSourceShape(result: any): string {
    // Try to get source shape from direct property
    if (result.sourceShape) {
      return this.extractTermValue(result.sourceShape);
    }
    
    // For shacl-engine, the shape structure is complex but we can try to extract some identifier
    if (result.shape && result.shape.ptr && result.shape.ptr.ptrs && result.shape.ptr.ptrs.length > 0) {
      const shapePtr = result.shape.ptr.ptrs[0];
      
      // Try to get a meaningful identifier from the shape
      if (shapePtr._term && shapePtr._term.value) {
        return shapePtr._term.value;
      }
      
      // If we have edges, try to find a shape-related URI
      if (shapePtr.edges && shapePtr.edges.length > 0) {
        for (const edge of shapePtr.edges) {
          if (edge.subject && edge.subject.value) {
            const subjectValue = edge.subject.value;
            // Look for URIs that seem to be shape definitions
            if (subjectValue.includes('Shape') || 
                subjectValue.includes('Restriction') || 
                subjectValue.includes('datosgobes.github.io/DCAT-AP-ES/')) {
              return subjectValue;
            }
          }
        }
      }
    }
    
    // Generate a simple blank node ID rather than a complex urn
    const timestamp = Date.now();
    return `_:shape${timestamp % 10000}`;  // Shorter, cleaner ID
  }

  /**
   * Extract foaf:page URL from SHACL shapes for additional information
   */
  private static extractFoafPage(result: any, shaclShapes?: any): string | undefined {
    if (!shaclShapes) {
      return undefined;
    }

    try {
      const foafPagePredicate = 'http://xmlns.com/foaf/0.1/page';
      const possibleSubjects: string[] = [];
      
      // 1. Try sourceShape URI
      const sourceShapeUri = result.sourceShape?.value || result.sourceShape?.toString();
      if (sourceShapeUri) {
        possibleSubjects.push(sourceShapeUri);
      }
      
      // 2. Try constraint component URI
      if (result.constraintComponent) {
        const constraintUri = this.extractTermValue(result.constraintComponent);
        if (constraintUri) {
          possibleSubjects.push(constraintUri);
        }
      }
      
      // 3. Try to extract from shape structure
      if (result.shape && result.shape.ptr && result.shape.ptr.ptrs) {
        for (const ptr of result.shape.ptr.ptrs) {
          if (ptr._term && ptr._term.value) {
            possibleSubjects.push(ptr._term.value);
          }
          
          // Also check edges for shape URIs
          if (ptr.edges) {
            for (const edge of ptr.edges) {
              if (edge.subject && edge.subject.value) {
                possibleSubjects.push(edge.subject.value);
              }
            }
          }
        }
      }
      
      // 4. Try path predicate (the property being validated)
      const pathValue = this.extractPath(result.path);
      if (pathValue) {
        possibleSubjects.push(pathValue);
      }

      // Search for foaf:page associated with any of the possible subjects
      for (const subject of possibleSubjects) {
        for (const quad of shaclShapes) {
          if (quad.subject.value === subject && 
              quad.predicate.value === foafPagePredicate) {
            const foafPage = quad.object.value;
            // Return the first foaf:page found
            return foafPage;
          }
        }
      }
      
      // 5. Also check for foaf:page in property shapes related to the path
      // Sometimes the foaf:page is defined on the PropertyShape, not the NodeShape
      if (pathValue) {
        for (const quad of shaclShapes) {
          // Look for PropertyShapes that have sh:path matching our path
          if (quad.predicate.value === 'http://www.w3.org/ns/shacl#path' &&
              quad.object.value === pathValue) {
            const propertyShapeSubject = quad.subject.value;
            
            // Now look for foaf:page on this PropertyShape
            for (const foafQuad of shaclShapes) {
              if (foafQuad.subject.value === propertyShapeSubject &&
                  foafQuad.predicate.value === foafPagePredicate) {
                return foafQuad.object.value;
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Error extracting foaf:page:', error);
    }

    return undefined;
  }

  /**
   * Map SHACL severity from shacl-engine format
   */
  private static mapSeverityFromSHACLEngine(severity: any): SHACLSeverity {
    if (!severity) return 'Violation';
    
    const severityValue = severity.value || severity.toString() || '';
    
    if (severityValue.includes('Violation') || severityValue.includes('violation') || severityValue.includes('sh:Violation')) {
      return 'Violation';
    } else if (severityValue.includes('Warning') || severityValue.includes('warning') || severityValue.includes('sh:Warning')) {
      return 'Warning';
    } else if (severityValue.includes('Info') || severityValue.includes('info') || severityValue.includes('sh:Info')) {
      return 'Info';
    }
    
    return 'Violation'; // Default to violation for safety
  }

  /**
   * Validate RDF content against SHACL shapes using shacl-engine
   */
  public static async validateRDF(
    rdfContent: string,
    profile: ValidationProfile,
    format: string = 'turtle',
    language: string = 'es'
  ): Promise<SHACLReport> {
    try {
      
      // Load SHACL shapes
      const shapes = await this.getSHACLShapes(profile);
      const shapesCount = Array.from(shapes).length;
      
      if (shapesCount === 0) {
        console.warn(`⚠️ No SHACL shapes loaded for profile ${profile}! This will result in 0 violations.`);
        return {
          profile,
          conforms: false, // Changed to false when no shapes loaded
          totalViolations: 1,
          violations: [{
            focusNode: '',
            message: [`No SHACL shapes could be loaded for profile ${profile}`],
            severity: 'Violation',
            sourceConstraintComponent: 'system:NoShapesError',
            sourceShape: 'system:ValidationShape'
          }],
          warnings: [],
          infos: [],
          timestamp: new Date().toISOString()
        };
      }
      
      // Parse RDF data
      const data = await this.parseRDFContent(rdfContent, format);
      const dataCount = Array.from(data).length;

      // Check if RDF content is empty or contains no meaningful data
      if (dataCount === 0) {
        console.warn(`No RDF data found for validation. Content appears to be empty or contains only comments/whitespace.`);
        return {
          profile,
          conforms: false, // Empty content is not conformant
          totalViolations: 1,
          violations: [{
            focusNode: '',
            message: [`No RDF data found for validation. The content appears to be empty or contains only comments/whitespace. Empty content cannot be considered conformant to ${profile} profile.`],
            severity: 'Violation',
            sourceConstraintComponent: 'system:EmptyContentError',
            sourceShape: 'system:ValidationShape'
          }],
          warnings: [],
          infos: [],
          timestamp: new Date().toISOString()
        };
      }

      // Create validator with SPARQL support
      const validator = new Validator(shapes, {
        factory: rdfDataModel,
        debug: false,
        details: true,
        validations: sparqlValidations // Add SPARQL validations support
      });

      // Run validation
      let report;
      try {
        report = await validator.validate({ dataset: data });
      } catch (validationError: any) {
        // Handle specific regex error that occurs with some SHACL constraints
        if (validationError.message?.includes('Invalid regular expression') || 
            validationError.message?.includes('Invalid group')) {
          console.warn(`SHACL validation failed due to regex compatibility issue:`, validationError.message);
          console.warn(`This often occurs with advanced SHACL string patterns that aren't JavaScript-compatible`);
          
          // Return a mock result indicating validation issues exist (conservative approach)
          return {
            profile,
            conforms: false,
            totalViolations: 1,
            violations: [{
              focusNode: '',
              message: [`SHACL validation failed due to regex compatibility: ${validationError.message}`],
              severity: 'Violation',
              sourceConstraintComponent: 'system:RegexCompatibilityError',
              sourceShape: 'system:ValidationShape'
            }],
            warnings: [],
            infos: [],
            timestamp: new Date().toISOString()
          };
        } else {
          // Re-throw other validation errors
          throw validationError;
        }
      }
      
      // Parse results
      const validationResult = this.parseSHACLResult(report, shapes, profile, language);

      // Categorize violations by severity
      const violations = validationResult.results.filter(r => r.severity === 'Violation');
      const warnings = validationResult.results.filter(r => r.severity === 'Warning');
      const infos = validationResult.results.filter(r => r.severity === 'Info');


      return {
        profile,
        conforms: validationResult.conforms,
        totalViolations: violations.length,
        violations,
        warnings,
        infos,
        timestamp: new Date().toISOString(),
        reportDataset: validationResult.graph
      };

    } catch (error) {
      console.error('SHACL validation error:', error);
      
      // Return error report
      return {
        profile,
        conforms: false,
        totalViolations: 1,
        violations: [{
          focusNode: '',
          message: [`SHACL validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
          severity: 'Violation',
          sourceConstraintComponent: 'system:ValidationError',
          sourceShape: 'system:ValidationShape'
        }],
        warnings: [],
        infos: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate compliance score based on SHACL validation
   * Binary scoring: conforme = 100%, no conforme = 0%
   */
  public static calculateComplianceScore(report: SHACLReport): number {
    
    // Binary compliance scoring as requested by user:
    // Si el perfil no es conforme con la validacion SHACL, entonces la metrica de compliance es 0
    // La validacion es binaria
    if (report.conforms && report.totalViolations === 0) {
      return 100; // Full compliance
    } else {
      return 0; // No compliance if any violations exist
    }
  }

  /**
   * Export SHACL report as Turtle (enhanced version)
   */
  public static async exportReportAsTurtle(
    report: SHACLReport, 
    profileSelection?: ProfileSelection,
    profileVersion?: string
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const mqaConfig = (mqaConfigData as any);
    const profileId = report.profile;
    
    // Get app info from configuration
    const appInfo = mqaConfig.app_info;
    const appName = appInfo?.name || 'Metadata Quality Assessment Tool';
    const appVersion = appInfo?.version || '1.0.0';
    const appRepository = appInfo?.repository || 'https://github.com/mjanez/metadata-quality-react';
    const appUrl = appInfo?.url || 'https://mjanez.github.io/metadata-quality-react/';
    const seeAlsoUrl = appInfo?.see_also || 'https://github.com/mjanez/metadata-quality-react?tab=readme-ov-file#metadata-quality-react';
    const appDescription = appInfo?.description || 'A tool for assessing metadata quality using SHACL validation.';
        
    // Get profile configuration
    const profileConfig = (mqaConfig.profiles as Record<string, any>)[profileId];
    
    // Determine version: from parameter, selection, or default
    let version = profileVersion;
    if (!version && profileSelection) {
      version = profileSelection.version;
    }
    if (!version && profileConfig) {
      version = profileConfig.defaultVersion;
    }
    
    // Get version-specific configuration
    let versionConfig = null;
    let profileName = String(profileId);
    let profileUrl = '';
    
    if (profileConfig && version && profileConfig.versions && profileConfig.versions[version]) {
      versionConfig = profileConfig.versions[version];
      profileName = versionConfig.name || profileConfig.name || String(profileId);
      profileUrl = versionConfig.url || '';
    } else if (profileConfig) {
      profileName = profileConfig.name || String(profileId);
    }
    
    let turtle = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix doap: <http://usefulinc.com/ns/doap#> .`;

    turtle += `

# Validation Report
[ a sh:ValidationReport ;
    sh:conforms ${report.conforms} ;`;

    // Add metadata as annotations using app_info
    turtle += `
    dct:created "${timestamp}"^^xsd:dateTime ;
    dct:creator [ a foaf:Agent ;
            foaf:name "${appName}" ;
            doap:release [ a doap:Version ;
                    doap:revision "${appVersion}" ;
                    doap:created "${timestamp}"^^xsd:dateTime
                  ] ;
            foaf:homepage <${appUrl}> ;
            # Repository
            foaf:page <${appRepository}> ;
            # React APP documentation
            rdfs:seeAlso <${seeAlsoUrl}> ;
            rdfs:comment "${appDescription}"
          ] ;
    dct:title "Informe de Validación SHACL para el perfil ${profileName} generado por ${appName} v${appVersion}"@es ;
    dct:title "SHACL Validation Report for profile ${profileName} generated by ${appName} v${appVersion}"@en ;
    dct:format <http://publications.europa.eu/resource/authority/file-type/RDF_TURTLE> ;
    dct:description "Este archivo contiene el informe de validación SHACL para el perfil ${profileName}. Se han detectado ${report.totalViolations} violaciones. Estado de conformidad: ${report.conforms ? 'Conforme' : 'No conforme'} (${report.conforms}). Número de advertencias/recomendaciones: ${report.warnings.length}"@es ;
    dct:description "This file contains the SHACL validation report for profile ${profileName}. A total of ${report.totalViolations} violations were found. Conformance status: ${report.conforms ? 'Conforms' : 'Non-conforms'} (${report.conforms}). Number of warnings/recommendations: ${report.warnings.length}"@en ;`;

    if (profileUrl) {
      turtle += `
    rdfs:seeAlso <${profileUrl}> ;
    
    # Validation results`;
    }

    // Add validation results if any exist
    const allResults = [...report.violations, ...report.warnings, ...report.infos];
    
    if (allResults.length > 0) {
      turtle += `
    sh:result`;
      
      // Add each result as a blank node
      allResults.forEach((result, index) => {
        const isLast = index === allResults.length - 1;
        
        turtle += `
        [ a sh:ValidationResult ;
            sh:resultSeverity sh:${result.severity} ;`;
        
        // Focus node
        if (result.focusNode) {
          turtle += `
            sh:focusNode <${result.focusNode}> ;`;
        }
        
        // Result path
        if (result.path) {
          turtle += `
            sh:resultPath <${result.path}> ;`;
        }
        
        // Value that caused the violation
        if (result.value) {
          // Escape quotes and handle literals properly
          const escapedValue = result.value.replace(/"/g, '\\"');
          turtle += `
            sh:value "${escapedValue}" ;`;
        }
        
        // Messages
        if (result.message.length > 0) {
          result.message.forEach((msg, msgIndex) => {
            // Remove quotes if they exist and re-add them properly
            const cleanMsg = msg.replace(/^"(.*)"(@[a-z]{2})?$/g, '$1');
            const langMatch = msg.match(/@([a-z]{2})$/);
            
            if (langMatch) {
              turtle += `
            sh:resultMessage "${cleanMsg}"@${langMatch[1]} ;`;
            } else {
              turtle += `
            sh:resultMessage "${cleanMsg}" ;`;
            }
          });
        }
        
        // Source constraint component
        if (result.sourceConstraintComponent) {
          // Ensure it's properly formatted as a URI or prefixed name
          const component = result.sourceConstraintComponent.startsWith('sh:') 
            ? result.sourceConstraintComponent 
            : result.sourceConstraintComponent.startsWith('http://') 
              ? `<${result.sourceConstraintComponent}>`
              : `sh:${result.sourceConstraintComponent}`;
          
          turtle += `
            sh:sourceConstraintComponent ${component} ;`;
        }
        
        // Source shape
        if (result.sourceShape) {
          // Handle both URIs and blank nodes
          const shape = result.sourceShape.startsWith('_:') 
            ? result.sourceShape 
            : result.sourceShape.startsWith('http://') 
              ? `<${result.sourceShape}>`
              : `<${result.sourceShape}>`;
          
          turtle += `
            sh:sourceShape ${shape} ;`;
        }
        
        // Remove trailing semicolon and close the blank node
        turtle = turtle.replace(/;\s*$/, '');
        turtle += `
        ]`;
        
        // Add comma or period depending on whether this is the last result
        if (!isLast) {
          turtle += ' ,';
        }
      });
    }

    // Close the validation report
    turtle += `
] .

# Profile Information
[ a dct:Standard ;
    dct:title "${profileName}"@es ;
    dct:title "${profileName}"@en ;
    dct:identifier "${profileId}-${version}" ;`;

    if (version) {
      turtle += `
    dct:hasVersion "${version}" ;`;
    }

    if (profileUrl) {
      turtle += `
    foaf:page <${profileUrl}> ;`;
    }

    turtle += `
    rdfs:comment "Perfil utilizado para la validación SHACL"@es ;
    rdfs:comment "Profile used for SHACL validation"@en 
    
] .`;

    return turtle;
  }

  /**
   * Export SHACL report as CSV for non-RDF users
   */
  public static async exportReportAsCSV(report: SHACLReport): Promise<string> {
    const timestamp = new Date().toISOString();
    
    // CSV headers
    const headers = [
      'Severity',
      'Focus Node',
      'Path',
      'Value',
      'Message',
      'Source Shape',
      'Constraint Component',
      'Additional Info URL'
    ];
    
    // Combine all violations, warnings, and infos
    const allIssues = [
      ...report.violations,
      ...report.warnings,
      ...report.infos
    ];
    
    // Convert to CSV rows
    const csvRows = [];
    
    // Add metadata header
    csvRows.push(headers.join(','));
    
    for (const issue of allIssues) {
      const row = [
        issue.severity,
        this.escapeCsvValue(issue.focusNode || ''),
        this.escapeCsvValue(issue.path || ''),
        this.escapeCsvValue(issue.value || ''),
        this.escapeCsvValue(issue.message.join('; ')),
        this.escapeCsvValue(issue.sourceShape || ''),
        this.escapeCsvValue(issue.sourceConstraintComponent || ''),
        this.escapeCsvValue(issue.foafPage || '')
      ];
      
      csvRows.push(row.join(','));
    }
    
    return csvRows.join('\n');
  }

  /**
   * Escape CSV values (handle commas, quotes, newlines)
   */
  private static escapeCsvValue(value: string): string {
    if (!value) return '';
    
    // If value contains comma, quote, or newline, wrap in quotes and escape existing quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    
    return value;
  }

  /**
   * Clear cache (useful for testing or when SHACL files are updated)
   */
  public static clearCache(): void {
    this.shaclShapesCache.clear();
  }
}

export default SHACLValidationService;