import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import FileUpload from './FileUpload';
import DimensionCharts from './DimensionCharts';
import SHACLResultsTable from './SHACLResultsTable';
import { DashboardData, DashboardMetricsData, DashboardSHACLData } from './DashboardTypes';
import { useAppState } from '../../contexts/AppStateContext';
import { getRatingFromScore } from '../../utils/ratingUtils';
import MQAService from '../../services/MQAService';

// Helper functions for profile data
const getProfileDisplayName = (profileId: string): string => {
  switch (profileId) {
    case 'dcat-ap':
    case 'DCAT-AP':
      return 'DCAT-AP';
    case 'dcat-ap-es':
    case 'DCAT-AP-ES':
      return 'DCAT-AP-ES';
    case 'nti-risp':
    case 'NTI-RISP':
      return 'NTI-RISP';
    default:
      return profileId.toUpperCase();
  }
};

const getProfileUrl = (profileId: string): string => {
  switch (profileId) {
    case 'dcat-ap':
    case 'DCAT-AP':
      return 'https://www.w3.org/ns/dcat';
    case 'dcat-ap-es':
    case 'DCAT-AP-ES':
      return 'https://datos.gob.es/es/documentacion/dcat-ap-es';
    case 'nti-risp':
    case 'NTI-RISP':
      return 'https://datos.gob.es/es/documentacion/nti-risp';
    default:
      return '';
  }
};

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { state, updateDashboardData } = useAppState();
  const { dashboardData, lastValidationResult } = state;
  const [error, setError] = useState<string | null>(null);
  
  // Calculate rating from score and profile
  const getRatingFromScoreAndProfile = (score: number, profile: string): string => {
    return getRatingFromScore(score, profile as any);
  };

  // Load data from last validation result if available
  useEffect(() => {
    if (lastValidationResult && !dashboardData.isMetricsLoaded) {
      // Convert validation result to dashboard format
      const rating = getRatingFromScoreAndProfile(lastValidationResult.quality.totalScore, lastValidationResult.profile);
      const metricsData: DashboardMetricsData = {
        source: lastValidationResult.timestamp,
        created: new Date().toISOString().split('T')[0],
        totalScore: lastValidationResult.quality.totalScore || 0,
        maxScore: lastValidationResult.quality.maxScore || 0,
        rating: rating,
        profile: {
          id: lastValidationResult.profile,
          name: getProfileDisplayName(lastValidationResult.profile),
          version: "1.0.0", // Could be enhanced to get actual version
          url: getProfileUrl(lastValidationResult.profile)
        },
        dimensions: {
          findability: lastValidationResult.quality.byCategory?.findability?.score || 0,
          accessibility: lastValidationResult.quality.byCategory?.accessibility?.score || 0,
          interoperability: lastValidationResult.quality.byCategory?.interoperability?.score || 0,
          reusability: lastValidationResult.quality.byCategory?.reusability?.score || 0,
          contextuality: lastValidationResult.quality.byCategory?.contextuality?.score || 0
        },
        metrics: lastValidationResult.quality.metrics.map(metric => ({
          id: metric.id,
          dimension: metric.category || 'unknown',
          score: metric.score,
          maxScore: metric.maxScore,
          percentage: metric.maxScore > 0 ? metric.score / metric.maxScore : 0,
          weight: metric.weight,
          found: metric.found || false,
          // Compliance information
          entityType: metric.entityType,
          totalEntities: metric.totalEntities,
          compliantEntities: metric.compliantEntities,
          compliancePercentage: metric.compliancePercentage,
          // Multi-entity specific fields
          datasetEntities: metric.datasetEntities,
          distributionEntities: metric.distributionEntities
        })) || []
      };
      
      let updateData: any = {
        metricsData,
        isMetricsLoaded: true
      };

      // Also load SHACL data if available
      if (lastValidationResult.shaclReport && !dashboardData.isShaclLoaded) {
        updateData.shaclData = {
          ttlContent: `# SHACL Report for ${lastValidationResult.profile}
# Generated: ${new Date().toISOString()}
# Profile: ${lastValidationResult.profile}
# Conforms: ${lastValidationResult.shaclReport.conforms}
# Total violations: ${lastValidationResult.shaclReport.totalViolations}

${lastValidationResult.content || '# No TTL content available'}`,
          fileName: `shacl-report-${lastValidationResult.profile}-${new Date().toISOString().split('T')[0]}.ttl`,
          profile: lastValidationResult.profile,
          profileVersion: 'latest'
        };
        updateData.isShaclLoaded = true;
      }

      updateDashboardData(updateData);
    }
  }, [lastValidationResult, dashboardData.isMetricsLoaded, dashboardData.isShaclLoaded, updateDashboardData]);

  const handleMetricsLoad = (data: DashboardMetricsData) => {
    updateDashboardData({
      metricsData: data,
      isMetricsLoaded: true
    });
    setError(null);
  };

  const handleShaclLoad = (data: DashboardSHACLData) => {
    updateDashboardData({
      shaclData: data,
      isShaclLoaded: true
    });
    setError(null);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleReset = () => {
    updateDashboardData({
      metricsData: null,
      shaclData: null,
      isMetricsLoaded: false,
      isShaclLoaded: false
    });
    setError(null);
  };

  const loadSampleData = () => {
    // Load the sample JSON data provided in the requirements
    const sampleMetrics: DashboardMetricsData = {
      "source": "validation-2025-09-08T19:48:28.262Z",
      "created": "2025-09-08",
      "totalScore": 205,
      "maxScore": 405,
      "rating": "Good",
      "profile": {
        "id": "dcat-ap-es",
        "name": "DCAT-AP-ES",
        "version": "1.0.0",
        "url": "https://datos.gob.es/es/documentacion/dcat-ap-es"
      },
      "dimensions": {
        "findability": 80,
        "accessibility": 50,
        "interoperability": 65,
        "reusability": 10,
        "contextuality": 0
      },
      "metrics": [
        {
          "id": "dcat_keyword",
          "dimension": "findability",
          "score": 30,
          "maxScore": 30,
          "percentage": 1,
          "weight": 30,
          "found": true
        },
        {
          "id": "dcat_theme",
          "dimension": "findability",
          "score": 30,
          "maxScore": 30,
          "percentage": 1,
          "weight": 30,
          "found": true
        },
        {
          "id": "dct_spatial",
          "dimension": "findability",
          "score": 20,
          "maxScore": 20,
          "percentage": 1,
          "weight": 20,
          "found": true
        },
        {
          "id": "dct_temporal",
          "dimension": "findability",
          "score": 0,
          "maxScore": 20,
          "percentage": 0,
          "weight": 20,
          "found": false
        },
        {
          "id": "dcat_access_url_status",
          "dimension": "accessibility",
          "score": 50,
          "maxScore": 50,
          "percentage": 1,
          "weight": 50,
          "found": true
        },
        {
          "id": "dct_format",
          "dimension": "interoperability",
          "score": 20,
          "maxScore": 20,
          "percentage": 1,
          "weight": 20,
          "found": true
        },
        {
          "id": "dct_format_vocabulary_nti_risp",
          "dimension": "interoperability",
          "score": 5,
          "maxScore": 5,
          "percentage": 1,
          "weight": 5,
          "found": true
        },
        {
          "id": "dcat_media_type_vocabulary_nti_risp",
          "dimension": "interoperability",
          "score": 0,
          "maxScore": 5,
          "percentage": 0,
          "weight": 5,
          "found": false
        },
        {
          "id": "dct_format_nonproprietary",
          "dimension": "interoperability",
          "score": 20,
          "maxScore": 20,
          "percentage": 1,
          "weight": 20,
          "found": true
        },
        {
          "id": "dct_format_machine_readable",
          "dimension": "interoperability",
          "score": 20,
          "maxScore": 20,
          "percentage": 1,
          "weight": 20,
          "found": true
        },
        {
          "id": "nti_risp_compliance",
          "dimension": "interoperability",
          "score": 0,
          "maxScore": 30,
          "percentage": 0,
          "weight": 30,
          "found": false
        },
        {
          "id": "dct_license",
          "dimension": "reusability",
          "score": 0,
          "maxScore": 20,
          "percentage": 0,
          "weight": 20,
          "found": false
        },
        {
          "id": "dct_license_vocabulary",
          "dimension": "reusability",
          "score": 0,
          "maxScore": 10,
          "percentage": 0,
          "weight": 10,
          "found": false
        },
        {
          "id": "dct_publisher",
          "dimension": "reusability",
          "score": 10,
          "maxScore": 10,
          "percentage": 1,
          "weight": 10,
          "found": true
        },
        {
          "id": "dcat_byte_size",
          "dimension": "contextuality",
          "score": 0,
          "maxScore": 5,
          "percentage": 0,
          "weight": 5,
          "found": false
        },
        {
          "id": "dct_issued",
          "dimension": "contextuality",
          "score": 0,
          "maxScore": 5,
          "percentage": 0,
          "weight": 5,
          "found": false
        },
        {
          "id": "dct_modified",
          "dimension": "contextuality",
          "score": 0,
          "maxScore": 5,
          "percentage": 0,
          "weight": 5,
          "found": false
        }
      ]
    };

    // Sample SHACL TTL content
    const sampleTTL = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .

[ a sh:ValidationReport ;
    sh:conforms false ;
    dct:created "2025-09-08T19:48:38.087Z"^^xsd:dateTime ;
    sh:result
        [ a sh:ValidationResult ;
            sh:resultSeverity sh:Violation ;
            sh:focusNode <http://dcat-ap-es.ejemplo.org/catalogo> ;
            sh:resultPath <http://purl.org/dc/terms/title> ;
            sh:value "Catálogo de Datos Abiertos" ;
            sh:resultMessage "Value does not have shape MultilingualText_Shape" 
        ] ,
        [ a sh:ValidationResult ;
            sh:resultSeverity sh:Warning ;
            sh:focusNode <http://dcat-ap-es.ejemplo.org/distribucion/dataset-ejemplo-1-CSV> ;
            sh:resultPath <http://purl.org/dc/terms/identifier> ;
            sh:resultMessage "Se recomienda incluir un identificador URI para la distribución"@es 
        ] ,
        [ a sh:ValidationResult ;
            sh:resultSeverity sh:Info ;
            sh:focusNode <http://dcat-ap-es.ejemplo.org/dataset/dataset-ejemplo-1> ;
            sh:resultPath <http://purl.org/dc/terms/issued> ;
            sh:resultMessage "Se recomienda incluir la fecha de creación del recurso con formato ISO-8601: YYYY-MM-DDThh:mm:ssTZD"@es 
        ]
] .`;

    handleMetricsLoad(sampleMetrics);
    handleShaclLoad({
      ttlContent: sampleTTL,
      fileName: 'sample-shacl-validation.ttl',
      profile: {
        id: "dcat-ap-es",
        name: "DCAT-AP-ES",
        version: "1.0.0",
        url: "https://datos.gob.es/es/documentacion/dcat-ap-es"
      }
    });
  };

  // Profile card component
  const ProfileCard: React.FC<{ profile?: string; profileVersion?: string }> = ({ profile, profileVersion }) => {
    if (!profile) return null;
    
    // Get profile info from MQAService
    const profileInfo = MQAService.getProfileInfo(profile as any);
    const defaultVersion = profileInfo?.defaultVersion;
    const versionInfo = defaultVersion && profileInfo?.versions?.[defaultVersion];
    const isValidVersionInfo = versionInfo && typeof versionInfo === 'object' && 'name' in versionInfo;
    
    return (
      <div className="col-md-6">
        <div className="card border-info h-100">
          <div className="card-body text-center d-flex flex-column justify-content-center">
            <div className="mb-2">
              <i className="bi bi-shield-check text-info" style={{ fontSize: '1.5rem' }}></i>
            </div>
            <h6 className="card-title mb-2 text-info">
              {t('dashboard.files.validation_profile')}
            </h6>
            <span className="badge bg-info mb-2">
              {isValidVersionInfo ? (versionInfo as any).name : (t(`validation.profiles.${profile}`) || profile.toUpperCase())}
            </span>
            {defaultVersion && (
              <small className="text-muted d-block">
                {t('dashboard.files.version')}: {defaultVersion}
              </small>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container-fluid p-4">
      <div className="dashboard-container">
        {/* Header */}
        <div className="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h2 className="h3 mb-1">
              <i className="bi bi-speedometer2 me-2 text-primary"></i>
              {t('dashboard.title')}
            </h2>
            <p className="text-muted mb-0">
              {t('dashboard.subtitle')}
            </p>
          </div>
          <div className="d-flex gap-2">
            <button
              className="btn btn-outline-primary"
              onClick={loadSampleData}
              title={t('dashboard.uploads.load_sample_description')}
            >
              <i className="bi bi-lightning-charge me-1"></i>
              {t('dashboard.uploads.load_sample')}
            </button>
            {(dashboardData.metricsData || dashboardData.shaclData) && (
              <button
                className="btn btn-outline-secondary"
                onClick={handleReset}
                title="Clear all loaded data"
              >
                <i className="bi bi-arrow-clockwise me-1"></i>
                {t('common.actions.reset')}
              </button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="alert alert-danger alert-dismissible fade show" role="alert">
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            <strong>{t('common.states.error')}:</strong> {error}
            <button
              type="button"
              className="btn-close"
              onClick={() => setError(null)}
              aria-label="Close"
            ></button>
          </div>
        )}

        {/* File Upload Section */}
        {!dashboardData.metricsData && !dashboardData.shaclData && (
          <FileUpload
            onMetricsLoad={handleMetricsLoad}
            onShaclLoad={handleShaclLoad}
            onError={handleError}
          />
        )}

        {/* Dashboard Content */}
        {(dashboardData.metricsData || dashboardData.shaclData) && (
          <div className="dashboard-content">
            {/* Navigation Tabs */}
            <ul className="nav nav-tabs mb-4" id="dashboardTabs" role="tablist">
              {dashboardData.metricsData && (
                <li className="nav-item" role="presentation">
                  <button
                    className="nav-link active"
                    id="metrics-tab"
                    data-bs-toggle="tab"
                    data-bs-target="#metrics-pane"
                    type="button"
                    role="tab"
                    aria-controls="metrics-pane"
                    aria-selected="true"
                  >
                    <i className="bi bi-graph-up me-2"></i>
                    {t('dashboard.tabs.metrics')}
                    <span className="badge bg-primary ms-2">
                      {dashboardData.metricsData.totalScore.toFixed(1)}
                    </span>
                  </button>
                </li>
              )}
              {dashboardData.shaclData && (
                <li className="nav-item" role="presentation">
                  <button
                    className={`nav-link ${!dashboardData.metricsData ? 'active' : ''}`}
                    id="shacl-tab"
                    data-bs-toggle="tab"
                    data-bs-target="#shacl-pane"
                    type="button"
                    role="tab"
                    aria-controls="shacl-pane"
                    aria-selected={!dashboardData.metricsData}
                  >
                    <i className="bi bi-shield-check me-2"></i>
                    {t('dashboard.tabs.shacl')}
                  </button>
                </li>
              )}
              <li className="nav-item" role="presentation">
                <button
                  className="nav-link"
                  id="upload-tab"
                  data-bs-toggle="tab"
                  data-bs-target="#upload-pane"
                  type="button"
                  role="tab"
                  aria-controls="upload-pane"
                  aria-selected="false"
                >
                  <i className="bi bi-cloud-upload me-2"></i>
                  {t('dashboard.tabs.upload')}
                </button>
              </li>
            </ul>

            {/* Tab Content */}
            <div className="tab-content" id="dashboardTabContent">
              {/* Metrics Tab */}
              {dashboardData.metricsData && (
                <div
                  className="tab-pane fade show active"
                  id="metrics-pane"
                  role="tabpanel"
                  aria-labelledby="metrics-tab"
                >
                  <DimensionCharts 
                    metricsData={dashboardData.metricsData}
                    showProfileCard={true}
                  />
                </div>
              )}

              {/* SHACL Tab */}
              {dashboardData.shaclData && (
                <div
                  className={`tab-pane fade ${!dashboardData.metricsData ? 'show active' : ''}`}
                  id="shacl-pane"
                  role="tabpanel"
                  aria-labelledby="shacl-tab"
                >
                  <SHACLResultsTable 
                    shaclData={dashboardData.shaclData}
                    showProfileCard={true}
                  />
                </div>
              )}

              {/* Upload Tab */}
              <div
                className="tab-pane fade"
                id="upload-pane"
                role="tabpanel"
                aria-labelledby="upload-tab"
              >
                <FileUpload
                  onMetricsLoad={handleMetricsLoad}
                  onShaclLoad={handleShaclLoad}
                  onError={handleError}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;