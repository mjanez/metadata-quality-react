import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogDistribution, DataQualityInput, QualityAnalysisResult, DataQualityAnalysisProgress } from '../../types/dataQuality';
import DataDiscoveryService from '../../services/DataDiscoveryService';
import DataQualityService from '../../services/DataQualityService';
import DatasetSelector from './DatasetSelector';
import DataQualityReportViewer from './DataQualityReportViewer';
import LoadingSpinner from '../LoadingSpinner';
import { useAppState } from '../../contexts/AppStateContext';
import { backendService } from '../../services/BackendService';

const DataQualityAnalysis: React.FC = () => {
  const { t } = useTranslation();
  const { state } = useAppState();
  const [selectedDistribution, setSelectedDistribution] = useState<CatalogDistribution | null>(null);
  const [analysisResult, setAnalysisResult] = useState<QualityAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<DataQualityAnalysisProgress | null>(null);
  const [currentStep, setCurrentStep] = useState<'selection' | 'analysis' | 'results'>('selection');
  const [hasValidationData, setHasValidationData] = useState(false);
  const [dataQualityEnabled, setDataQualityEnabled] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [isCheckingBackend, setIsCheckingBackend] = useState(true);
  
  const dataQualityService = DataQualityService.getInstance();
  const discoveryService = DataDiscoveryService.getInstance();

  // Check backend availability and data quality configuration
  useEffect(() => {
    const checkDataQualityAvailability = async () => {
      setIsCheckingBackend(true);
      try {
        const isEnabled = await backendService.shouldEnableDataQuality();
        const isBackendAvailable = await backendService.isBackendAvailable();
        
        setDataQualityEnabled(isEnabled);
        setBackendAvailable(isBackendAvailable);
      } catch (error) {
        console.error('Failed to check backend availability:', error);
        setDataQualityEnabled(false);
        setBackendAvailable(false);
      } finally {
        setIsCheckingBackend(false);
      }
    };
    
    checkDataQualityAvailability();
  }, []);

  // Initialize discovery service with validation results
  useEffect(() => {
    const validationResults = state.tabState.tabs
      .filter(tab => tab.result && tab.result.content)
      .map(tab => tab.result!);
    
    if (validationResults.length > 0) {
      discoveryService.setValidationResults(validationResults);
      setHasValidationData(true);
    } else {
      setHasValidationData(false);
    }
  }, [state.tabState.tabs, discoveryService]);

  const handleDistributionSelect = (distribution: CatalogDistribution) => {
    setSelectedDistribution(distribution);
    // Reset analysis results when a new distribution is selected
    if (analysisResult) {
      setAnalysisResult(null);
      setCurrentStep('selection');
    }
  };

  const handleAnalyzeQuality = async () => {
    if (!selectedDistribution) return;

    setIsAnalyzing(true);
    setProgress(null);
    setCurrentStep('analysis');

    try {
      // Determine format from distribution
      const format = determineFormat(selectedDistribution);
      
      const input: DataQualityInput = {
        url: selectedDistribution.accessURL,
        downloadURL: selectedDistribution.downloadURL,
        format,
        title: selectedDistribution.title,
        description: selectedDistribution.description
      };

      const result = await dataQualityService.analyzeDataQuality(
        input,
        (progressInfo: DataQualityAnalysisProgress) => {
          setProgress(progressInfo);
        }
      );

      setAnalysisResult(result);
      setCurrentStep('results');
      
      // Scroll to results section
      setTimeout(() => {
        const resultsElement = document.getElementById('quality-results');
        if (resultsElement) {
          resultsElement.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);

    } catch (error) {
      console.error('Analysis error:', error);
      setAnalysisResult({
        report: {} as any,
        observations: [],
        score: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Error desconocido durante el análisis'
      });
      setCurrentStep('results');
    } finally {
      setIsAnalyzing(false);
      setProgress(null);
    }
  };

  const handleNewAnalysis = () => {
    setSelectedDistribution(null);
    setAnalysisResult(null);
    setCurrentStep('selection');
    setProgress(null);
  };

  const determineFormat = (distribution: CatalogDistribution): 'csv' | 'json' => {
    const format = distribution.format?.toLowerCase() || '';
    const mediaType = distribution.mediaType?.toLowerCase() || '';
    const url = distribution.accessURL.toLowerCase();

    if (format.includes('json') || mediaType.includes('json') || url.includes('.json')) {
      return 'json';
    }
    
    // Default to CSV as it's more common
    return 'csv';
  };

  return (
    <div className="data-quality-analysis">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="h3 mb-1">
            <i className="bi bi-graph-up me-2"></i>
            {t('data_quality.title')}
          </h1>
          <p className="text-muted mb-0">
            {t('data_quality.subtitle')}
          </p>
        </div>
        {(currentStep === 'analysis' || currentStep === 'results') && (
          <button 
            className="btn btn-outline-primary"
            onClick={handleNewAnalysis}
            disabled={isAnalyzing}
          >
            <i className="bi bi-arrow-left me-2"></i>
            {t('data_quality.newAnalysis')}
          </button>
        )}
      </div>

      {/* Step Indicator */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="d-flex justify-content-center">
            <div className="d-flex align-items-center">
              {/* Step 1: Selection */}
              <div className={`d-flex align-items-center ${currentStep === 'selection' ? 'text-primary' : currentStep === 'analysis' || currentStep === 'results' ? 'text-success' : 'text-muted'}`}>
                <div className={`rounded-circle d-flex align-items-center justify-content-center me-2 ${currentStep === 'selection' ? 'bg-primary text-white' : currentStep === 'analysis' || currentStep === 'results' ? 'bg-success text-white' : 'bg-light text-muted'}`} style={{ width: '32px', height: '32px', fontSize: '14px' }}>
                  {currentStep === 'analysis' || currentStep === 'results' ? (
                    <i className="bi bi-check"></i>
                  ) : (
                    '1'
                  )}
                </div>
                <span className="small">{t('data_quality.steps.selection')}</span>
              </div>
              
              <div className={`mx-3 ${currentStep === 'analysis' || currentStep === 'results' ? 'text-success' : 'text-muted'}`}>
                <i className="bi bi-arrow-right"></i>
              </div>
              
              {/* Step 2: Analysis */}
              <div className={`d-flex align-items-center ${currentStep === 'analysis' ? 'text-primary' : currentStep === 'results' ? 'text-success' : 'text-muted'}`}>
                <div className={`rounded-circle d-flex align-items-center justify-content-center me-2 ${currentStep === 'analysis' ? 'bg-primary text-white' : currentStep === 'results' ? 'bg-success text-white' : 'bg-light text-muted'}`} style={{ width: '32px', height: '32px', fontSize: '14px' }}>
                  {currentStep === 'results' ? (
                    <i className="bi bi-check"></i>
                  ) : currentStep === 'analysis' ? (
                    <div className="spinner-border spinner-border-sm" role="status"></div>
                  ) : (
                    '2'
                  )}
                </div>
                <span className="small">{t('data_quality.steps.analysis')}</span>
              </div>
              
              <div className={`mx-3 ${currentStep === 'results' ? 'text-success' : 'text-muted'}`}>
                <i className="bi bi-arrow-right"></i>
              </div>
              
              {/* Step 3: Results */}
              <div className={`d-flex align-items-center ${currentStep === 'results' ? 'text-primary' : 'text-muted'}`}>
                <div className={`rounded-circle d-flex align-items-center justify-content-center me-2 ${currentStep === 'results' ? 'bg-primary text-white' : 'bg-light text-muted'}`} style={{ width: '32px', height: '32px', fontSize: '14px' }}>
                  3
                </div>
                <span className="small">{t('data_quality.steps.results')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Backend Availability Check */}
      {isCheckingBackend && (
        <div className="row justify-content-center">
          <div className="col-md-6">
            <div className="text-center">
              <LoadingSpinner />
              <p className="mt-2">{t('data_quality.checkingBackend')}</p>
            </div>
          </div>
        </div>
      )}

      {!isCheckingBackend && !dataQualityEnabled && (
        <div className="row justify-content-center">
          <div className="col-md-8">
            <div className="alert alert-warning">
              <h5>
                <i className="bi bi-exclamation-triangle me-2"></i>
                {t('data_quality.notAvailable.title')}
              </h5>
              <p className="mb-2">
                {backendService.isGitHubPages() ? 
                  t('data_quality.notAvailable.githubPages') :
                  t('data_quality.notAvailable.backend')
                }
              </p>
              {backendService.isDevelopmentMode() && !backendAvailable && (
                <div className="mt-3">
                  <h6>{t('data_quality.setup.title')}</h6>
                  <ol className="small mb-2">
                    <li>{t('data_quality.setup.step1')}</li>
                    <li>{t('data_quality.setup.step2')}</li>
                    <li>{t('data_quality.setup.step3')}</li>
                    <li>{t('data_quality.setup.step4')}</li>
                  </ol>
                  <p className="small text-muted">
                    {t('data_quality.setup.note')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content based on current step */}
      {!isCheckingBackend && dataQualityEnabled && currentStep === 'selection' && (
        <div>
          {!hasValidationData ? (
            <div className="alert alert-info" role="alert">
              <h4 className="alert-heading">
                <i className="bi bi-info-circle me-2"></i>
                {t('data_quality.noValidationData.title')}
              </h4>
              <p className="mb-3">
                {t('data_quality.noValidationData.description')}
              </p>
              <ol className="mb-3">
                <li>{t('data_quality.noValidationData.step1')}</li>
                <li>{t('data_quality.noValidationData.step2')}</li>
                <li>{t('data_quality.noValidationData.step3')}</li>
                <li>{t('data_quality.noValidationData.step4')}</li>
              </ol>
              <a href="/" className="btn btn-primary">
                <i className="bi bi-clipboard-check me-2"></i>
                {t('data_quality.noValidationData.goToValidation')}
              </a>
            </div>
          ) : (
            <>
          {/* Analyze Button */}
          {selectedDistribution && (
            <div className="text-center mt-4">
              <button 
                className="btn btn-primary btn-lg"
                onClick={handleAnalyzeQuality}
                disabled={isAnalyzing}
              >
                <i className="bi bi-play-circle me-2"></i>
                {t('data_quality.analyzeButton')}
              </button>
              <div className="mt-2">
                <small className="text-muted">
                  {t('data_quality.analyzeHelp')}
                </small>
              </div>
            </div>
          )}
              {/* Dataset Selector */}
              <DatasetSelector 
                onDistributionSelect={handleDistributionSelect}
                selectedDistribution={selectedDistribution}
              />
            </>
          )}
        </div>
      )}

      {!isCheckingBackend && dataQualityEnabled && currentStep === 'analysis' && (
        <div className="text-center py-5">
          <LoadingSpinner />
          <h4 className="mt-4 mb-3">
            {t('data_quality.analyzing')}
          </h4>
          
          {selectedDistribution && (
            <div className="mb-4">
              <p className="text-muted">
                <strong>{t('data_quality.analysisInfo.dataset')}:</strong> {selectedDistribution.dataset.title}
              </p>
              <p className="text-muted">
                <strong>{t('data_quality.analysisInfo.distribution')}:</strong> {selectedDistribution.title}
              </p>
              <p className="text-muted">
                <strong>{t('data_quality.analysisInfo.format')}:</strong> {determineFormat(selectedDistribution).toUpperCase()}
              </p>
            </div>
          )}

          {progress && (
            <div className="card mx-auto" style={{ maxWidth: '500px' }}>
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="small">{progress.message}</span>
                  <span className="small fw-bold">{progress.progress}%</span>
                </div>
                <div className="progress">
                  <div 
                    className="progress-bar progress-bar-striped progress-bar-animated"
                    style={{ width: `${progress.progress}%` }}
                  ></div>
                </div>
                <div className="mt-2">
                  <small className="text-muted">
                    {t(`dataQuality.progress.${progress.step}`, progress.step)}
                  </small>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!isCheckingBackend && dataQualityEnabled && currentStep === 'results' && analysisResult && (
        <div id="quality-results">
          <DataQualityReportViewer result={analysisResult} />
        </div>
      )}

      {/* Information Panel */}
      <div className="card mt-5 border-info">
        <div className="card-header bg-info text-white">
          <h5 className="mb-0">
            <i className="bi bi-info-circle me-2"></i>
            {t('data_quality.about.title')}
          </h5>
        </div>
        <div className="card-body">
          <p className="mb-3">
            {t('data_quality.about.description')}
          </p>
          
          <div className="row">
            <div className="col-md-6">
              <h6 className="text-primary">
                {t('data_quality.about.inherent')}
              </h6>
              <ul className="small">
                <li>{t('data_quality.characteristics.accuracy')}</li>
                <li>{t('data_quality.characteristics.completeness')}</li>
                <li>{t('data_quality.characteristics.consistency')}</li>
                <li>{t('data_quality.characteristics.credibility')}</li>
                <li>{t('data_quality.characteristics.currentness')}</li>
                <li>{t('data_quality.characteristics.precision')}</li>
                <li>{t('data_quality.characteristics.relevance')}</li>
              </ul>
            </div>
            <div className="col-md-6">
              <h6 className="text-success">
                {t('data_quality.about.systemDependent')}
              </h6>
              <ul className="small">
                <li>{t('data_quality.characteristics.accessibility')}</li>
                <li>{t('data_quality.characteristics.portability')}</li>
                <li>{t('data_quality.characteristics.recoverability')}</li>
                <li>{t('data_quality.characteristics.security')}</li>
                <li>{t('data_quality.characteristics.traceability')}</li>
                <li>{t('data_quality.characteristics.understandability')}</li>
                <li>{t('data_quality.characteristics.compliance')}</li>
                <li>{t('data_quality.characteristics.availability')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataQualityAnalysis;