/**
 * APIResponseConverter - Converts backend API JSON response to Dashboard-compatible format
 * 
 * This service transforms the JSON output from the backend quality/SHACL API
 * into the format expected by the Dashboard components.
 */

import { DashboardMetricsData, DashboardSHACLData, Profile } from '../components/Dashboard/DashboardTypes';

/**
 * API Response format from backend /api/quality endpoint
 */
export interface APIQualityResponse {
  success: boolean;
  profile: string;
  version: string;
  quality: {
    totalScore: number;
    maxScore: number;
    percentage: number;
    byCategory: {
      [category: string]: {
        score: number;
        maxScore: number;
        percentage: number;
        metrics: APIMetric[];
      };
    };
  };
  shacl: {
    conforms: boolean;
    totalViolations: number;
    violations: number;
    warnings: number;
  };
  metrics: APIMetric[];
  shaclViolations: APISHACLResult[];
  shaclWarnings: APISHACLResult[];
  stats: {
    triples: number;
    subjects: number;
    predicates: number;
    objects: number;
    datasets: number;
    distributions: number;
    catalogs: number;
    dataServices: number;
  };
  timestamp: string;
}

export interface APIMetric {
  id: string;
  name: string;
  property: string;
  score: number;
  maxScore: number;
  weight: number;
  category: string;
  entityType: string;
  totalEntities: number;
  compliantEntities: number;
  compliancePercentage: number;
  found: boolean;
  datasetEntities?: { total: number; compliant: number };
  distributionEntities?: { total: number; compliant: number };
}

export interface APISHACLResult {
  focusNode: string;
  path: string;
  value: string;
  message: string[];
  severity: string;
  sourceConstraintComponent: string;
  sourceShape: string;
}

/**
 * Profile name mappings for human-readable display
 */
const PROFILE_NAMES: Record<string, string> = {
  'dcat_ap': 'DCAT-AP',
  'dcat-ap': 'DCAT-AP',
  'dcat_ap_es': 'DCAT-AP-ES',
  'dcat-ap-es': 'DCAT-AP-ES',
  'dcat_ap_es_hvd': 'DCAT-AP-ES HVD',
  'dcat-ap-es-hvd': 'DCAT-AP-ES HVD',
  'nti_risp': 'NTI-RISP',
  'nti-risp': 'NTI-RISP'
};

/**
 * Profile URLs for documentation links
 */
const PROFILE_URLS: Record<string, string> = {
  'dcat_ap': 'https://semiceu.github.io/DCAT-AP/',
  'dcat-ap': 'https://semiceu.github.io/DCAT-AP/',
  'dcat_ap_es': 'https://datos.gob.es/es/documentacion/dcat-ap-es',
  'dcat-ap-es': 'https://datos.gob.es/es/documentacion/dcat-ap-es',
  'dcat_ap_es_hvd': 'https://datos.gob.es/es/documentacion/dcat-ap-es',
  'dcat-ap-es-hvd': 'https://datos.gob.es/es/documentacion/dcat-ap-es',
  'nti_risp': 'https://datos.gob.es/es/documentacion/nti-risp',
  'nti-risp': 'https://datos.gob.es/es/documentacion/nti-risp'
};

/**
 * Dimension name mappings from category names
 */
const DIMENSION_MAP: Record<string, keyof DashboardMetricsData['dimensions']> = {
  'findability': 'findability',
  'accessibility': 'accessibility',
  'interoperability': 'interoperability',
  'reusability': 'reusability',
  'contextuality': 'contextuality'
};

/**
 * Get a quality rating based on percentage score
 */
function getRating(percentage: number): string {
  if (percentage >= 80) return 'Excellent';
  if (percentage >= 60) return 'Good';
  if (percentage >= 40) return 'Sufficient';
  if (percentage >= 20) return 'Bad';
  return 'Poor';
}

/**
 * Check if JSON is in API response format
 */
export function isAPIResponseFormat(data: any): data is APIQualityResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    'quality' in data &&
    'metrics' in data &&
    Array.isArray(data.metrics) &&
    data.quality?.byCategory !== undefined
  );
}

/**
 * Check if JSON is in Dashboard metrics format
 */
export function isDashboardMetricsFormat(data: any): data is DashboardMetricsData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'dimensions' in data &&
    'metrics' in data &&
    typeof data.totalScore === 'number' &&
    data.profile?.id !== undefined
  );
}

/**
 * Convert API response format to Dashboard metrics format
 */
export function convertAPIToDashboardMetrics(apiResponse: APIQualityResponse): DashboardMetricsData {
  const { quality, profile, version, timestamp, stats } = apiResponse;
  
  // Build profile object
  const normalizedProfileId = profile.replace(/_/g, '-').toLowerCase();
  const profileObj: Profile = {
    id: normalizedProfileId,
    name: PROFILE_NAMES[profile] || PROFILE_NAMES[normalizedProfileId] || profile.toUpperCase(),
    version: version || '1.0.0',
    url: PROFILE_URLS[profile] || PROFILE_URLS[normalizedProfileId] || ''
  };

  // Calculate dimension scores (percentages)
  const dimensions: DashboardMetricsData['dimensions'] = {
    findability: 0,
    accessibility: 0,
    interoperability: 0,
    reusability: 0,
    contextuality: 0
  };

  // Fill dimension percentages from byCategory
  for (const [category, categoryData] of Object.entries(quality.byCategory)) {
    const dimensionKey = DIMENSION_MAP[category.toLowerCase()];
    if (dimensionKey) {
      dimensions[dimensionKey] = categoryData.percentage;
    }
  }

  // Convert metrics to Dashboard format
  const metrics: DashboardMetricsData['metrics'] = apiResponse.metrics.map(metric => ({
    id: metric.id,
    dimension: DIMENSION_MAP[metric.category.toLowerCase()] || metric.category,
    score: metric.score,
    maxScore: metric.maxScore,
    percentage: metric.compliancePercentage / 100, // Convert to 0-1 range
    weight: metric.weight,
    found: metric.found,
    description: `${metric.property} - ${metric.name}`,
    entityType: metric.entityType,
    totalEntities: metric.totalEntities,
    compliantEntities: metric.compliantEntities,
    compliancePercentage: metric.compliancePercentage,
    datasetEntities: metric.datasetEntities,
    distributionEntities: metric.distributionEntities
  }));

  // Generate source identifier
  const source = `api-validation-${timestamp || new Date().toISOString()}`;
  const created = timestamp ? timestamp.split('T')[0] : new Date().toISOString().split('T')[0];

  return {
    source,
    created,
    totalScore: quality.totalScore,
    maxScore: quality.maxScore,
    rating: getRating(quality.percentage),
    profile: profileObj,
    dimensions,
    metrics
  };
}

/**
 * Convert API SHACL results to TTL format for Dashboard
 */
export function convertAPIToSHACLData(apiResponse: APIQualityResponse): DashboardSHACLData | null {
  const { shaclViolations, shaclWarnings, shacl, profile, version } = apiResponse;
  
  // If no SHACL data, return null
  if (!shacl || (shaclViolations.length === 0 && shaclWarnings.length === 0)) {
    return null;
  }

  // Build profile object
  const normalizedProfileId = profile.replace(/_/g, '-').toLowerCase();
  const profileObj: Profile = {
    id: normalizedProfileId,
    name: PROFILE_NAMES[profile] || PROFILE_NAMES[normalizedProfileId] || profile.toUpperCase(),
    version: version || '1.0.0',
    url: PROFILE_URLS[profile] || PROFILE_URLS[normalizedProfileId] || ''
  };

  // Generate synthetic TTL content from SHACL results
  const ttlContent = generateSHACLTTL(apiResponse);

  return {
    ttlContent,
    fileName: `api-shacl-report-${new Date().toISOString().split('T')[0]}.ttl`,
    profile: profileObj
  };
}

/**
 * Generate SHACL TTL report from API response
 */
function generateSHACLTTL(apiResponse: APIQualityResponse): string {
  const { shaclViolations, shaclWarnings, shacl } = apiResponse;
  
  const lines: string[] = [
    '@prefix sh: <http://www.w3.org/ns/shacl#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    '@prefix dcat: <http://www.w3.org/ns/dcat#> .',
    '@prefix dct: <http://purl.org/dc/terms/> .',
    '@prefix foaf: <http://xmlns.com/foaf/0.1/> .',
    '',
    '[] a sh:ValidationReport ;',
    `    sh:conforms ${shacl.conforms ? 'true' : 'false'} ;`
  ];

  let resultIndex = 0;

  // Add violations
  for (const violation of shaclViolations) {
    resultIndex++;
    lines.push(`    sh:result _:result${resultIndex} ;`);
  }

  // Add warnings
  for (const warning of shaclWarnings) {
    resultIndex++;
    if (resultIndex === shaclViolations.length + shaclWarnings.length) {
      lines.push(`    sh:result _:result${resultIndex} .`);
    } else {
      lines.push(`    sh:result _:result${resultIndex} ;`);
    }
  }

  if (resultIndex === 0) {
    // Remove trailing semicolon and add period
    lines[lines.length - 1] = lines[lines.length - 1].replace(' ;', ' .');
  }

  lines.push('');

  // Generate result nodes for violations
  resultIndex = 0;
  for (const violation of shaclViolations) {
    resultIndex++;
    lines.push(...generateResultNode(resultIndex, violation, 'sh:Violation'));
  }

  // Generate result nodes for warnings
  for (const warning of shaclWarnings) {
    resultIndex++;
    lines.push(...generateResultNode(resultIndex, warning, 'sh:Warning'));
  }

  return lines.join('\n');
}

/**
 * Generate a single SHACL result node
 */
function generateResultNode(index: number, result: APISHACLResult, severity: string): string[] {
  const lines: string[] = [
    `_:result${index} a sh:ValidationResult ;`,
    `    sh:resultSeverity ${severity} ;`,
    `    sh:focusNode <${result.focusNode}> ;`
  ];

  if (result.path) {
    lines.push(`    sh:resultPath <${result.path}> ;`);
  }

  // Add messages
  for (let i = 0; i < result.message.length; i++) {
    const msg = result.message[i];
    // Clean up the message format (remove extra quotes if present)
    const cleanMsg = msg.replace(/^"(.+)"@(\w+)$/, '$1');
    const lang = msg.match(/@(\w+)$/)?.[1] || 'en';
    
    if (i === result.message.length - 1 && !result.sourceShape) {
      lines.push(`    sh:resultMessage "${cleanMsg}"@${lang} .`);
    } else {
      lines.push(`    sh:resultMessage "${cleanMsg}"@${lang} ;`);
    }
  }

  if (result.sourceShape) {
    lines.push(`    sh:sourceShape <${result.sourceShape}> .`);
  }

  lines.push('');
  return lines;
}

/**
 * Auto-detect format and convert if needed
 * Returns Dashboard-compatible data
 */
export function autoConvertToMetrics(data: any): DashboardMetricsData {
  if (isDashboardMetricsFormat(data)) {
    // Already in correct format
    return data;
  }
  
  if (isAPIResponseFormat(data)) {
    // Convert from API format
    return convertAPIToDashboardMetrics(data);
  }
  
  throw new Error('Unknown JSON format. Expected either Dashboard metrics format or API response format.');
}

/**
 * Extract SHACL data from API response if available
 */
export function extractSHACLFromAPI(data: any): DashboardSHACLData | null {
  if (isAPIResponseFormat(data)) {
    return convertAPIToSHACLData(data);
  }
  return null;
}

/**
 * Validate that JSON has required fields for Dashboard
 */
export function validateDashboardJSON(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Invalid JSON: expected an object');
    return { valid: false, errors };
  }
  
  // Check for API response format
  if (isAPIResponseFormat(data)) {
    if (typeof data.quality?.totalScore !== 'number') {
      errors.push('Missing or invalid quality.totalScore');
    }
    if (!Array.isArray(data.metrics)) {
      errors.push('Missing or invalid metrics array');
    }
    return { valid: errors.length === 0, errors };
  }
  
  // Check for Dashboard format
  if (isDashboardMetricsFormat(data)) {
    if (typeof data.totalScore !== 'number') {
      errors.push('Missing or invalid totalScore');
    }
    if (!data.dimensions) {
      errors.push('Missing dimensions object');
    }
    if (!Array.isArray(data.metrics)) {
      errors.push('Missing or invalid metrics array');
    }
    return { valid: errors.length === 0, errors };
  }
  
  errors.push('JSON format not recognized. Expected Dashboard metrics or API response format.');
  return { valid: false, errors };
}

export default {
  isAPIResponseFormat,
  isDashboardMetricsFormat,
  convertAPIToDashboardMetrics,
  convertAPIToSHACLData,
  autoConvertToMetrics,
  extractSHACLFromAPI,
  validateDashboardJSON
};
