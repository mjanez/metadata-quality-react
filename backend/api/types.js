/**
 * API Types and Validation Profiles
 * 
 * This module defines the types and constants used by the API endpoints.
 */

// Supported validation profiles
const VALIDATION_PROFILES = {
  DCAT_AP: 'dcat_ap',
  DCAT_AP_ES: 'dcat_ap_es',
  DCAT_AP_ES_HVD: 'dcat_ap_es_hvd',
  NTI_RISP: 'nti_risp'
};

// Supported RDF formats
const RDF_FORMATS = {
  TURTLE: 'turtle',
  RDFXML: 'rdfxml',
  JSONLD: 'jsonld',
  NTRIPLES: 'ntriples',
  AUTO: 'auto'
};

// Output formats for quality results
const OUTPUT_FORMATS = {
  JSON: 'json',
  JSONLD: 'jsonld',
  DQV: 'dqv'
};

// SHACL report output formats
const SHACL_OUTPUT_FORMATS = {
  JSON: 'json',
  TURTLE: 'turtle',
  CSV: 'csv'
};

// Quality dimensions (FAIR+C)
const QUALITY_DIMENSIONS = [
  'findability',
  'accessibility', 
  'interoperability',
  'reusability',
  'contextuality'
];

// DQV Namespaces
const DQV_NAMESPACES = {
  DQV: 'http://www.w3.org/ns/dqv#',
  DCAT: 'http://www.w3.org/ns/dcat#',
  DCT: 'http://purl.org/dc/terms/',
  PROV: 'http://www.w3.org/ns/prov#',
  XSD: 'http://www.w3.org/2001/XMLSchema#',
  RDFS: 'http://www.w3.org/2000/01/rdf-schema#',
  OA: 'http://www.w3.org/ns/oa#',
  LDQD: 'http://www.w3.org/2016/05/ldqd#'
};

/**
 * Validate request parameters for quality endpoint
 */
function validateQualityRequest(body) {
  const errors = [];

  // Check required fields
  if (!body.content && !body.url) {
    errors.push('Either "content" or "url" is required');
  }

  if (body.content && body.url) {
    errors.push('Provide either "content" or "url", not both');
  }

  // Validate profile
  if (body.profile) {
    const validProfiles = Object.values(VALIDATION_PROFILES);
    if (!validProfiles.includes(body.profile)) {
      errors.push(`Invalid profile. Valid options: ${validProfiles.join(', ')}`);
    }
  }

  // Validate format
  if (body.format) {
    const validFormats = Object.values(RDF_FORMATS);
    if (!validFormats.includes(body.format)) {
      errors.push(`Invalid format. Valid options: ${validFormats.join(', ')}`);
    }
  }

  // Validate output format
  if (body.outputFormat) {
    const validOutputFormats = Object.values(OUTPUT_FORMATS);
    if (!validOutputFormats.includes(body.outputFormat)) {
      errors.push(`Invalid outputFormat. Valid options: ${validOutputFormats.join(', ')}`);
    }
  }

  return errors;
}

/**
 * Validate request parameters for SHACL endpoint
 */
function validateSHACLRequest(body) {
  const errors = [];

  // Check required fields
  if (!body.content && !body.url) {
    errors.push('Either "content" or "url" is required');
  }

  if (body.content && body.url) {
    errors.push('Provide either "content" or "url", not both');
  }

  // Validate profile
  if (body.profile) {
    const validProfiles = Object.values(VALIDATION_PROFILES);
    if (!validProfiles.includes(body.profile)) {
      errors.push(`Invalid profile. Valid options: ${validProfiles.join(', ')}`);
    }
  }

  // Validate format
  if (body.format) {
    const validFormats = Object.values(RDF_FORMATS);
    if (!validFormats.includes(body.format)) {
      errors.push(`Invalid format. Valid options: ${validFormats.join(', ')}`);
    }
  }

  // Validate output format
  if (body.outputFormat) {
    const validOutputFormats = Object.values(SHACL_OUTPUT_FORMATS);
    if (!validOutputFormats.includes(body.outputFormat)) {
      errors.push(`Invalid outputFormat. Valid options: ${validOutputFormats.join(', ')}`);
    }
  }

  return errors;
}

module.exports = {
  VALIDATION_PROFILES,
  RDF_FORMATS,
  OUTPUT_FORMATS,
  SHACL_OUTPUT_FORMATS,
  QUALITY_DIMENSIONS,
  DQV_NAMESPACES,
  validateQualityRequest,
  validateSHACLRequest
};
