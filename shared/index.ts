/**
 * Shared Module Exports
 * 
 * Main entry point for shared services used by both frontend and backend.
 */

// Types
export * from './types';

// Configuration
export { 
  loadMQAConfig, 
  getProfileConfig, 
  getProfileMetrics,
  getSHACLFiles,
  getAppInfo,
  getAvailableProfiles,
  clearConfigCache 
} from './config';

// Utilities
export {
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
} from './utils';
