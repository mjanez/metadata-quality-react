/**
 * SHACL Validation Service
 * 
 * Server-side SHACL validation using shacl-engine.
 * This provides profile-based validation for DCAT-AP, DCAT-AP-ES, and NTI-RISP.
 * 
 * IMPORTANT: Uses @rdfjs/data-model factory for quad creation to ensure compatibility
 * with shacl-engine and @rdfjs/dataset.
 */

const N3 = require('n3');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { RdfXmlParser } = require('rdfxml-streaming-parser');
const { preprocessRdfForInvalidIRIs, detectFormat } = require('./rdf-utils');

// Cache for dynamically loaded ES modules
let modulesCache = null;

/**
 * Load all required ES modules once
 * These are ES modules that need dynamic import in CommonJS
 */
async function loadESModules() {
  if (!modulesCache) {
    console.log('🔧 Loading ES modules for SHACL validation...');
    
    const [rdfDataModelModule, rdfDatasetModule, shaclEngineModule] = await Promise.all([
      import('@rdfjs/data-model'),
      import('@rdfjs/dataset'),
      import('shacl-engine')
    ]);
    
    // Debug: log what we got
    console.log('📦 rdfDataModelModule keys:', Object.keys(rdfDataModelModule));
    console.log('📦 rdfDatasetModule keys:', Object.keys(rdfDatasetModule));
    console.log('📦 shaclEngineModule keys:', Object.keys(shaclEngineModule));
    
    // @rdfjs/data-model exports: default is the factory object with namedNode, literal, etc.
    const rdfFactory = rdfDataModelModule.default || rdfDataModelModule;
    
    // @rdfjs/dataset exports: default has a .dataset() method
    const datasetFactory = rdfDatasetModule.default || rdfDatasetModule;
    
    // Verify datasetFactory has the dataset method
    if (typeof datasetFactory.dataset !== 'function') {
      console.error('❌ datasetFactory.dataset is not a function! Got:', typeof datasetFactory.dataset);
      console.error('   datasetFactory:', datasetFactory);
      throw new Error('Invalid dataset factory - dataset() method not found');
    }
    
    // Verify rdfFactory has necessary methods
    if (typeof rdfFactory.namedNode !== 'function') {
      console.error('❌ rdfFactory.namedNode is not a function!');
      throw new Error('Invalid RDF factory - namedNode() method not found');
    }
    
    console.log('✅ rdfFactory has namedNode:', typeof rdfFactory.namedNode);
    console.log('✅ datasetFactory has dataset:', typeof datasetFactory.dataset);
    console.log('✅ Validator:', typeof shaclEngineModule.Validator);
    
    modulesCache = {
      rdfFactory,
      datasetFactory,
      Validator: shaclEngineModule.Validator
    };
    
    console.log('✅ ES modules loaded successfully');
  }
  
  return modulesCache;
}

// SHACL shapes cache - stores datasets, not N3.Store
const shapesCache = new Map();

/**
 * Load MQA configuration
 */
async function loadMQAConfig() {
  try {
    const configPath = path.join(__dirname, '..', '..', 'src', 'config', 'mqa-config.json');
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to load MQA config:', error);
    throw new Error('Configuration not available');
  }
}

/**
 * Replace branch in GitHub raw content URLs
 * Supports URLs like: https://raw.githubusercontent.com/owner/repo/refs/heads/{branch}/path
 */
function replaceBranchInSHACLUrls(shaclFiles, targetBranch) {
  if (!targetBranch) {
    return shaclFiles;
  }
  
  return shaclFiles.map(url => {
    // Pattern: https://raw.githubusercontent.com/{owner}/{repo}/refs/heads/{currentBranch}/{path}
    const githubRawPattern = /(https:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/refs\/heads\/)([^\/]+)(\/.*)/;
    const match = url.match(githubRawPattern);
    
    if (match) {
      const [, prefix, currentBranch, path] = match;
      console.log(`🔀 Replacing branch '${currentBranch}' with '${targetBranch}' in SHACL URL`);
      return `${prefix}${targetBranch}${path}`;
    }
    
    // Return unchanged if not a GitHub raw URL
    return url;
  });
}

/**
 * Get SHACL files for a profile
 * @param {string} profile - Profile ID
 * @param {string} version - Profile version (optional)
 * @param {string} shapesGraphBranch - Git branch for SHACL files (optional)
 */
async function getSHACLFilesForProfile(profile, version, shapesGraphBranch) {
  const config = await loadMQAConfig();
  const profileConfig = config.profiles[profile];
  
  if (!profileConfig) {
    throw new Error(`Profile '${profile}' not found`);
  }
  
  const targetVersion = version || profileConfig.defaultVersion;
  const versionConfig = profileConfig.versions[targetVersion];
  
  if (!versionConfig) {
    throw new Error(`Version '${targetVersion}' not found for profile '${profile}'`);
  }
  
  // Get SHACL files and optionally replace branch
  let shaclFiles = versionConfig.shaclFiles || [];
  if (shapesGraphBranch) {
    shaclFiles = replaceBranchInSHACLUrls(shaclFiles, shapesGraphBranch);
  }
  
  return {
    shaclFiles,
    profileName: versionConfig.name,
    profileUrl: versionConfig.url,
    version: targetVersion,
    branch: shapesGraphBranch || 'default'
  };
}

/**
 * Clean problematic regex patterns in SHACL content
 * Same as frontend SHACLValidationService.cleanSHACLRegexPatterns
 */
function cleanSHACLRegexPatterns(content) {
  let cleaned = content;
  
  // Replace problematic (?s) regex patterns with JavaScript-compatible equivalents
  cleaned = cleaned.replace(
    'sh:pattern "^(?s)(?=.*\\\\S).*$"',
    'sh:pattern "^[\\\\s\\\\S]*\\\\S[\\\\s\\\\S]*$"'
  );
  
  return cleaned;
}

/**
 * Parse content with N3Parser using the correct RDF factory
 * This ensures quads are compatible with @rdfjs/dataset
 */
async function parseWithN3(content, rdfFactory, format = 'text/turtle') {
  return new Promise((resolve, reject) => {
    // Use rdfFactory to create quads compatible with @rdfjs/dataset
    const parser = new N3.Parser({ factory: rdfFactory, format });
    const quads = [];
    
    parser.parse(content, (error, quad, prefixes) => {
      if (error) {
        reject(error);
      } else if (quad) {
        quads.push(quad);
      } else {
        resolve(quads);
      }
    });
  });
}

/**
 * Parse RDF/XML content using rdfxml-streaming-parser with correct factory
 */
async function parseRdfXml(content, rdfFactory, baseIRI = 'http://example.org/') {
  return new Promise((resolve, reject) => {
    const parser = new RdfXmlParser({ baseIRI, factory: rdfFactory });
    const quads = [];
    
    parser.on('data', (quad) => {
      quads.push(quad);
    });
    
    parser.on('error', (error) => {
      reject(error);
    });
    
    parser.on('end', () => {
      resolve(quads);
    });
    
    parser.write(content);
    parser.end();
  });
}

/**
 * Parse RDF content in any format, returning quads compatible with @rdfjs/dataset
 * Implements fallback: if specified format fails, auto-detect and retry
 */
async function parseRDFContent(content, format, rdfFactory) {
  // Always auto-detect if format is 'auto' or not specified
  let formatToUse = (format && format !== 'auto') ? format : detectFormat(content);
  
  // Preprocess content to fix invalid IRIs
  const { processedContent } = preprocessRdfForInvalidIRIs(content);
  
  // Try parsing with the specified/detected format
  try {
    return await parseWithFormat(processedContent, formatToUse, rdfFactory);
  } catch (firstError) {
    // If explicit format was given and it failed, try auto-detection
    if (format && format !== 'auto') {
      const autoDetected = detectFormat(content);
      if (autoDetected !== formatToUse) {
        console.warn(`⚠️ Parsing with format '${formatToUse}' failed, trying auto-detected format '${autoDetected}'...`);
        try {
          return await parseWithFormat(processedContent, autoDetected, rdfFactory);
        } catch (secondError) {
          // Both failed, throw the original error
          throw firstError;
        }
      }
    }
    throw firstError;
  }
}

/**
 * Parse with a specific format
 */
async function parseWithFormat(content, format, rdfFactory) {
  switch (format) {
    case 'rdfxml':
      return await parseRdfXml(content, rdfFactory);
    case 'ntriples':
      return await parseWithN3(content, rdfFactory, 'application/n-triples');
    case 'turtle':
    default:
      return await parseWithN3(content, rdfFactory, 'text/turtle');
  }
}

/**
 * Load SHACL shapes from remote URLs
 * Returns a dataset compatible with shacl-engine
 * @param {string} profile - Profile ID
 * @param {string} version - Profile version (optional)
 * @param {string} shapesGraphBranch - Git branch for SHACL files (optional)
 */
async function loadSHACLShapes(profile, version, shapesGraphBranch) {
  const { rdfFactory, datasetFactory } = await loadESModules();
  
  const cacheKey = `${profile}-${version || 'default'}-${shapesGraphBranch || 'default'}`;
  
  if (shapesCache.has(cacheKey)) {
    console.log(`✅ Using cached SHACL shapes for ${cacheKey}`);
    return shapesCache.get(cacheKey);
  }
  
  const { shaclFiles, profileName, version: actualVersion, branch } = await getSHACLFilesForProfile(profile, version, shapesGraphBranch);
  
  if (shaclFiles.length === 0) {
    throw new Error(`No SHACL files configured for profile '${profile}'`);
  }
  
  console.log(`📥 Loading ${shaclFiles.length} SHACL files for ${profileName}...`);
  
  // Create a dataset using the factory
  const dataset = datasetFactory.dataset();
  const loadedFiles = [];
  const failedFiles = [];
  
  for (const shaclUrl of shaclFiles) {
    try {
      console.log(`  Loading: ${shaclUrl}`);
      const response = await axios.get(shaclUrl, {
        timeout: 30000,
        headers: {
          'Accept': 'text/turtle, application/n-triples, */*'
        }
      });
      
      // Clean problematic regex patterns
      const content = cleanSHACLRegexPatterns(response.data);
      
      // Parse with the correct factory
      const quads = await parseWithN3(content, rdfFactory, 'text/turtle');
      
      // Add quads to dataset
      for (const quad of quads) {
        dataset.add(quad);
      }
      
      loadedFiles.push(shaclUrl);
      
    } catch (error) {
      console.warn(`  ❌ Failed to load ${shaclUrl}: ${error.message}`);
      failedFiles.push(shaclUrl);
    }
  }
  
  console.log(`✅ Loaded ${dataset.size} SHACL quads from ${loadedFiles.length} files`);
  
  if (failedFiles.length > 0) {
    console.warn(`⚠️ Failed to load ${failedFiles.length} SHACL files`);
  }
  
  const result = {
    dataset,
    loadedFiles,
    failedFiles,
    quadCount: dataset.size,
    version: actualVersion
  };
  
  shapesCache.set(cacheKey, result);
  return result;
}

/**
 * Perform SHACL validation using shacl-engine
 * @param {string} content - RDF content to validate
 * @param {string} profile - Profile ID
 * @param {string} format - RDF format (turtle, rdfxml, etc.)
 * @param {string} version - Profile version (optional)
 * @param {string} language - Language for messages (default: 'es')
 * @param {string} shapesGraphBranch - Git branch for SHACL files (optional)
 */
async function validateWithSHACL(content, profile, format, version, language = 'es', shapesGraphBranch = null) {
  // Load ES modules first
  const { rdfFactory, datasetFactory, Validator } = await loadESModules();
  
  // Preprocess content
  const { processedContent, warnings: preprocessWarnings } = preprocessRdfForInvalidIRIs(content);
  const detectedFormat = format === 'auto' ? detectFormat(processedContent) : format;
  
  // Parse the data using the correct factory
  let dataQuads;
  try {
    dataQuads = await parseRDFContent(processedContent, detectedFormat, rdfFactory);
  } catch (error) {
    return {
      profile,
      version,
      conforms: false,
      totalViolations: 1,
      violations: [{
        focusNode: '',
        path: '',
        value: '',
        message: [`RDF parsing error: ${error.message}`],
        severity: 'Violation',
        sourceConstraintComponent: 'system:ParsingError',
        sourceShape: 'system:ValidationShape'
      }],
      warnings: [],
      infos: [],
      preprocessingWarnings: preprocessWarnings,
      timestamp: new Date().toISOString()
    };
  }
  
  if (dataQuads.length === 0) {
    return {
      profile,
      version,
      conforms: false,
      totalViolations: 1,
      violations: [{
        focusNode: '',
        path: '',
        value: '',
        message: ['No RDF data found in content'],
        severity: 'Violation',
        sourceConstraintComponent: 'system:EmptyContentError',
        sourceShape: 'system:ValidationShape'
      }],
      warnings: [],
      infos: [],
      preprocessingWarnings: preprocessWarnings,
      timestamp: new Date().toISOString()
    };
  }
  
  // Create data dataset
  const dataDataset = datasetFactory.dataset();
  for (const quad of dataQuads) {
    dataDataset.add(quad);
  }
  
  // Load SHACL shapes
  let shapesInfo;
  try {
    shapesInfo = await loadSHACLShapes(profile, version, shapesGraphBranch);
  } catch (error) {
    return {
      profile,
      version,
      conforms: false,
      totalViolations: 1,
      violations: [{
        focusNode: '',
        path: '',
        value: '',
        message: [`Failed to load SHACL shapes: ${error.message}`],
        severity: 'Violation',
        sourceConstraintComponent: 'system:ShapesLoadError',
        sourceShape: 'system:ValidationShape'
      }],
      warnings: [],
      infos: [],
      preprocessingWarnings: preprocessWarnings,
      timestamp: new Date().toISOString()
    };
  }
  
  // Perform SHACL validation
  console.log(`🔍 Running SHACL validation with ${shapesInfo.quadCount} shape quads and ${dataDataset.size} data quads...`);
  
  // Debug dataset types
  console.log('📊 shapesInfo.dataset type:', typeof shapesInfo.dataset);
  console.log('📊 shapesInfo.dataset.size:', shapesInfo.dataset.size);
  console.log('📊 shapesInfo.dataset.match:', typeof shapesInfo.dataset.match);
  console.log('📊 dataDataset type:', typeof dataDataset);
  console.log('📊 dataDataset.size:', dataDataset.size);
  console.log('📊 dataDataset.match:', typeof dataDataset.match);
  console.log('📊 dataDataset[Symbol.iterator]:', typeof dataDataset[Symbol.iterator]);
  
  let violations = [];
  let warnings = [];
  let infos = [];
  let conforms = true;
  
  try {
    // Create validator with shapes dataset
    console.log('🔧 Creating Validator with shapes dataset...');
    const validator = new Validator(shapesInfo.dataset, { factory: rdfFactory });
    console.log('✅ Validator created successfully');
    
    // Run validation - IMPORTANT: pass { dataset: ... } object, not just the dataset
    // This is required by shacl-engine/grapoi PathList constructor
    console.log('🔧 Running validator.validate({ dataset: dataDataset })...');
    const report = await validator.validate({ dataset: dataDataset });
    console.log('✅ Validation completed');
    
    conforms = report.conforms;
    
    // Extract violations from SHACL report
    const results = report.results || [];
    console.log(`📋 SHACL validation found ${results.length} result(s)`);
    
    for (const result of results) {
      const violation = {
        focusNode: extractTermValue(result.focusNode),
        path: extractPath(result.path),
        value: extractTermValue(result.value),
        message: extractMessages(result, language),
        severity: extractSeverity(result.severity),
        sourceConstraintComponent: extractTermValue(result.sourceConstraintComponent) || extractSourceConstraintComponent(result),
        sourceShape: extractTermValue(result.sourceShape) || extractSourceShape(result)
      };
      
      // Categorize by severity
      const severityLower = violation.severity.toLowerCase();
      if (severityLower === 'violation' || severityLower === 'sh:violation') {
        violations.push(violation);
      } else if (severityLower === 'warning' || severityLower === 'sh:warning') {
        warnings.push(violation);
      } else if (severityLower === 'info' || severityLower === 'sh:info') {
        infos.push(violation);
      } else {
        // Default to violation
        violations.push(violation);
      }
    }
    
    console.log(`✅ SHACL validation complete: ${violations.length} violations, ${warnings.length} warnings, ${infos.length} infos`);
    
  } catch (validationError) {
    console.error('❌ SHACL validation engine error:', validationError);
    violations.push({
      focusNode: '',
      path: '',
      value: '',
      message: [`SHACL engine error: ${validationError.message}`],
      severity: 'Violation',
      sourceConstraintComponent: 'system:ValidationEngineError',
      sourceShape: 'system:ValidationShape'
    });
    conforms = false;
  }
  
  return {
    profile,
    version: shapesInfo.version || version || 'default',
    conforms,
    totalViolations: violations.length,
    violations,
    warnings,
    infos,
    preprocessingWarnings: preprocessWarnings,
    shapesLoaded: shapesInfo.loadedFiles.length,
    shapesFailed: shapesInfo.failedFiles.length,
    dataTriples: dataDataset.size,
    timestamp: new Date().toISOString()
  };
}

/**
 * Extract value from RDF term
 */
function extractTermValue(term) {
  if (!term) return '';
  if (typeof term === 'string') return term;
  if (Array.isArray(term)) {
    return term.length > 0 ? extractTermValue(term[0]) : '';
  }
  if (term.value !== undefined) return String(term.value);
  if (term.uri !== undefined) return String(term.uri);
  if (term.id !== undefined) return String(term.id);
  return '';
}

/**
 * Extract path from shacl-engine result
 */
function extractPath(path) {
  if (!path) return '';
  if (typeof path === 'string') return path;
  if (!Array.isArray(path)) return extractTermValue(path);
  
  const parts = [];
  for (const step of path) {
    if (!step) continue;
    if (step.predicates && Array.isArray(step.predicates)) {
      const predicateValues = step.predicates.map(p => extractTermValue(p)).filter(Boolean);
      if (predicateValues.length === 1) {
        parts.push(predicateValues[0]);
      } else if (predicateValues.length > 1) {
        parts.push(`(${predicateValues.join(' | ')})`);
      }
    } else {
      const stepValue = extractTermValue(step);
      if (stepValue) parts.push(stepValue);
    }
  }
  
  return parts.length > 0 ? parts.join('/') : '';
}

/**
 * Extract severity from shacl-engine result
 */
function extractSeverity(severity) {
  if (!severity) return 'Violation';
  const value = extractTermValue(severity);
  if (!value) return 'Violation';
  
  // Extract just the local name from URI
  const parts = value.split('#');
  return parts.length > 1 ? parts[1] : value;
}

/**
 * Extract messages from SHACL result
 */
function extractMessages(result, language = 'es') {
  const messages = [];
  
  if (result.message) {
    if (Array.isArray(result.message)) {
      for (const msg of result.message) {
        const value = extractTermValue(msg);
        if (value) {
          if (msg && msg.language) {
            messages.push(`"${value}"@${msg.language}`);
          } else {
            messages.push(`"${value}"`);
          }
        }
      }
    } else {
      const value = extractTermValue(result.message);
      if (value) {
        if (result.message && result.message.language) {
          messages.push(`"${value}"@${result.message.language}`);
        } else {
          messages.push(`"${value}"`);
        }
      }
    }
  }
  
  // Generate default message if none found
  if (messages.length === 0) {
    const constraint = extractSourceConstraintComponent(result);
    const path = extractPath(result.path);
    messages.push(`Constraint violation: ${constraint}${path ? ` on path ${path}` : ''}`);
  }
  
  return messages;
}

/**
 * Extract source constraint component
 */
function extractSourceConstraintComponent(result) {
  if (result.sourceConstraintComponent) {
    return extractTermValue(result.sourceConstraintComponent);
  }
  if (result.constraint) {
    return extractTermValue(result.constraint);
  }
  if (result.validator) {
    return extractTermValue(result.validator);
  }
  return 'sh:ConstraintComponent';
}

/**
 * Extract source shape
 */
function extractSourceShape(result) {
  if (result.sourceShape) {
    return extractTermValue(result.sourceShape);
  }
  if (result.shape) {
    return extractTermValue(result.shape);
  }
  return '';
}

/**
 * Convert SHACL report to Turtle format
 */
async function exportReportAsTurtle(report) {
  const config = await loadMQAConfig();
  const appInfo = config.app_info || {};
  const timestamp = new Date().toISOString();
  
  let turtle = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

# SHACL Validation Report
[ a sh:ValidationReport ;
    sh:conforms ${report.conforms} ;
    dct:created "${timestamp}"^^xsd:dateTime ;
    dct:creator [ a foaf:Agent ;
            foaf:name "${appInfo.name || 'MQA API'}" 
          ] ;
    dct:title "SHACL Validation Report for ${report.profile}"@en`;
  
  // Add results
  const allResults = [...report.violations, ...report.warnings, ...report.infos];
  
  if (allResults.length > 0) {
    turtle += ` ;
    sh:result`;
    
    allResults.forEach((result, index) => {
      const isLast = index === allResults.length - 1;
      
      turtle += `
        [ a sh:ValidationResult ;
            sh:resultSeverity sh:${result.severity}`;
      
      if (result.focusNode) {
        turtle += ` ;
            sh:focusNode <${result.focusNode}>`;
      }
      
      if (result.path) {
        turtle += ` ;
            sh:resultPath <${result.path}>`;
      }
      
      if (result.message && result.message.length > 0) {
        result.message.forEach(msg => {
          const cleanMsg = msg.replace(/"/g, '\\"');
          turtle += ` ;
            sh:resultMessage "${cleanMsg}"`;
        });
      }
      
      turtle += `
        ]`;
      
      if (!isLast) {
        turtle += ' ,';
      }
    });
  }
  
  turtle += `
] .`;
  
  return turtle;
}

/**
 * Convert SHACL report to CSV format
 */
function exportReportAsCSV(report) {
  const headers = [
    'Severity',
    'Focus Node',
    'Path',
    'Value',
    'Message',
    'Source Shape',
    'Constraint Component'
  ];
  
  const allIssues = [...report.violations, ...report.warnings, ...report.infos];
  
  const rows = [headers.join(',')];
  
  for (const issue of allIssues) {
    const row = [
      issue.severity,
      escapeCsvValue(issue.focusNode || ''),
      escapeCsvValue(issue.path || ''),
      escapeCsvValue(issue.value || ''),
      escapeCsvValue(issue.message ? issue.message.join('; ') : ''),
      escapeCsvValue(issue.sourceShape || ''),
      escapeCsvValue(issue.sourceConstraintComponent || '')
    ];
    rows.push(row.join(','));
  }
  
  return rows.join('\n');
}

/**
 * Escape CSV value
 */
function escapeCsvValue(value) {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Clear SHACL shapes cache
 */
function clearCache() {
  shapesCache.clear();
  console.log('✅ SHACL shapes cache cleared');
}

module.exports = {
  validateWithSHACL,
  exportReportAsTurtle,
  exportReportAsCSV,
  loadSHACLShapes,
  clearCache
};
