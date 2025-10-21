import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogDataset, CatalogDistribution } from '../../types/dataQuality';
import DataDiscoveryService from '../../services/DataDiscoveryService';
import LoadingSpinner from '../LoadingSpinner';

interface DatasetSelectorProps {
  onDistributionSelect: (distribution: CatalogDistribution) => void;
  selectedDistribution?: CatalogDistribution | null;
}

interface SearchFilters {
  query: string;
  format: 'all' | 'csv' | 'json';
  limit: number;
}

// Maximum file size for analysis (50MB)
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = '50 MB';

const DatasetSelector: React.FC<DatasetSelectorProps> = ({
  onDistributionSelect,
  selectedDistribution
}) => {
  const { t } = useTranslation();
  const [datasets, setDatasets] = useState<CatalogDataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    format: 'all',
    limit: 10
  });
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());
  
  const discoveryService = DataDiscoveryService.getInstance();

  // Load datasets on component mount and filter changes
  useEffect(() => {
    loadDatasets();
  }, [filters.format, filters.limit]);

  // Load initial datasets on mount
  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const query = filters.query.trim() || undefined;
      let results: CatalogDataset[];
      
      if (filters.format === 'all') {
        results = await discoveryService.getDataQualityCompatibleDatasets(query, filters.limit);
      } else {
        const allResults = await discoveryService.getDataQualityCompatibleDatasets(query, filters.limit * 2);
        results = allResults
          .map((dataset: CatalogDataset) => ({
            ...dataset,
            distributions: dataset.distributions.filter((dist: CatalogDistribution) => 
              isFormatMatch(dist.format || '', filters.format, dist.accessURL) || 
              isFormatMatch(dist.mediaType || '', filters.format, dist.accessURL)
            )
          }))
          .filter((dataset: CatalogDataset) => dataset.distributions.length > 0)
          .slice(0, filters.limit);
      }
      
      setDatasets(results);
    } catch (err) {
      console.error('Error loading datasets:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar datasets');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadDatasets();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const toggleDatasetExpansion = (datasetId: string) => {
    const newExpanded = new Set(expandedDatasets);
    if (newExpanded.has(datasetId)) {
      newExpanded.delete(datasetId);
    } else {
      newExpanded.add(datasetId);
    }
    setExpandedDatasets(newExpanded);
  };

  const isFormatMatch = (value: string, targetFormat: string, url?: string): boolean => {
    const valueLower = value.toLowerCase();
    const urlLower = url?.toLowerCase() || '';
    
    switch (targetFormat) {
      case 'csv':
        return valueLower.includes('csv') || 
               valueLower.includes('text/csv') || 
               valueLower.includes('application/csv') ||
               urlLower.endsWith('.csv') ||
               urlLower.includes('format=csv');
      case 'json':
        return valueLower.includes('json') || 
               valueLower.includes('application/json') || 
               valueLower.includes('text/json') ||
               urlLower.endsWith('.json') ||
               urlLower.includes('format=json');
      default:
        return true;
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  };

  const getFormatBadgeClass = (format: string): string => {
    const formatLower = format.toLowerCase();
    if (formatLower.includes('csv')) return 'badge bg-success';
    if (formatLower.includes('json')) return 'badge bg-info';
    return 'badge bg-secondary';
  };

  const extractThemeName = (themeUrl: string): string => {
    // Extract the last part of the URL (after last / or #)
    const parts = themeUrl.split(/[\/\#]/);
    return parts[parts.length - 1] || themeUrl;
  };

  const isFileSizeExceeded = (byteSize?: number): boolean => {
    return byteSize !== undefined && byteSize > MAX_FILE_SIZE_BYTES;
  };

  return (
    <div className="dataset-selector">
      {/* Search and Filter Controls */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-0">
            <i className="bi bi-search me-2"></i>
            {t('data_quality.selector.title')}
          </h5>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label htmlFor="search-query" className="form-label">
                {t('data_quality.selector.searchQuery')}
              </label>
              <div className="input-group">
                <input
                  id="search-query"
                  type="text"
                  className="form-control"
                  placeholder={t('data_quality.selector.searchPlaceholder')}
                  value={filters.query}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                    setFilters(prev => ({ ...prev, query: e.target.value }))}
                  onKeyPress={handleKeyPress}
                />
                <button 
                  className="btn btn-primary" 
                  type="button" 
                  onClick={handleSearch}
                  disabled={loading}
                >
                  <i className="bi bi-search"></i>
                </button>
              </div>
            </div>
            
            <div className="col-md-3">
              <label htmlFor="format-filter" className="form-label">
                {t('data_quality.selector.format')}
              </label>
              <select
                id="format-filter"
                className="form-select"
                value={filters.format}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => 
                  setFilters(prev => ({ ...prev, format: e.target.value as any }))}
              >
                <option value="all">{t('data_quality.selector.allFormats')}</option>
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </div>
            
            <div className="col-md-3">
              <label htmlFor="limit-select" className="form-label">
                {t('data_quality.selector.limit')}
              </label>
              <select
                id="limit-select"
                className="form-select"
                value={filters.limit}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => 
                  setFilters(prev => ({ ...prev, limit: parseInt(e.target.value) }))}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="results-container">
        {loading && (
          <div className="text-center py-4">
            <LoadingSpinner message={t('data_quality.progress.analyzing')} />
          </div>
        )}

        {error && (
          <div className="alert alert-danger" role="alert">
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            {error}
          </div>
        )}

        {!loading && !error && datasets.length === 0 && (
          <div className="text-center py-4">
            <i className="bi bi-folder2-open display-1 text-muted"></i>
            <h5 className="mt-3">{t('data_quality.selector.noResults')}</h5>
            <p className="text-muted">
              {filters.query.trim() 
                ? t('data_quality.selector.noResultsHelp')
                : t('data_quality.selector.noDataAvailable')
              }
            </p>
            {!filters.query.trim() && (
              <div className="mt-3">
                <small className="text-muted">
                  {t('data_quality.selector.searchExamples')}
                </small>
              </div>
            )}
          </div>
        )}

        {/* Selected Distribution Summary - Moved to Top */}
        {selectedDistribution && (
          <div className="card border-primary mb-4">
            <div className="card-header bg-primary text-white">
              <h6 className="mb-0">
                <i className="bi bi-check-circle me-2"></i>
                {t('data_quality.selector.selectedDistribution')}
              </h6>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-8">
                  <h6>{selectedDistribution.title}</h6>
                  {selectedDistribution.description && (
                    <p className="text-muted small mb-2">{selectedDistribution.description}</p>
                  )}
                  <p className="mb-0">
                    <strong>{t('data_quality.selector.dataset')}:</strong> {selectedDistribution.dataset.title}
                  </p>
                </div>
                <div className="col-md-4 text-md-end">
                  <span className={getFormatBadgeClass(selectedDistribution.format) + ' mb-2'}>
                    {selectedDistribution.format.toUpperCase()}
                  </span>
                  {selectedDistribution.byteSize && (
                    <div className="small mt-2">
                      <span className={isFileSizeExceeded(selectedDistribution.byteSize) ? 'text-danger' : 'text-muted'}>
                        <i className={`bi ${isFileSizeExceeded(selectedDistribution.byteSize) ? 'bi-exclamation-triangle-fill' : 'bi-file-earmark-text'} me-1`}></i>
                        {formatFileSize(selectedDistribution.byteSize)}
                      </span>
                      {isFileSizeExceeded(selectedDistribution.byteSize) && (
                        <div className="alert alert-warning mt-2 mb-0 py-1 px-2 small">
                          <i className="bi bi-info-circle me-1"></i>
                          {t('data_quality.selector.fileSizeWarning', { maxSize: MAX_FILE_SIZE_LABEL })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dataset List with scrollable container */}
        <div style={{ maxHeight: 'calc(10 * 60px)', overflowY: 'auto', overflowX: 'hidden' }} className="dataset-list-container">
        {datasets.map(dataset => (
          <div key={dataset.id} className="card mb-3">
            <div className="card-header">
              <div className="d-flex justify-content-between align-items-start">
                <div className="flex-grow-1">
                  <h6 className="card-title mb-1">
                    <button
                      className="btn btn-link p-0 text-start text-decoration-none"
                      onClick={() => toggleDatasetExpansion(dataset.id)}
                    >
                      <i className={`bi bi-chevron-${expandedDatasets.has(dataset.id) ? 'down' : 'right'} me-2`}></i>
                      {dataset.title}
                    </button>
                  </h6>
                  {dataset.description && (
                    <p className="card-text small text-muted mb-2">
                      {dataset.description.length > 150 
                        ? `${dataset.description.substring(0, 150)}...`
                        : dataset.description
                      }
                    </p>
                  )}
                  <div className="d-flex flex-wrap gap-1">
                    {dataset.publisher && (
                      <span className="badge bg-light text-dark">
                        <i className="bi bi-building me-1"></i>
                        {dataset.publisher}
                      </span>
                    )}
                    <span className="badge bg-primary">
                      {dataset.distributions.length} {t('data_quality.selector.distributions')}
                    </span>
                    {dataset.theme && dataset.theme.map((theme: string) => (
                      <a 
                        key={theme} 
                        href={theme}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="badge bg-info text-decoration-none"
                        title={theme}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        {extractThemeName(theme)}
                        <i className="bi bi-box-arrow-up-right ms-1" style={{ fontSize: '0.7em' }}></i>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            {expandedDatasets.has(dataset.id) && (
              <div className="card-body">
                <h6 className="mb-3">
                  {t('data_quality.selector.availableDistributions')}:
                </h6>
                <div className="row g-3">
                  {dataset.distributions.map((distribution: CatalogDistribution) => (
                    <div key={distribution.id} className="col-md-6">
                      <div 
                        className={`card h-100 distribution-card ${
                          selectedDistribution?.id === distribution.id ? 'border-primary bg-primary bg-opacity-10' : ''
                        }`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => onDistributionSelect(distribution)}
                      >
                        <div className="card-body p-3">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <h6 className="card-title mb-0 small">
                              {distribution.title || t('data_quality.selector.untitledDistribution')}
                            </h6>
                            <span className={getFormatBadgeClass(distribution.format)}>
                              {distribution.format.toUpperCase()}
                            </span>
                          </div>
                          
                          {distribution.description && (
                            <p className="card-text small text-muted mb-2">
                              {distribution.description.length > 80 
                                ? `${distribution.description.substring(0, 80)}...`
                                : distribution.description
                              }
                            </p>
                          )}
                          
                          <div className="small text-muted">
                            {distribution.byteSize && (
                              <div className={isFileSizeExceeded(distribution.byteSize) ? 'text-danger' : ''}>
                                <i className={`bi ${isFileSizeExceeded(distribution.byteSize) ? 'bi-exclamation-triangle-fill' : 'bi-file-earmark-text'} me-1`}></i>
                                {formatFileSize(distribution.byteSize)}
                                {isFileSizeExceeded(distribution.byteSize) && (
                                  <small className="d-block mt-1">
                                    <i className="bi bi-info-circle me-1"></i>
                                    {t('data_quality.selector.sizeWarning')}
                                  </small>
                                )}
                              </div>
                            )}
                            {distribution.mediaType && (
                              <div>
                                <i className="bi bi-filetype-txt me-1"></i>
                                {distribution.mediaType}
                              </div>
                            )}
                            <div className="text-truncate mt-1">
                              <i className="bi bi-link-45deg me-1"></i>
                              <small>{distribution.accessURL}</small>
                            </div>
                          </div>
                          
                          {selectedDistribution?.id === distribution.id && (
                            <div className="mt-2">
                              <i className="bi bi-check-circle-fill text-primary me-1"></i>
                              <small className="text-primary">
                                {t('data_quality.selector.selected')}
                              </small>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
};

export default DatasetSelector;