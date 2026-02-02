/**
 * Quality Assessment Service
 * 
 * Server-side implementation of metadata quality assessment following
 * the MQA (Metadata Quality Assessment) methodology.
 * 
 * This service uses the shared configuration from mqa-config.json
 * to ensure consistency with the frontend implementation.
 */

const N3 = require('n3');
const fs = require('fs').promises;
const path = require('path');
const { parseRDF, getRDFStats, preprocessRdfForInvalidIRIs, detectFormat } = require('./rdf-utils');
const { checkURLAccessible, checkURLsAccessibility } = require('./url-validator');

// Quality dimensions (from shared config)
const DIMENSIONS = ['findability', 'accessibility', 'interoperability', 'reusability', 'contextuality'];

// Property expansion prefixes - shared with frontend
const PREFIXES = {
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

// Entity type URIs
const ENTITY_TYPES = {
  Dataset: 'http://www.w3.org/ns/dcat#Dataset',
  Distribution: 'http://www.w3.org/ns/dcat#Distribution',
  Catalog: 'http://www.w3.org/ns/dcat#Catalog'
};

// RDF type predicate
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/**
 * Vocabulary cache
 */
const vocabularyCache = new Map();

/**
 * Load vocabulary from JSONL file
 */
async function loadVocabulary(name) {
  if (vocabularyCache.has(name)) {
    return vocabularyCache.get(name);
  }
  
  try {
    const vocabPath = path.join(__dirname, '..', '..', 'public', 'data', `${name}.jsonl`);
    const content = await fs.readFile(vocabPath, 'utf-8');
    const items = content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    
    vocabularyCache.set(name, items);
    console.log(`✅ Loaded vocabulary ${name}: ${items.length} items`);
    return items;
  } catch (error) {
    console.warn(`⚠️ Failed to load vocabulary ${name}:`, error.message);
    return [];
  }
}

/**
 * Expand short property to full URI
 */
function expandProperty(property) {
  for (const [prefix, uri] of Object.entries(PREFIXES)) {
    if (property.startsWith(prefix)) {
      return property.replace(prefix, uri);
    }
  }
  return property;
}

/**
 * Count entities of a specific type
 */
function countEntitiesByType(store, entityType) {
  const typeURI = ENTITY_TYPES[entityType];
  if (!typeURI) return 0;
  
  const typeQuads = store.getQuads(null, RDF_TYPE, typeURI, null);
  return typeQuads.length;
}

/**
 * Count entities that have a specific property
 */
function countCompliantEntities(store, property, entityType) {
  const typeURI = ENTITY_TYPES[entityType];
  const fullProperty = expandProperty(property);
  
  // Get all entities of the type
  const entityQuads = store.getQuads(null, RDF_TYPE, typeURI, null);
  
  let compliantCount = 0;
  
  for (const entityQuad of entityQuads) {
    const entityURI = entityQuad.subject;
    const propertyQuads = store.getQuads(entityURI, fullProperty, null, null);
    
    if (propertyQuads.length > 0) {
      // Check if any value is non-empty
      const hasValidValue = propertyQuads.some(q => {
        if (q.object.termType === 'Literal') {
          return q.object.value && q.object.value.trim().length > 0;
        }
        return true; // NamedNode or BlankNode are considered valid
      });
      
      if (hasValidValue) {
        compliantCount++;
      }
    }
  }
  
  return compliantCount;
}

/**
 * Check if value matches vocabulary
 */
async function checkVocabularyMatch(values, vocabularyName) {
  const vocabulary = await loadVocabulary(vocabularyName);
  if (!vocabulary || vocabulary.length === 0) return false;
  
  const validValues = values.filter(v => v && typeof v === 'string' && v.trim().length > 0);
  
  for (const value of validValues) {
    const normalizedValue = value.toLowerCase().trim();
    
    for (const item of vocabulary) {
      const uriMatch = item.uri && item.uri.toLowerCase().trim() === normalizedValue;
      const valueMatch = item.value && item.value.toLowerCase().trim() === normalizedValue;
      const labelMatch = item.label && item.label.toLowerCase().trim() === normalizedValue;
      
      if (uriMatch || valueMatch || labelMatch) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Count vocabulary-compliant entities
 */
async function countVocabularyCompliantEntities(store, property, vocabularyName, entityType) {
  const typeURI = ENTITY_TYPES[entityType];
  const fullProperty = expandProperty(property);
  
  const entityQuads = store.getQuads(null, RDF_TYPE, typeURI, null);
  let compliantCount = 0;
  
  for (const entityQuad of entityQuads) {
    const entityURI = entityQuad.subject;
    const propertyQuads = store.getQuads(entityURI, fullProperty, null, null);
    
    if (propertyQuads.length > 0) {
      const values = propertyQuads.map(q => q.object.value).filter(v => v);
      const isInVocabulary = await checkVocabularyMatch(values, vocabularyName);
      
      if (isInVocabulary) {
        compliantCount++;
      }
    }
  }
  
  return compliantCount;
}

/**
 * Count URL status compliant entities (URLs that are accessible)
 * Uses shared url-validator module for consistent behavior
 */
async function countURLStatusCompliant(store, property, entityType) {
  const typeURI = ENTITY_TYPES[entityType];
  const fullProperty = expandProperty(property);
  
  console.log(`🔍 URL Status Check: property=${property}, entityType=${entityType}`);
  
  const entityQuads = store.getQuads(null, RDF_TYPE, typeURI, null);
  const urls = [];
  
  for (const entityQuad of entityQuads) {
    const entityURI = entityQuad.subject;
    const propertyQuads = store.getQuads(entityURI, fullProperty, null, null);
    
    if (propertyQuads.length > 0) {
      const url = propertyQuads[0].object.value;
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        urls.push(url);
      }
    }
  }
  
  console.log(`📊 Found ${urls.length} URLs to check for ${property}`);
  if (urls.length > 0) {
    console.log(`   Sample URLs: ${urls.slice(0, 3).join(', ')}...`);
  }
  
  // Use shared URL validator
  const result = await checkURLsAccessibility(urls, 5, 5000);
  console.log(`✅ URL accessibility result: ${result.accessible}/${result.total} accessible (rate: ${(result.rate * 100).toFixed(1)}%)`);
  
  return result.accessible;
}

/**
 * Get metric entity type
 */
function getMetricEntityType(metricId) {
  const multiEntityMetrics = ['dct_issued', 'dct_modified', 'dct_title', 'dct_description'];
  const datasetMetrics = [
    'dcat_keyword', 'dcat_theme', 'dct_spatial', 'dct_temporal',
    'dct_creator', 'dct_language', 'dcat_contact_point',
    'dct_access_rights', 'dct_publisher', 'dct_access_rights_vocabulary'
  ];
  const distributionMetrics = [
    'dcat_access_url', 'dcat_download_url', 'dct_format', 'dcat_media_type',
    'dcat_byte_size', 'dct_rights', 'dct_format_vocabulary',
    'dcat_media_type_vocabulary', 'dct_format_nonproprietary',
    'dct_format_machine_readable', 'dcat_access_url_status',
    'dcat_download_url_status', 'dct_license', 'dct_license_vocabulary'
  ];
  
  if (multiEntityMetrics.includes(metricId)) return 'Multi';
  if (distributionMetrics.includes(metricId)) return 'Distribution';
  if (datasetMetrics.includes(metricId)) return 'Dataset';
  return 'Catalog';
}

/**
 * Get vocabulary info for a metric
 */
function getVocabularyMetricInfo(metricId) {
  const vocabularyMetrics = {
    'dct_format_vocabulary': { property: 'dct:format', vocabulary: 'file_types' },
    'dcat_media_type_vocabulary': { property: 'dcat:mediaType', vocabulary: 'media_types' },
    'dct_format_nonproprietary': { property: 'dct:format', vocabulary: 'non_proprietary' },
    'dct_format_machine_readable': { property: 'dct:format', vocabulary: 'machine_readable' },
    'dct_license_vocabulary': { property: 'dct:license', vocabulary: 'licenses' },
    'dct_access_rights_vocabulary': { property: 'dct:accessRights', vocabulary: 'access_rights' }
  };
  
  return vocabularyMetrics[metricId] || null;
}

/**
 * Evaluate a single metric
 */
async function evaluateMetric(store, metricConfig, profile, category) {
  const { id, weight, property } = metricConfig;
  const entityType = getMetricEntityType(id);
  
  let totalEntities = 0;
  let compliantEntities = 0;
  
  if (entityType === 'Multi') {
    // Count both datasets and distributions
    const datasetTotal = countEntitiesByType(store, 'Dataset');
    const datasetCompliant = countCompliantEntities(store, property, 'Dataset');
    const distTotal = countEntitiesByType(store, 'Distribution');
    const distCompliant = countCompliantEntities(store, property, 'Distribution');
    
    totalEntities = datasetTotal + distTotal;
    compliantEntities = datasetCompliant + distCompliant;
  } else {
    totalEntities = countEntitiesByType(store, entityType);
    
    // Check if URL status metric (requires HTTP validation)
    if (id.includes('_url_status')) {
      console.log(`🔄 Metric ${id} detected as URL status metric - running HTTP validation`);
      compliantEntities = await countURLStatusCompliant(store, property, entityType);
    }
    // Check if vocabulary metric
    else if (getVocabularyMetricInfo(id)) {
      const vocabInfo = getVocabularyMetricInfo(id);
      compliantEntities = await countVocabularyCompliantEntities(
        store, vocabInfo.property, vocabInfo.vocabulary, entityType
      );
    } else if (id.includes('compliance')) {
      // Compliance metrics - will be updated by SHACL validation
      compliantEntities = 0;
    } else {
      compliantEntities = countCompliantEntities(store, property, entityType);
    }
  }
  
  // Calculate score
  const compliancePercentage = totalEntities > 0 ? (compliantEntities / totalEntities) * 100 : 0;
  const score = totalEntities > 0 ? (compliantEntities / totalEntities) * weight : 0;
  
  return {
    id,
    name: id.replace(/_/g, ' ').replace(/^dcat |^dct /, ''),
    property,
    score: Math.round(score * 1000) / 1000,
    maxScore: weight,
    weight,
    category,
    entityType,
    totalEntities,
    compliantEntities,
    compliancePercentage: Math.round(compliancePercentage * 10) / 10,
    found: totalEntities > 0
  };
}

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
 * Calculate quality assessment
 */
async function calculateQuality(content, profile, format, version) {
  // Preprocess and detect format
  const { processedContent, warnings } = preprocessRdfForInvalidIRIs(content);
  const detectedFormat = format === 'auto' ? detectFormat(processedContent) : format;
  
  // Parse RDF
  const store = await parseRDF(processedContent, detectedFormat);
  
  if (store.size === 0) {
    throw new Error('No RDF triples found in content');
  }
  
  // Get RDF statistics
  const stats = getRDFStats(store);
  
  // Load configuration
  const config = await loadMQAConfig();
  const profileConfig = config.profiles[profile];
  const metricsConfig = config.profile_metrics[profile];
  
  if (!profileConfig || !metricsConfig) {
    throw new Error(`Profile '${profile}' not found in configuration`);
  }
  
  // Evaluate metrics by category
  const allMetrics = [];
  const byCategory = {};
  
  for (const [category, metrics] of Object.entries(metricsConfig)) {
    const categoryMetrics = [];
    
    for (const metricConfig of metrics) {
      const metric = await evaluateMetric(store, metricConfig, profile, category);
      categoryMetrics.push(metric);
      allMetrics.push(metric);
    }
    
    const categoryScore = categoryMetrics.reduce((sum, m) => sum + m.score, 0);
    const categoryMaxScore = categoryMetrics.reduce((sum, m) => sum + m.maxScore, 0);
    
    byCategory[category] = {
      score: Math.round(categoryScore * 1000) / 1000,
      maxScore: categoryMaxScore,
      percentage: categoryMaxScore > 0 ? (categoryScore / categoryMaxScore) * 100 : 0,
      metrics: categoryMetrics
    };
  }
  
  // Calculate totals
  const totalScore = allMetrics.reduce((sum, m) => sum + m.score, 0);
  const maxScore = allMetrics.reduce((sum, m) => sum + m.maxScore, 0);
  const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
  
  return {
    profile,
    version: version || profileConfig.defaultVersion,
    totalScore: Math.round(totalScore * 1000) / 1000,
    maxScore,
    percentage: Math.round(percentage * 10) / 10,
    metrics: allMetrics,
    byCategory,
    stats,
    warnings,
    timestamp: new Date().toISOString()
  };
}

/**
 * Convert quality result to JSON-LD (DQV format)
 */
function convertToDQV(quality, baseUri = 'http://example.org/quality-assessment/') {
  const assessmentId = `${baseUri}assessment-${Date.now()}`;
  
  const dqv = {
    '@context': {
      'dqv': 'http://www.w3.org/ns/dqv#',
      'dcat': 'http://www.w3.org/ns/dcat#',
      'dct': 'http://purl.org/dc/terms/',
      'prov': 'http://www.w3.org/ns/prov#',
      'xsd': 'http://www.w3.org/2001/XMLSchema#',
      'ldqd': 'http://www.w3.org/2016/05/ldqd#',
      'oa': 'http://www.w3.org/ns/oa#'
    },
    '@id': assessmentId,
    '@type': 'dqv:QualityAnnotation',
    'dct:created': {
      '@type': 'xsd:dateTime',
      '@value': quality.timestamp
    },
    'dct:title': `Metadata Quality Assessment - ${quality.profile}`,
    'dct:description': `Quality assessment using ${quality.profile} profile version ${quality.version}`,
    'dqv:computedOn': {
      '@type': 'dcat:Dataset',
      'dct:description': 'Evaluated RDF metadata'
    },
    'dqv:hasQualityMeasurement': []
  };
  
  // Add overall score
  dqv['dqv:hasQualityMeasurement'].push({
    '@type': 'dqv:QualityMeasurement',
    'dqv:isMeasurementOf': {
      '@type': 'dqv:Metric',
      '@id': `${baseUri}metrics/overall-score`,
      'dct:title': 'Overall Quality Score',
      'dct:description': 'Total quality score as percentage'
    },
    'dqv:value': {
      '@type': 'xsd:decimal',
      '@value': quality.percentage.toString()
    }
  });
  
  // Add dimension scores
  for (const [dimension, data] of Object.entries(quality.byCategory)) {
    const dimensionId = `${baseUri}dimensions/${dimension}`;
    
    dqv['dqv:hasQualityMeasurement'].push({
      '@type': 'dqv:QualityMeasurement',
      'dqv:isMeasurementOf': {
        '@type': 'dqv:Dimension',
        '@id': dimensionId,
        'dct:title': dimension.charAt(0).toUpperCase() + dimension.slice(1),
        'dct:description': `FAIR+C ${dimension} dimension`
      },
      'dqv:value': {
        '@type': 'xsd:decimal',
        '@value': data.percentage.toFixed(2)
      }
    });
    
    // Add individual metric measurements
    for (const metric of data.metrics) {
      dqv['dqv:hasQualityMeasurement'].push({
        '@type': 'dqv:QualityMeasurement',
        'dqv:isMeasurementOf': {
          '@type': 'dqv:Metric',
          '@id': `${baseUri}metrics/${metric.id}`,
          'dct:title': metric.name,
          'dqv:inDimension': { '@id': dimensionId }
        },
        'dqv:value': {
          '@type': 'xsd:decimal',
          '@value': metric.compliancePercentage.toString()
        },
        'dct:description': `${metric.compliantEntities}/${metric.totalEntities} ${metric.entityType} entities comply`
      });
    }
  }
  
  return dqv;
}

module.exports = {
  calculateQuality,
  convertToDQV,
  loadVocabulary,
  loadMQAConfig
};
