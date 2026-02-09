/**
 * Shared Types for MQA Services
 * 
 * These types are used by both frontend and backend applications.
 */

// ============================================================================
// Validation Profiles
// ============================================================================

export type ValidationProfile = 'dcat_ap' | 'dcat_ap_es' | 'nti_risp' | 'dcat_ap_es_hvd' | 'dcat_ap_es_legacy';

export interface ProfileSelection {
  profile: ValidationProfile;
  version?: string;
}

export interface ProfileConfig {
  name: string;
  defaultVersion: string;
  versions: {
    [version: string]: {
      name: string;
      maxScore: number;
      url?: string;
      shaclFiles?: string[];
    };
  };
}

// ============================================================================
// RDF Types
// ============================================================================

export type RDFFormat = 'turtle' | 'rdfxml' | 'jsonld' | 'ntriples' | 'auto';

export interface RDFValidationResult {
  valid: boolean;
  error?: string;
  lineNumber?: number;
  warnings?: string[];
  preprocessingApplied?: boolean;
}

export interface RDFStats {
  triples: number;
  subjects: number;
  predicates: number;
  objects: number;
  datasets: number;
  distributions: number;
  catalogs?: number;
  dataServices?: number;
}

// ============================================================================
// Quality Assessment Types
// ============================================================================

export type QualityDimension = 
  | 'findability' 
  | 'accessibility' 
  | 'interoperability' 
  | 'reusability' 
  | 'contextuality';

export type EntityType = 'Dataset' | 'Distribution' | 'Catalog' | 'Multi';

export interface QualityMetric {
  id: string;
  name: string;
  property: string;
  score: number;
  maxScore: number;
  weight: number;
  category: QualityDimension;
  entityType: EntityType;
  totalEntities: number;
  compliantEntities: number;
  compliancePercentage: number;
  found: boolean;
  value?: string;
  description?: string;
  datasetEntities?: { total: number; compliant: number };
  distributionEntities?: { total: number; compliant: number };
}

export interface CategoryResult {
  score: number;
  maxScore: number;
  percentage: number;
  metrics: QualityMetric[];
}

export interface QualityResult {
  profile: ValidationProfile;
  version: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  metrics: QualityMetric[];
  byCategory: { [category: string]: CategoryResult };
  stats: RDFStats;
  warnings?: string[];
  timestamp: string;
}

// ============================================================================
// SHACL Validation Types
// ============================================================================

export type SHACLSeverity = 'Violation' | 'Warning' | 'Info';

export interface SHACLViolation {
  focusNode: string;
  path?: string;
  value?: string;
  message: string[];
  severity: SHACLSeverity;
  sourceConstraintComponent: string;
  sourceShape: string;
  resultSeverity?: string;
  foafPage?: string;
  translationKey?: string;
  translationParams?: Record<string, any>;
}

export interface SHACLReport {
  profile: ValidationProfile;
  version?: string;
  conforms: boolean;
  totalViolations: number;
  violations: SHACLViolation[];
  warnings: SHACLViolation[];
  infos: SHACLViolation[];
  timestamp: string;
  preprocessingWarnings?: string[];
  shapesLoaded?: number;
  shapesFailed?: number;
  dataTriples?: number;
  reportDataset?: any;
}

export interface SHACLValidationResult {
  conforms: boolean;
  results: SHACLViolation[];
  text?: string;
  graph?: any;
}

// ============================================================================
// DQV (Data Quality Vocabulary) Types
// ============================================================================

export interface DQVContext {
  dqv: string;
  dcat: string;
  dct: string;
  prov: string;
  xsd: string;
  ldqd: string;
  oa: string;
}

export interface DQVMeasurement {
  '@type': string;
  'dqv:isMeasurementOf': {
    '@type': string;
    '@id': string;
    'dct:title': string;
    'dct:description'?: string;
    'dqv:inDimension'?: { '@id': string };
  };
  'dqv:value': {
    '@type': string;
    '@value': string;
  };
  'dct:description'?: string;
}

export interface DQVReport {
  '@context': DQVContext;
  '@id': string;
  '@type': string;
  'dct:created': {
    '@type': string;
    '@value': string;
  };
  'dct:title': string;
  'dct:description': string;
  'dqv:computedOn': {
    '@type': string;
    'dct:description': string;
  };
  'dqv:hasQualityMeasurement': DQVMeasurement[];
}

// ============================================================================
// Vocabulary Types
// ============================================================================

export interface VocabularyItem {
  uri: string;
  value?: string;
  label?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface MQAConfig {
  app_info: {
    name: string;
    version: string;
    description: string;
    repository: string;
    url: string;
    see_also?: string;
  };
  profiles: { [key: string]: ProfileConfig };
  profile_metrics: { 
    [profile: string]: { 
      [category: string]: Array<{
        id: string;
        weight: number;
        property: string;
      }>;
    };
  };
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface QualityRequest {
  content?: string;
  url?: string;
  profile?: ValidationProfile;
  version?: string;
  format?: RDFFormat;
  outputFormat?: 'json' | 'jsonld' | 'dqv';
  language?: 'es' | 'en';
}

export interface SHACLRequest {
  content?: string;
  url?: string;
  profile?: ValidationProfile;
  version?: string;
  format?: RDFFormat;
  outputFormat?: 'json' | 'turtle' | 'csv';
  language?: 'es' | 'en';
}

export interface ValidationRequest {
  content?: string;
  url?: string;
  profile?: ValidationProfile;
  version?: string;
  format?: RDFFormat;
  language?: 'es' | 'en';
}

export interface QualityResponse {
  success: boolean;
  profile: ValidationProfile;
  version: string;
  quality: {
    totalScore: number;
    maxScore: number;
    percentage: number;
    byCategory: { [category: string]: CategoryResult };
  };
  metrics: QualityMetric[];
  stats: RDFStats;
  warnings?: string[];
  timestamp: string;
}

export interface SHACLResponse {
  success: boolean;
  profile: ValidationProfile;
  version: string;
  conforms: boolean;
  totalViolations: number;
  summary: {
    violations: number;
    warnings: number;
    infos: number;
  };
  violations: SHACLViolation[];
  warnings: SHACLViolation[];
  infos: SHACLViolation[];
  metadata: {
    shapesLoaded: number;
    shapesFailed: number;
    dataTriples: number;
    preprocessingWarnings?: string[];
  };
  timestamp: string;
}

export interface CombinedValidationResponse {
  success: boolean;
  profile: ValidationProfile;
  version: string;
  quality: {
    totalScore: number;
    maxScore: number;
    percentage: number;
    byCategory: { [category: string]: CategoryResult };
  };
  shacl: {
    conforms: boolean;
    totalViolations: number;
    violations: number;
    warnings: number;
  };
  metrics: QualityMetric[];
  shaclViolations: SHACLViolation[];
  shaclWarnings: SHACLViolation[];
  stats: RDFStats;
  timestamp: string;
}

export interface SyntaxValidationResponse {
  valid: boolean;
  format: RDFFormat;
  tripleCount?: number;
  error?: string;
  lineNumber?: number;
}

// ============================================================================
// API Constants
// ============================================================================

export const VALIDATION_PROFILES = {
  DCAT_AP: 'dcat_ap' as ValidationProfile,
  DCAT_AP_ES: 'dcat_ap_es' as ValidationProfile,
  NTI_RISP: 'nti_risp' as ValidationProfile,
  DCAT_AP_ES_HVD: 'dcat_ap_es_hvd' as ValidationProfile,
  DCAT_AP_ES_LEGACY: 'dcat_ap_es_legacy' as ValidationProfile
} as const;

export const RDF_FORMATS = {
  TURTLE: 'turtle' as RDFFormat,
  RDFXML: 'rdfxml' as RDFFormat,
  JSONLD: 'jsonld' as RDFFormat,
  NTRIPLES: 'ntriples' as RDFFormat,
  AUTO: 'auto' as RDFFormat
} as const;

export const OUTPUT_FORMATS = {
  JSON: 'json',
  JSONLD: 'jsonld',
  DQV: 'dqv'
} as const;

export const SHACL_OUTPUT_FORMATS = {
  JSON: 'json',
  TURTLE: 'turtle',
  CSV: 'csv'
} as const;
