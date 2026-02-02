/**
 * API Routes for Metadata Quality Assessment
 * 
 * This module defines the REST API endpoints for:
 * - Metadata quality assessment (MQA)
 * - SHACL validation
 * - Profile information
 */

const express = require('express');
const router = express.Router();
const { 
  VALIDATION_PROFILES, 
  RDF_FORMATS, 
  OUTPUT_FORMATS,
  SHACL_OUTPUT_FORMATS,
  validateQualityRequest,
  validateSHACLRequest
} = require('./types');
const { calculateQuality, convertToDQV, loadMQAConfig } = require('./quality-service');
const { validateWithSHACL, exportReportAsTurtle, exportReportAsCSV, clearCache } = require('./shacl-service');
const { detectFormat, validateRDFSyntax } = require('./rdf-utils');
const axios = require('axios');

/**
 * @route GET /api/v1/profiles
 * @description Get available validation profiles and their versions
 */
router.get('/profiles', async (req, res) => {
  try {
    const config = await loadMQAConfig();
    
    const profiles = {};
    for (const [profileId, profileConfig] of Object.entries(config.profiles)) {
      profiles[profileId] = {
        name: profileConfig.versions[profileConfig.defaultVersion]?.name || profileId,
        defaultVersion: profileConfig.defaultVersion,
        versions: Object.keys(profileConfig.versions).map(version => ({
          version,
          name: profileConfig.versions[version].name,
          maxScore: profileConfig.versions[version].maxScore,
          url: profileConfig.versions[version].url
        }))
      };
    }
    
    res.json({
      profiles,
      formats: Object.values(RDF_FORMATS),
      outputFormats: Object.values(OUTPUT_FORMATS),
      shaclOutputFormats: Object.values(SHACL_OUTPUT_FORMATS)
    });
  } catch (error) {
    console.error('Error getting profiles:', error);
    res.status(500).json({ error: 'Failed to load profiles' });
  }
});

/**
 * @route POST /api/v1/quality
 * @description Validate metadata quality and return assessment results
 * 
 * @body {string} content - RDF content as text (required if url not provided)
 * @body {string} url - URL to fetch RDF content from (required if content not provided)
 * @body {string} profile - Validation profile (dcat_ap, dcat_ap_es, nti_risp, dcat_ap_es_hvd)
 * @body {string} version - Profile version (optional, uses default if not specified)
 * @body {string} format - RDF format (turtle, rdfxml, jsonld, ntriples, auto)
 * @body {string} outputFormat - Output format (json, jsonld, dqv)
 * @body {string} language - Language for messages (es, en)
 * 
 * @returns Quality assessment results in requested format
 */
router.post('/quality', async (req, res) => {
  try {
    // Validate request
    const validationErrors = validateQualityRequest(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validationErrors
      });
    }
    
    const {
      content: rawContent,
      url,
      profile = 'dcat_ap_es',
      version,
      format = 'auto',
      outputFormat = 'json',
      language = 'es'
    } = req.body;
    
    // Get content from URL if provided
    let content = rawContent;
    if (url) {
      try {
        console.log(`📥 Fetching content from URL: ${url}`);
        const response = await axios.get(url, {
          timeout: 30000,
          headers: {
            'Accept': 'text/turtle, application/rdf+xml, application/ld+json, application/n-triples, */*'
          }
        });
        content = response.data;
        
        if (typeof content !== 'string') {
          content = JSON.stringify(content);
        }
      } catch (fetchError) {
        return res.status(400).json({
          error: 'Failed to fetch content from URL',
          details: fetchError.message
        });
      }
    }
    
    // Validate RDF syntax
    const detectedFormat = format === 'auto' ? detectFormat(content) : format;
    console.log(`📋 Detected format: ${detectedFormat}, Profile: ${profile}`);
    
    const syntaxResult = await validateRDFSyntax(content, detectedFormat);
    if (!syntaxResult.valid) {
      return res.status(400).json({
        error: 'RDF syntax error',
        details: syntaxResult.error,
        lineNumber: syntaxResult.lineNumber
      });
    }
    
    // Calculate quality
    console.log(`📊 Calculating quality for profile: ${profile}`);
    const quality = await calculateQuality(content, profile, detectedFormat, version);
    
    // Return in requested format
    if (outputFormat === 'jsonld' || outputFormat === 'dqv') {
      const dqv = convertToDQV(quality);
      res.setHeader('Content-Type', 'application/ld+json');
      return res.json(dqv);
    }
    
    // Default JSON response
    res.json({
      success: true,
      profile,
      version: quality.version,
      quality: {
        totalScore: quality.totalScore,
        maxScore: quality.maxScore,
        percentage: quality.percentage,
        byCategory: quality.byCategory
      },
      metrics: quality.metrics,
      stats: quality.stats,
      warnings: quality.warnings,
      timestamp: quality.timestamp
    });
    
  } catch (error) {
    console.error('Quality assessment error:', error);
    res.status(500).json({
      error: 'Quality assessment failed',
      details: error.message
    });
  }
});

/**
 * @route POST /api/v1/shacl
 * @description Validate RDF content against SHACL shapes
 * 
 * @body {string} content - RDF content as text (required if url not provided)
 * @body {string} url - URL to fetch RDF content from (required if content not provided)
 * @body {string} profile - Validation profile (dcat_ap, dcat_ap_es, nti_risp, dcat_ap_es_hvd)
 * @body {string} version - Profile version (optional)
 * @body {string} format - RDF format (turtle, rdfxml, jsonld, ntriples, auto)
 * @body {string} outputFormat - Output format (json, turtle, csv)
 * @body {string} language - Language for messages (es, en)
 * 
 * @returns SHACL validation report
 */
router.post('/shacl', async (req, res) => {
  try {
    // Validate request
    const validationErrors = validateSHACLRequest(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validationErrors
      });
    }
    
    const {
      content: rawContent,
      url,
      profile = 'dcat_ap_es',
      version,
      format = 'auto',
      outputFormat = 'json',
      language = 'es'
    } = req.body;
    
    // Get content from URL if provided
    let content = rawContent;
    if (url) {
      try {
        console.log(`📥 Fetching content from URL: ${url}`);
        const response = await axios.get(url, {
          timeout: 30000,
          headers: {
            'Accept': 'text/turtle, application/rdf+xml, application/ld+json, application/n-triples, */*'
          }
        });
        content = response.data;
        
        if (typeof content !== 'string') {
          content = JSON.stringify(content);
        }
      } catch (fetchError) {
        return res.status(400).json({
          error: 'Failed to fetch content from URL',
          details: fetchError.message
        });
      }
    }
    
    // Perform SHACL validation
    console.log(`🔍 SHACL validation for profile: ${profile}`);
    const report = await validateWithSHACL(content, profile, format, version, language);
    
    // Return in requested format
    if (outputFormat === 'turtle') {
      const turtle = await exportReportAsTurtle(report);
      res.setHeader('Content-Type', 'text/turtle');
      return res.send(turtle);
    }
    
    if (outputFormat === 'csv') {
      const csv = exportReportAsCSV(report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="shacl-report.csv"');
      return res.send(csv);
    }
    
    // Default JSON response
    res.json({
      success: true,
      profile: report.profile,
      version: report.version,
      conforms: report.conforms,
      totalViolations: report.totalViolations,
      summary: {
        violations: report.violations.length,
        warnings: report.warnings.length,
        infos: report.infos.length
      },
      violations: report.violations,
      warnings: report.warnings,
      infos: report.infos,
      metadata: {
        shapesLoaded: report.shapesLoaded,
        shapesFailed: report.shapesFailed,
        dataTriples: report.dataTriples,
        preprocessingWarnings: report.preprocessingWarnings
      },
      timestamp: report.timestamp
    });
    
  } catch (error) {
    console.error('SHACL validation error:', error);
    res.status(500).json({
      error: 'SHACL validation failed',
      details: error.message
    });
  }
});

/**
 * @route POST /api/v1/validate
 * @description Combined quality + SHACL validation endpoint
 * 
 * @body {string} content - RDF content as text (required if url not provided)
 * @body {string} url - URL to fetch RDF content from (required if content not provided)
 * @body {string} profile - Validation profile
 * @body {string} version - Profile version (optional)
 * @body {string} format - RDF format
 * @body {string} language - Language for messages
 * 
 * @returns Combined quality and SHACL validation results
 */
router.post('/validate', async (req, res) => {
  try {
    const validationErrors = validateQualityRequest(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validationErrors
      });
    }
    
    const {
      content: rawContent,
      url,
      profile = 'dcat_ap_es',
      version,
      format = 'auto',
      language = 'es'
    } = req.body;
    
    // Get content from URL if provided
    let content = rawContent;
    if (url) {
      try {
        console.log(`📥 Fetching content from URL: ${url}`);
        const response = await axios.get(url, {
          timeout: 30000,
          headers: {
            'Accept': 'text/turtle, application/rdf+xml, application/ld+json, application/n-triples, */*'
          }
        });
        content = response.data;
        
        if (typeof content !== 'string') {
          content = JSON.stringify(content);
        }
      } catch (fetchError) {
        return res.status(400).json({
          error: 'Failed to fetch content from URL',
          details: fetchError.message
        });
      }
    }
    
    const detectedFormat = format === 'auto' ? detectFormat(content) : format;
    
    // Run both validations in parallel
    console.log(`📊 Running combined validation for profile: ${profile}`);
    const [quality, shaclReport] = await Promise.all([
      calculateQuality(content, profile, detectedFormat, version),
      validateWithSHACL(content, profile, detectedFormat, version, language)
    ]);
    
    // Update compliance metric based on SHACL result
    const complianceMetric = quality.metrics.find(m => m.id.includes('compliance'));
    if (complianceMetric && !shaclReport.conforms) {
      complianceMetric.score = 0;
      complianceMetric.compliancePercentage = 0;
    }
    
    res.json({
      success: true,
      profile,
      version: quality.version,
      quality: {
        totalScore: quality.totalScore,
        maxScore: quality.maxScore,
        percentage: quality.percentage,
        byCategory: quality.byCategory
      },
      shacl: {
        conforms: shaclReport.conforms,
        totalViolations: shaclReport.totalViolations,
        violations: shaclReport.violations.length,
        warnings: shaclReport.warnings.length
      },
      metrics: quality.metrics,
      shaclViolations: shaclReport.violations,
      shaclWarnings: shaclReport.warnings,
      stats: quality.stats,
      timestamp: quality.timestamp
    });
    
  } catch (error) {
    console.error('Combined validation error:', error);
    res.status(500).json({
      error: 'Validation failed',
      details: error.message
    });
  }
});

/**
 * @route POST /api/v1/syntax
 * @description Validate RDF syntax only (quick check)
 */
router.post('/syntax', async (req, res) => {
  try {
    const { content, url, format = 'auto' } = req.body;
    
    if (!content && !url) {
      return res.status(400).json({
        error: 'Either content or url is required'
      });
    }
    
    let rdfContent = content;
    if (url) {
      try {
        const response = await axios.get(url, {
          timeout: 30000,
          headers: {
            'Accept': 'text/turtle, application/rdf+xml, application/ld+json, */*'
          }
        });
        rdfContent = response.data;
        if (typeof rdfContent !== 'string') {
          rdfContent = JSON.stringify(rdfContent);
        }
      } catch (fetchError) {
        return res.status(400).json({
          error: 'Failed to fetch content from URL',
          details: fetchError.message
        });
      }
    }
    
    const detectedFormat = format === 'auto' ? detectFormat(rdfContent) : format;
    const result = await validateRDFSyntax(rdfContent, detectedFormat);
    
    res.json({
      valid: result.valid,
      format: detectedFormat,
      tripleCount: result.tripleCount,
      error: result.error,
      lineNumber: result.lineNumber
    });
    
  } catch (error) {
    console.error('Syntax validation error:', error);
    res.status(500).json({
      error: 'Syntax validation failed',
      details: error.message
    });
  }
});

/**
 * @route DELETE /api/v1/cache
 * @description Clear SHACL shapes cache
 */
router.delete('/cache', (req, res) => {
  clearCache();
  res.json({ message: 'Cache cleared successfully' });
});

/**
 * @route GET /api/v1/info
 * @description Get API information
 */
router.get('/info', async (req, res) => {
  try {
    const config = await loadMQAConfig();
    const appInfo = config.app_info || {};
    
    res.json({
      name: 'MQA API - Metadata Quality Assessment',
      version: appInfo.version || '1.0.0',
      description: 'REST API for metadata quality assessment using FAIR+C methodology',
      documentation: '/api/v1/docs',
      endpoints: {
        profiles: 'GET /api/v1/profiles - List available validation profiles',
        quality: 'POST /api/v1/quality - Assess metadata quality',
        shacl: 'POST /api/v1/shacl - SHACL validation',
        validate: 'POST /api/v1/validate - Combined quality + SHACL validation',
        syntax: 'POST /api/v1/syntax - RDF syntax validation only'
      },
      supportedProfiles: Object.values(VALIDATION_PROFILES),
      supportedFormats: Object.values(RDF_FORMATS)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load API info' });
  }
});

module.exports = router;
