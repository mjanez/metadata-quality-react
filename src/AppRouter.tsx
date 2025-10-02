import React, { useState, useCallback, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppStateProvider, useAppState } from './contexts/AppStateContext';
import { backendService } from './services/BackendService';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './App.css';
import ValidationForm from './components/ValidationForm';
import ValidationResults from './components/ValidationResults';
import ValidationTabs from './components/ValidationTabs';
import LoadingSpinner from './components/LoadingSpinner';
import LanguageSelector from './components/LanguageSelector';
import ThemeToggle from './components/ThemeToggle';
import ResponsiveSidebar from './components/ResponsiveSidebar';
import { Dashboard } from './components/Dashboard';
import { DataQualityAnalysis } from './components/DataQuality';
import RDFService from './services/RDFService';
import { MQAService } from './services/MQAService';
import { SHACLValidationService } from './services/SHACLValidationService';
import { SPARQLService } from './services/SPARQLService';
import { ValidationResult, ExtendedValidationResult, ValidationProfile, ValidationInput, ProfileSelection, ValidationTab, TabState } from './types';

// Main validation app component (existing functionality)
function ValidationApp() {
  const { t } = useTranslation();
  const { state, updateTabState, setSidebarVisible, setLastValidationResult } = useAppState();
  const { tabState, sidebarVisible } = state;
  const maxTabs = 5;

  // Debug: Log sidebar state changes
  React.useEffect(() => {
    console.debug('Sidebar state changed:', { 
      sidebarVisible, 
      timestamp: new Date().toLocaleTimeString(),
      classes: sidebarVisible ? 'sidebar-open' : 'sidebar-collapsed'
    });
  }, [sidebarVisible]);

  // Validation progress state
  const [validationProgress, setValidationProgress] = useState({
    isValidating: false,
    currentStep: '',
    estimatedTime: 0,
    startTime: 0,
    datasetsCount: 0,
    distributionsCount: 0
  }); 

  // Get active tab
  const activeTab = tabState.tabs.find(tab => tab.id === tabState.activeTabId);
  const selectedProfile = activeTab?.result?.profile || 'dcat_ap_es';

  // Tab management functions
  const createNewTab = useCallback((): string => {
    const newTabId = `tab-${tabState.nextTabId}`;
    const newTab: ValidationTab = {
      id: newTabId,
      name: `#${tabState.nextTabId}`,
      createdAt: new Date(),
      isValidating: false,
      result: null,
      error: null
    };
    
    updateTabState({
      tabs: [...tabState.tabs, newTab],
      activeTabId: newTabId,
      nextTabId: tabState.nextTabId + 1
    });
    
    return newTabId;
  }, [tabState.nextTabId, tabState.tabs, t, updateTabState]);

  const selectTab = useCallback((tabId: string) => {
    updateTabState({
      ...tabState,
      activeTabId: tabId
    });
  }, [tabState, updateTabState]);

  const closeTab = useCallback((tabId: string) => {
    const remainingTabs = tabState.tabs.filter(tab => tab.id !== tabId);
    
    // If there are no tabs left, create a new one
    if (remainingTabs.length === 0) {
      const newTabId = `tab-${tabState.nextTabId}`;
      const newTab: ValidationTab = {
        id: newTabId,
        name: `#${tabState.nextTabId}`,
        createdAt: new Date(),
        isValidating: false,
        result: null,
        error: null
      };
      updateTabState({
        tabs: [newTab],
        activeTabId: newTabId,
        nextTabId: tabState.nextTabId + 1
      });
      return;
    }
    
    // If we're closing the active tab, select another one
    let newActiveTabId = tabState.activeTabId;
    if (tabState.activeTabId === tabId) {
      newActiveTabId = remainingTabs[remainingTabs.length - 1].id;
    }
    
    updateTabState({
      ...tabState,
      tabs: remainingTabs,
      activeTabId: newActiveTabId
    });
  }, [t, tabState, updateTabState]);

  const updateSingleTabState = useCallback((tabId: string, updates: Partial<ValidationTab>) => {
    updateTabState({
      ...tabState,
      tabs: tabState.tabs.map(tab => 
        tab.id === tabId ? { ...tab, ...updates } : tab
      )
    });
  }, [tabState, updateTabState]);

  const handleValidation = async (input: ValidationInput, profileSelection: ProfileSelection) => {
    if (!activeTab) return;
    
    // Initialize validation progress
    const startTime = Date.now();
    setValidationProgress({
      isValidating: true,
      currentStep: t('common.states.validating_detailed', 'Iniciando validación...'),
      estimatedTime: 5, // Default estimate
      startTime,
      datasetsCount: 0,
      distributionsCount: 0
    });
    
    // Update tab to validating state
    updateSingleTabState(activeTab.id, {
      isValidating: true,
      error: null,
      result: null,
      name: input.source === 'url' && input.url ? 
        new URL(input.url).hostname : 
        input.source === 'sparql' && input.sparqlEndpoint ?
        new URL(input.sparqlEndpoint).hostname :
        `${t('validation.profiles.' + profileSelection.profile)} - ${new Date().toLocaleTimeString()}`
    });

    // Create placeholder result for immediate tab switching
    const placeholderResult: ExtendedValidationResult = {
      quality: {
        totalScore: 0,
        maxScore: 0,
        percentage: 0,
        metrics: [],
        byCategory: {}
      },
      profile: profileSelection.profile,
      stats: { 
        triples: 0, 
        subjects: 0, 
        predicates: 0, 
        objects: 0, 
        datasets: 0, 
        dataServices: 0, 
        distributions: 0 
      },
      content: '',
      timestamp: new Date().toISOString(),
      shaclReport: undefined,
      warnings: [],
      preprocessingApplied: false,
      validationDuration: 0
    };

    // Set placeholder result and immediately switch to results tab
    updateSingleTabState(activeTab.id, {
      result: placeholderResult
    });

    // Force immediate tab switch to results
    console.debug('Switching to results tab immediately');
    setTimeout(() => {
      const resultsTab = document.getElementById('results-tab');
      const formTab = document.getElementById('form-tab');
      const resultsPane = document.getElementById('results-pane');
      const formPane = document.getElementById('form-pane');
      
      if (resultsTab && formTab && resultsPane && formPane) {
        // Remove active class from form tab and pane
        formTab.classList.remove('active');
        formTab.setAttribute('aria-selected', 'false');
        formPane.classList.remove('show', 'active');
        
        // Add active class to results tab and pane
        resultsTab.classList.add('active');
        resultsTab.setAttribute('aria-selected', 'true');
        resultsPane.classList.add('show', 'active');
        
        console.debug('Switched to results tab immediately');
      } else {
        console.warn('⚠️ Could not find tab elements for immediate switch');
      }
    }, 50);

    // Start background validation process
    (async () => {
      try {
        // Clear SHACL cache to ensure fresh loading of local files
        console.log('Clearing SHACL cache for fresh validation');
        SHACLValidationService.clearCache();
        
        // Get content based on input source
        let content: string;
        let originalFormat = 'auto';
        
        if (input.source === 'url' && input.url) {
          console.log('Fetching content from URL:', input.url);
          setValidationProgress(prev => ({
            ...prev,
            currentStep: t('common.states.loading', 'Obteniendo datos de URL...')
          }));
          
          try {
            content = await RDFService.fetchFromUrl(input.url);
            // Auto-detect format from fetched content
            originalFormat = await import('./utils/formatDetection').then(module => module.detectRDFFormat(content));
            console.log(`Auto-detected format from URL content: ${originalFormat}`);
          } catch (fetchError) {
            // Handle URL fetch errors with user-friendly message
            console.error('❌ URL fetch failed:', fetchError);
            
            let userFriendlyMessage = '';
            
            if (fetchError instanceof Error) {
              if (fetchError.message.startsWith('CORS_ERROR:')) {
                userFriendlyMessage = `🚫 ${t('errors.cors_error')}\n\n${t('errors.cors_solution')}`;
                userFriendlyMessage += `\n${t('errors.manual_download_step1', { url: input.url })}`;
                userFriendlyMessage += `\n${t('errors.manual_download_step2')}`;
                userFriendlyMessage += `\n${t('errors.manual_download_step3')}`;
                userFriendlyMessage += `\n${t('errors.manual_download_step4')}`;
              } else if (fetchError.message.startsWith('TIMEOUT:')) {
                userFriendlyMessage = `⏱️ ${t('errors.timeout_error')}\n\n${t('errors.timeout_retry')}`;
              } else if (fetchError.message.startsWith('NETWORK_ERROR:')) {
                const actualError = fetchError.message.replace('NETWORK_ERROR: ', '');
                userFriendlyMessage = `${t('errors.network_error')}: ${actualError}`;
              } else {
                userFriendlyMessage = `❌ ${t('errors.fetch_failed')}: ${fetchError.message}`;
              }
            } else {
              userFriendlyMessage = `❌ ${t('errors.unknown_error')}`;
            }
            
            throw new Error(userFriendlyMessage);
          }
        } else if (input.source === 'sparql' && input.sparqlEndpoint && input.sparqlQuery) {
          console.log('Executing SPARQL query on endpoint:', input.sparqlEndpoint);
          setValidationProgress(prev => ({
            ...prev,
            currentStep: t('common.states.processing', 'Ejecutando consulta SPARQL...')
          }));
          
          const sparqlService = SPARQLService.getInstance();
          const sparqlResult = await sparqlService.executeSPARQLQuery(input.sparqlEndpoint, input.sparqlQuery);
          
          if (!sparqlResult.success || !sparqlResult.data) {
            throw new Error(`SPARQL query failed: ${sparqlResult.error || 'No data returned'}`);
          }
          
          content = sparqlResult.data;
          // SPARQL results are typically in Turtle format
          originalFormat = 'turtle';
          console.log(`✅ SPARQL query executed successfully, got ${content.length} characters`);
        } else {
          console.log('Using direct text content');
          setValidationProgress(prev => ({
            ...prev,
            currentStep: t('common.states.processing', 'Procesando contenido...')
          }));
          
          content = input.content;
          originalFormat = input.format || 'auto';
          // Resolve 'auto' format if needed
          if (originalFormat === 'auto') {
            originalFormat = await import('./utils/formatDetection').then(module => module.detectRDFFormat(content));
            console.log(`Auto-detected format from text content: ${originalFormat}`);
          }
        }
        
        // Validate syntax of original content first
        console.log('Validating original content syntax');
        const mqaService = MQAService.getInstance();
        const syntaxValidation = await mqaService.validateRDF(content, originalFormat);
        
        if (!syntaxValidation.valid) {
          throw new Error(`RDF Syntax Error${syntaxValidation.lineNumber ? ` at line ${syntaxValidation.lineNumber}` : ''}: ${syntaxValidation.error}`);
        }
        
        // Check if this is JSON-LD and provide helpful message
        if (originalFormat === 'jsonld') {
          throw new Error(
            'JSON-LD format is detected but not fully supported for quality analysis yet. ' +
            'Please convert your N-Triples to Turtle or RDF/XML format and then paste the converted content. Using tools like:' +
            'https://www.easyrdf.org/converter' +
            'https://json-ld.org/playground/'
          );
        }
        
        // Normalize content to Turtle format for quality analysis
        console.log('Normalizing content to Turtle format');
        const normalizedContent = await RDFService.normalizeToTurtle(content, false, originalFormat);
        
        // Calculate quality with MQA + SHACL (using normalized content, skip syntax validation since we already did it)
        console.log('Calculating quality metrics with SHACL validation');
        setValidationProgress(prev => ({
          ...prev,
          currentStep: t('common.states.processing', 'Analizando métricas de calidad...')
        }));
        
        // Get stats first to estimate complexity
        console.log('Parsing RDF statistics');
        const stats = await RDFService.parseAndCount(normalizedContent);
        
        // Update progress with complexity data and time estimation
        const datasetsCount = stats.datasets || 0;
        const distributionsCount = stats.distributions || 0;
        let estimatedTime = 5; // Base time
        
        if (datasetsCount > 10 || distributionsCount > 50) {
          estimatedTime = Math.min(60, 5 + (datasetsCount * 0.5) + (distributionsCount * 0.2));
        }
        
        setValidationProgress(prev => ({
          ...prev,
          datasetsCount,
          distributionsCount,
          estimatedTime,
          currentStep: t('common.states.processing', 'Ejecutando análisis MQA...')
        }));
        
        const { quality: qualityResult, shaclReport } = await mqaService.calculateQualityWithSHACL(normalizedContent, profileSelection, 'turtle', true);
        
        // Calculate validation duration
        const validationDuration = Date.now() - startTime;
        
        const validationResult: ExtendedValidationResult = {
          quality: qualityResult,
          profile: profileSelection.profile,
          stats,
          content: normalizedContent,
          timestamp: new Date().toISOString(),
          shaclReport,
          warnings: syntaxValidation.warnings,
          preprocessingApplied: syntaxValidation.preprocessingApplied,
          validationDuration
        };
        
        console.log('✅ Validation completed successfully');
        
        // Finalize progress
        setValidationProgress(prev => ({
          ...prev,
          currentStep: t('common.states.complete', 'Validación completada')
        }));
        
        // Update tab with final results and global state
        updateSingleTabState(activeTab.id, {
          isValidating: false,
          result: validationResult,
          error: null
        });
        
        // Update global state with latest validation result
        setLastValidationResult(validationResult);
        
        // Reset progress state after a short delay
        setTimeout(() => {
          setValidationProgress({
            isValidating: false,
            currentStep: '',
            estimatedTime: 0,
            startTime: 0,
            datasetsCount: 0,
            distributionsCount: 0
          });
        }, 2000);
        
      } catch (err) {
        console.error('❌ Validation error:', err);
        
        // Provide more helpful error messages for RDF syntax errors
        let errorMessage = 'Validation failed';
        if (err instanceof Error) {
          if (err.message.includes('RDF Syntax Error')) {
            // RDF syntax error - show user-friendly message
            errorMessage = `${err.message}\n\nPlease check your RDF/Turtle syntax and ensure all triples are properly formatted.`;
          } else if (err.message.includes('Expected entity but got literal')) {
            // Common N3 parsing error
            errorMessage = `RDF Syntax Error: ${err.message}\n\nThis usually means there's a missing '<' or '>' around a URI, or a literal is used where a resource is expected.`;
          } else {
            errorMessage = err.message;
          }
        }
        
        // Update tab with error
        updateSingleTabState(activeTab.id, {
          isValidating: false,
          error: errorMessage
        });
        
        // Reset progress state
        setValidationProgress({
          isValidating: false,
          currentStep: '',
          estimatedTime: 0,
          startTime: 0,
          datasetsCount: 0,
          distributionsCount: 0
        });
      }
    })();
  };

  const handleReset = () => {
    if (!activeTab) return;
    updateSingleTabState(activeTab.id, {
      result: null,
      error: null
      // Keep the existing name - don't change it on reset
    });
    
    // Reset validation progress
    setValidationProgress({
      isValidating: false,
      currentStep: '',
      estimatedTime: 0,
      startTime: 0,
      datasetsCount: 0,
      distributionsCount: 0
    });
  };

  const toggleSidebar = () => {
    console.log('Toggling sidebar:', { 
      current: sidebarVisible, 
      willBe: !sidebarVisible,
      timestamp: new Date().toLocaleTimeString()
    });
    setSidebarVisible(!sidebarVisible);
  };

  return (
    <>
      {/* Responsive Sidebar */}
      <ResponsiveSidebar
        selectedProfile={selectedProfile}
        validationResult={activeTab?.result || null}
        isVisible={sidebarVisible}
        onToggle={toggleSidebar}
      />
      
      {/* Mobile Sidebar Toggle Button - Only show on mobile when sidebar is collapsed */}
      {!sidebarVisible && (
        <button
          className="btn btn-primary position-fixed d-lg-none"
          onClick={toggleSidebar}
          style={{
            top: '85px', // Below navbar (76px) + some margin
            left: '15px',
            zIndex: 1040,
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            padding: '0',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title={t('sidebar.expand')}
          aria-label={t('sidebar.expand')}
        >
          <i className="bi bi-list fs-4 text-white"></i>
        </button>
      )}
      
      {/* Main Content */}
      <div 
        className={`main-content ${sidebarVisible ? 'sidebar-open' : 'sidebar-collapsed'}`}
      >
        <div 
          className="container-fluid p-4"
        >
          {/* Validation Tabs */}
          <ValidationTabs
            tabs={tabState.tabs}
            activeTabId={tabState.activeTabId}
            onTabSelect={selectTab}
            onTabClose={closeTab}
            onNewTab={createNewTab}
            maxTabs={maxTabs}
          />

          {/* Active Tab Error Display */}
          {activeTab?.error && (
            <div className="alert alert-danger alert-dismissible fade show" role="alert">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>
              <strong>{t('common.states.error')}:</strong>
              <div className="mt-2">
                {activeTab.error.split('\n').map((part: string, index: number) => {
                  if (part.trim() === '') return <br key={index} />;
                  if (part.match(/^https?:\/\/[^\s]+/)) {
                    return (
                      <div key={index} className="mb-1">
                        <a 
                          href={part.trim()} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-decoration-none"
                        >
                          <i className="bi bi-link-45deg me-1"></i>
                          {part.trim()}
                        </a>
                      </div>
                    );
                  }
                  return <div key={index} className="mb-1">{part}</div>;
                })}
              </div>
              <button 
                type="button" 
                className="btn-close" 
                onClick={() => activeTab && updateSingleTabState(activeTab.id, { error: null })}
                aria-label="Close"
              ></button>
            </div>
          )}

          {/* Active Tab Loading State */}
          {activeTab?.isValidating && (
            <div className="text-center my-5">
              <LoadingSpinner message={t('common.actions.validating')} />
            </div>
          )}

          {/* Active Tab Content */}
          {activeTab && !activeTab.isValidating && (
            <>
              {/* No Results - Show Form */}
              {!activeTab.result && (
                <div className="row justify-content-center">
                  <div className="col-lg-8">
                    <div className="card shadow-sm">
                      <div className="card-header bg-primary text-white">
                        <h4 className="card-title mb-0">
                          <i className="bi bi-clipboard-check me-2"></i>
                          {t('common.app_title')}
                        </h4>
                        <p className="card-text mb-0 mt-2 opacity-75">
                          {t('common.app_subtitle')}
                        </p>
                      </div>
                      <div className="card-body">
                        <ValidationForm onValidate={handleValidation} isLoading={activeTab.isValidating} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Has Results - Show Tabs */}
              {activeTab.result && (
                <div className="row">
                  <div className="col">
                    {/* Navigation Tabs */}
                    <ul className="nav nav-tabs mb-4" id="resultTabs" role="tablist">
                      <li className="nav-item" role="presentation">
                        <button 
                          className="nav-link active" 
                          id="form-tab" 
                          data-bs-toggle="tab" 
                          data-bs-target="#form-pane" 
                          type="button" 
                          role="tab" 
                          aria-controls="form-pane" 
                          aria-selected="true"
                        >
                          <i className="bi bi-clipboard-check me-2"></i>
                          {t('common.navigation.validation_tab')}
                        </button>
                      </li>
                      <li className="nav-item" role="presentation">
                        <button 
                          className="nav-link" 
                          id="results-tab" 
                          data-bs-toggle="tab" 
                          data-bs-target="#results-pane" 
                          type="button" 
                          role="tab" 
                          aria-controls="results-pane" 
                          aria-selected="false"
                        >
                          <i className="bi bi-graph-up me-2"></i>
                          {t('common.navigation.results')}
                          <span className="badge bg-primary ms-2">
                            {activeTab.result.quality.percentage.toFixed(1)}%
                          </span>
                        </button>
                      </li>
                    </ul>

                    {/* Tab Content */}
                    <div className="tab-content" id="resultTabContent">
                      {/* Form Tab */}
                      <div 
                        className="tab-pane fade show active" 
                        id="form-pane" 
                        role="tabpanel" 
                        aria-labelledby="form-tab"
                      >
                        <div className="row justify-content-center">
                          <div className="col-lg-8">
                            <div className="card shadow-sm">
                              <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                                <div>
                                  <h4 className="card-title mb-0">
                                    <i className="bi bi-clipboard-check me-2"></i>
                                    {t('common.app_title')}
                                  </h4>
                                  <p className="card-text mb-0 mt-2 opacity-75">
                                    {t('common.app_subtitle')}
                                  </p>
                                </div>
                                <button 
                                  className="btn btn-light btn-sm"
                                  onClick={handleReset}
                                  title={t('common.actions.reset')}
                                >
                                  <i className="bi bi-arrow-clockwise me-1"></i>
                                  {t('common.actions.reset')}
                                </button>
                              </div>
                              <div className="card-body">
                                <ValidationForm onValidate={handleValidation} isLoading={activeTab.isValidating} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Results Tab */}
                      <div 
                        className="tab-pane fade" 
                        id="results-pane" 
                        role="tabpanel" 
                        aria-labelledby="results-tab"
                      >
                        <ValidationResults 
                          result={activeTab.result} 
                          onReset={handleReset}
                          loadingStates={{
                            qualityMetrics: validationProgress.isValidating,
                            shaclValidation: validationProgress.isValidating,
                            vocabularyChecks: validationProgress.isValidating,
                            mqaEvaluation: validationProgress.isValidating,
                            rdfParsing: validationProgress.isValidating
                          }}
                          isProgressive={true}
                          validationProgress={validationProgress}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// Internal App Router component (with context)
function InternalAppRouter() {
  const { t } = useTranslation();
  const location = useLocation();
  const [showDataQualityTab, setShowDataQualityTab] = useState(false);

  // Check if data quality functionality should be enabled
  useEffect(() => {
    const checkDataQualityAvailability = async () => {
      try {
        const isEnabled = await backendService.shouldEnableDataQuality();
        setShowDataQualityTab(isEnabled);
      } catch (error) {
        console.error('Failed to check data quality availability:', error);
        setShowDataQualityTab(false);
      }
    };
    
    checkDataQualityAvailability();
  }, []);

  return (
    <div className="App">
      {/* Navigation Bar */}
      <nav className="navbar navbar-expand-lg border-bottom fixed-top">
        <div className="container-fluid">
          <div className="d-flex align-items-center">
            <Link to="/" className="navbar-brand mb-0 h1 text-decoration-none">
              <i className="bi bi-check-all me-2 text-primary"></i>
              {t('common.app_title')}
            </Link>
          </div>
          <div className="navbar-nav me-auto">
            <Link 
              to="/" 
              className={`nav-link ${location.pathname === '/' ? 'active fw-bold text-primary' : ''}`}
            >
              <i className="bi bi-clipboard-check me-1"></i>
              {t('common.navigation.validation_tab')}
            </Link>
            <Link 
              to="/dashboard" 
              className={`nav-link ${location.pathname === '/dashboard' ? 'active fw-bold text-primary' : ''}`}
            >
              <i className="bi bi-speedometer2 me-1"></i>
              {t('common.navigation.dashboard_tab')}
            </Link>
            {showDataQualityTab && (
              <Link 
                to="/data-quality" 
                className={`nav-link ${location.pathname === '/data-quality' ? 'active fw-bold text-primary' : ''}`}
              >
                <i className="bi bi-graph-up me-1"></i>
                {t('common.navigation.data_quality_tab', 'Calidad de Datos')}
              </Link>
            )}
          </div>
          <div className="d-flex align-items-center">
            <div className="me-2">
              <LanguageSelector />
            </div>
            <ThemeToggle />
            <div className="me-2"></div>
            <a 
              href="https://github.com/mjanez/metadata-quality-react"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-secondary"
              style={{ marginRight: '0.5rem' }}
              title={t('sidebar.links.github_repository')}
              aria-label={t('sidebar.links.github_repository')}
            >
              <i className="bi bi-github"></i>
            </a>
          </div>
        </div>
      </nav>

      {/* Routes */}
      <Routes>
        <Route path="/" element={<ValidationApp />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route 
          path="/data-quality" 
          element={
            showDataQualityTab 
              ? <DataQualityAnalysis /> 
              : <Navigate to="/" replace />
          } 
        />
        {/* Catch-all route for unmatched paths */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

// Main App Router component with Provider
function AppRouter() {
  return (
    <AppStateProvider>
      <InternalAppRouter />
    </AppStateProvider>
  );
}

export default AppRouter;