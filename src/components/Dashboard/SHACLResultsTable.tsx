import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardSHACLData } from './DashboardTypes';
import { PrefixService } from '../../services/PrefixService';
import { SHACLMessageService, LocalizedMessage } from '../../services/SHACLMessageService';
import MQAService from '../../services/MQAService';

interface SHACLResultsTableProps {
  shaclData: DashboardSHACLData;
  showProfileCard?: boolean;
}

interface ParsedSHACLResult {
  focusNode: string;
  focusNodeShort?: string;
  path?: string;
  pathShort?: string;
  value?: string;
  message: string;
  localizedMessages?: LocalizedMessage[];
  formattedMessage?: string;
  severity: 'Violation' | 'Warning' | 'Info';
  sourceConstraintComponent?: string;
  sourceShape?: string;
  entityType?: string;
}

const SHACLResultsTable: React.FC<SHACLResultsTableProps> = ({ shaclData, showProfileCard = false }) => {
  const { t, i18n } = useTranslation();
  const [selectedSeverity, setSelectedSeverity] = useState<'all' | 'Violation' | 'Warning' | 'Info'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [prefixService] = useState(() => PrefixService.getInstance());
  const [prefixesLoaded, setPrefixesLoaded] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());
  const itemsPerPage = 10;
  
  // Toggle expanded message
  const toggleMessageExpansion = (index: number) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // Expandable message component
  const ExpandableMessage: React.FC<{ message: string; index: number }> = ({ message, index }) => {
    const isExpanded = expandedMessages.has(index);
    const isLong = message.length > 100;
    
    if (!isLong) {
      return <span>{message}</span>;
    }
    
    return (
      <div>
        <span>
          {isExpanded ? message : `${message.slice(0, 100)}...`}
        </span>
        {isLong && (
          <button
            className="btn btn-link btn-sm p-0 ms-1 text-decoration-none"
            onClick={() => toggleMessageExpansion(index)}
            style={{ fontSize: '0.75rem' }}
          >
            {isExpanded ? t('common.actions.show_less', 'Mostrar menos') : t('common.actions.show_more', 'Mostrar más')}
          </button>
        )}
      </div>
    );
  };

  // Load prefixes on component mount
  useEffect(() => {
    const loadPrefixes = async () => {
      if (!prefixService.isLoaded()) {
        await prefixService.loadPrefixes();
        setPrefixesLoaded(true);
      } else {
        setPrefixesLoaded(true);
      }
    };
    loadPrefixes();
  }, [prefixService]);

  // Parse TTL content to extract SHACL results
  const parsedResults = useMemo(() => {
    const results: ParsedSHACLResult[] = [];
    const lines = shaclData.ttlContent.split('\n');
    
    let currentResult: Partial<ParsedSHACLResult> = {};
    let inResult = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Start of a validation result
      if (trimmedLine.includes('sh:ValidationResult') || trimmedLine.includes('ValidationResult')) {
        if (Object.keys(currentResult).length > 0) {
          results.push(currentResult as ParsedSHACLResult);
        }
        currentResult = {};
        inResult = true;
        continue;
      }
      
      // End of a result block
      if (inResult && (trimmedLine === '] ,' || trimmedLine === ']')) {
        if (Object.keys(currentResult).length > 0) {
          results.push(currentResult as ParsedSHACLResult);
          currentResult = {};
        }
        inResult = false;
        continue;
      }
      
      if (!inResult) continue;
      
      // Extract properties
      if (trimmedLine.includes('sh:resultSeverity')) {
        const severity = trimmedLine.match(/sh:(Violation|Warning|Info)/)?.[1];
        if (severity) {
          currentResult.severity = severity as 'Violation' | 'Warning' | 'Info';
        }
      }
      
      if (trimmedLine.includes('sh:focusNode')) {
        const match = trimmedLine.match(/<([^>]+)>/) || trimmedLine.match(/"([^"]+)"/);
        if (match) {
          currentResult.focusNode = match[1];
          if (prefixesLoaded) {
            currentResult.focusNodeShort = prefixService.contractURI(match[1]);
          }
        }
      }
      
      if (trimmedLine.includes('sh:resultPath')) {
        const match = trimmedLine.match(/<([^>]+)>/) || trimmedLine.match(/"([^"]+)"/);
        if (match) {
          currentResult.path = match[1];
          if (prefixesLoaded) {
            currentResult.pathShort = prefixService.contractURI(match[1]);
          }
        }
      }
      
      if (trimmedLine.includes('sh:value')) {
        const match = trimmedLine.match(/"([^"]+)"/) || trimmedLine.match(/<([^>]+)>/);
        if (match) {
          currentResult.value = match[1];
        }
      }
      
      if (trimmedLine.includes('sh:resultMessage')) {
        const match = trimmedLine.match(/"([^"]+)"/);
        if (match) {
          const messageText = match[1];
          const language = match[2];
          
          // Parse and localize messages
          const messages = SHACLMessageService.parseMessages(trimmedLine);
          const filteredMessages = SHACLMessageService.filterMessagesByLanguage(
            messages,
            i18n.language
          );
          
          currentResult.message = messageText;
          currentResult.localizedMessages = messages;
          currentResult.formattedMessage = filteredMessages.length > 0 
            ? filteredMessages[0].text 
            : messageText;
        }
      }
      
      if (trimmedLine.includes('sh:sourceConstraintComponent')) {
        const match = trimmedLine.match(/sh:(\w+)/);
        if (match) {
          currentResult.sourceConstraintComponent = match[1];
        }
      }
      
      if (trimmedLine.includes('sh:sourceShape')) {
        const match = trimmedLine.match(/_:(\w+)/) || trimmedLine.match(/<([^>]+)>/);
        if (match) {
          currentResult.sourceShape = match[1];
        }
      }
    }
    
    // Add the last result if exists
    if (Object.keys(currentResult).length > 0) {
      results.push(currentResult as ParsedSHACLResult);
    }
    
    // Ensure all results have required fields with defaults
    return results.map(result => ({
      focusNode: result.focusNode || 'Unknown',
      path: result.path,
      value: result.value,
      message: result.message || 'No message available',
      formattedMessage: result.formattedMessage,
      localizedMessages: result.localizedMessages,
      severity: result.severity || 'Info',
      sourceConstraintComponent: result.sourceConstraintComponent,
      sourceShape: result.sourceShape,
      entityType: extractEntityType(result.focusNode)
    }));
  }, [shaclData.ttlContent, prefixesLoaded, prefixService, i18n.language]);

  function extractEntityType(focusNode?: string): string {
    if (!focusNode) return 'Unknown';
    
    if (focusNode.includes('catalogo') || focusNode.includes('catalog')) return 'Catalog';
    if (focusNode.includes('dataset')) return 'Dataset';
    if (focusNode.includes('distribucion') || focusNode.includes('distribution')) return 'Distribution';
    
    return 'Resource';
  }

  // Filter results
  const filteredResults = useMemo(() => {
    let filtered = parsedResults;
    
    if (selectedSeverity !== 'all') {
      filtered = filtered.filter(result => result.severity === selectedSeverity);
    }
    
    if (searchTerm.trim()) {
      filtered = filtered.filter(result => 
        result.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        result.focusNode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (result.path && result.path.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (result.value && result.value.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    return filtered;
  }, [parsedResults, selectedSeverity, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedResults = filteredResults.slice(
    startIndex,
    currentPage * itemsPerPage
  );

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'Violation': return 'bg-danger';
      case 'Warning': return 'bg-warning text-dark';
      case 'Info': return 'bg-info text-dark';
      default: return 'bg-secondary';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'Violation': return 'bi-exclamation-triangle-fill';
      case 'Warning': return 'bi-exclamation-circle-fill';
      case 'Info': return 'bi-info-circle-fill';
      default: return 'bi-question-circle';
    }
  };

  const formatPath = (path?: string) => {
    if (!path) return 'N/A';
    
    // Use prefix service to contract URI if available
    if (prefixesLoaded && prefixService) {
      const contracted = prefixService.contractURI(path);
      if (contracted !== path) {
        return contracted;
      }
    }
    
    // Fallback to extracting local name
    const lastSlash = path.lastIndexOf('/');
    const lastHash = path.lastIndexOf('#');
    const separator = Math.max(lastSlash, lastHash);
    
    if (separator > -1) {
      return path.substring(separator + 1);
    }
    
    return path;
  };

  const exportToCSV = () => {
    const headers = ['Severity', 'Entity Type', 'Focus Node', 'Path', 'Value', 'Message', 'Constraint Component'];
    const csvContent = [
      headers.join(','),
      ...filteredResults.map(result => [
        result.severity,
        result.entityType,
        `"${result.focusNode}"`,
        `"${result.path || ''}"`,
        `"${result.value || ''}"`,
        `"${result.message.replace(/"/g, '""')}"`,
        result.sourceConstraintComponent || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shacl-results-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Statistics
  const stats = useMemo(() => {
    const violations = parsedResults.filter(r => r.severity === 'Violation').length;
    const warnings = parsedResults.filter(r => r.severity === 'Warning').length;
    const infos = parsedResults.filter(r => r.severity === 'Info').length;
    
    return { violations, warnings, infos, total: parsedResults.length };
  }, [parsedResults]);

  // Profile Card Component
  const ProfileCard: React.FC = () => {
    if (!showProfileCard || !shaclData.profile) return null;
    
    // Handle both string and Profile object formats
    let profileString = '';
    let profileDisplayName = '';
    let profileUrl = '';
    
    if (typeof shaclData.profile === 'string') {
      // Legacy string format
      profileString = shaclData.profile;
    } else if (shaclData.profile && typeof shaclData.profile === 'object') {
      // New Profile object format
      profileString = shaclData.profile.id || 'dcat_ap_es';
      profileDisplayName = shaclData.profile.name || '';
      profileUrl = shaclData.profile.url || '';
    } else {
      // Fallback
      profileString = 'dcat_ap_es';
    }
    
    // If we don't have profileDisplayName from the object, try to get it from MQAService
    if (!profileDisplayName) {
      const profileInfo = MQAService.getProfileInfo(profileString as any);
      const defaultVersion = profileInfo?.defaultVersion;
      const versionInfo = defaultVersion && profileInfo?.versions?.[defaultVersion];
      const isValidVersionInfo = versionInfo && typeof versionInfo === 'object' && 'name' in versionInfo;

      if (isValidVersionInfo) {
        profileDisplayName = (versionInfo as any).name;
        if (!profileUrl) {
          profileUrl = (versionInfo as any).url || '';
        }
      } else {
        // Try translation first, then format the profile string
        const translationKey = `validation.profiles.${profileString}`;
        const translatedName = t(translationKey);
        if (translatedName !== translationKey) {
          profileDisplayName = translatedName;
        } else {
          // Format profile string for display
          profileDisplayName = profileString.replace(/_/g, '-').toUpperCase();
        }
      }
    }
    
    const profileInfo = MQAService.getProfileInfo(profileString as any);
    const defaultVersion = profileInfo?.defaultVersion;
    const versionInfo = defaultVersion && profileInfo?.versions?.[defaultVersion];
    const isValidVersionInfo = versionInfo && typeof versionInfo === 'object' && 'name' in versionInfo;
    const maxScore = isValidVersionInfo ? (versionInfo as any).maxScore : undefined;
    
    return (
      <div className="card h-100">
        <div className="card-body text-center d-flex flex-column justify-content-center">
          <div className="mb-2">
            {isValidVersionInfo && (versionInfo as any).icon ? (
              // Check if icon is an image file (ends with image extensions) or a URL
              (typeof (versionInfo as any).icon === 'string' && 
               ((versionInfo as any).icon.startsWith('http') || 
                (versionInfo as any).icon.endsWith('.svg') || 
                (versionInfo as any).icon.endsWith('.png') || 
                (versionInfo as any).icon.endsWith('.jpg') || 
                (versionInfo as any).icon.endsWith('.jpeg'))) ? (
                <img
                  src={(versionInfo as any).icon}
                  alt={profileDisplayName}
                  style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%' }}
                />
              ) : (
                // Assume it's a Bootstrap icon class
                <i
                  className={`${(versionInfo as any).icon || 'bi bi-shield-check'} text-info`}
                  style={{ fontSize: '1.5rem' }}
                  aria-hidden="true"
                ></i>
              )
            ) : (
              <i className="bi bi-shield-check text-info" style={{ fontSize: '1.5rem' }}></i>
            )}
          </div>
          <h6 className="card-title text-secondary">
            {t('dashboard.files.validation_profile')}
          </h6>
          <span className="card-title text-primary">
            <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline-primary btn-sm">
              <i className="bi bi-box-arrow-up-right me-1"></i>{profileDisplayName}
            </a>
          </span>
          {defaultVersion && (
            <small className="text-muted d-block">
              {t('dashboard.files.version')}: {defaultVersion}
            </small>
          )}
          {maxScore && (
            <small className="text-muted d-block">
              {t('dashboard.table.max_score')}: {maxScore}
            </small>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="shacl-results-table">
      {/* Profile Card - Centered and content-sized */}
      {showProfileCard && (
        <div className="row mb-4">
          <div className="col-12 d-flex justify-content-center">
            <div style={{ width: 'auto', minWidth: '300px', maxWidth: '400px' }}>
              <ProfileCard />
            </div>
          </div>
        </div>
      )}
      
      {/* Statistics Cards - 3 cards only (without total) */}
      <div className="row mb-4">
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <h3 className="card-title text-danger">{stats.violations}</h3>
              <p className="card-text">{t('dashboard.overview.violations')}</p>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <h3 className="card-title text-warning">{stats.warnings}</h3>
              <p className="card-text">{t('dashboard.overview.warnings')}</p>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <h3 className="card-title text-info">{stats.infos}</h3>
              <p className="card-text">{t('dashboard.overview.info_messages')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="card mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h6 className="card-title mb-0">
            <i className="bi bi-table me-2"></i>
            {t('shacl.validation_results')} ({filteredResults.length} {t('common.units.of')} {parsedResults.length})
          </h6>
          <button
            className="btn btn-outline-success btn-sm"
            onClick={exportToCSV}
          >
            <i className="bi bi-filetype-csv me-1"></i>
            {t('shacl.actions.export_csv')}
          </button>
        </div>
        <div className="card-body">
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <div className="input-group">
                <span className="input-group-text">
                  <i className="bi bi-search"></i>
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder={t('dashboard.table.search_results')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="col-md-6">
              <select
                className="form-select"
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value as any)}
              >
                <option value="all">{t('dashboard.table.all_severities')} ({stats.total})</option>
                <option value="Violation">{t('dashboard.overview.violations')} ({stats.violations})</option>
                <option value="Warning">{t('dashboard.overview.warnings')} ({stats.warnings})</option>
                <option value="Info">{t('dashboard.overview.info_messages')} ({stats.infos})</option>
              </select>
            </div>
          </div>

          {/* Results Table */}
          <div className="table-responsive">
            <table className="table table-hover">
              <thead className="table-light">
                <tr>
                  <th style={{ width: '10%' }}>{t('dashboard.table.severity')}</th>
                  <th style={{ width: '10%' }}>{t('dashboard.table.entity_type')}</th>
                  <th style={{ width: '20%' }}>{t('dashboard.table.focus_node')}</th>
                  <th style={{ width: '15%' }}>{t('dashboard.table.path')}</th>
                  <th style={{ width: '15%' }}>{t('dashboard.table.value')}</th>
                  <th style={{ width: '30%' }}>{t('dashboard.table.message')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedResults.length > 0 ? (
                  paginatedResults.map((result, index) => (
                    <tr key={index}>
                      <td>
                        <span className={`badge ${getSeverityBadge(result.severity)}`}>
                          <i className={`${getSeverityIcon(result.severity)} me-1`}></i>
                          {result.severity}
                        </span>
                      </td>
                      <td>
                        <span className="badge bg-light text-dark">
                          {result.entityType}
                        </span>
                      </td>
                      <td>
                        <small className="text-break" title={result.focusNode}>
                          {result.focusNode.length > 30 
                            ? '...' + result.focusNode.slice(-30)
                            : result.focusNode
                          }
                        </small>
                      </td>
                      <td>
                        <code className="small">
                          {formatPath(result.path)}
                        </code>
                      </td>
                      <td>
                        <small className="text-break">
                          {result.value ? (
                            result.value.length > 20 
                              ? result.value.slice(0, 20) + '...'
                              : result.value
                          ) : 'N/A'}
                        </small>
                      </td>
                      <td>
                        <small className="text-break">
                          <ExpandableMessage 
                            message={result.formattedMessage || result.message}
                            index={startIndex + index}
                          />
                        </small>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-4">
                      {searchTerm || selectedSeverity !== 'all' 
                        ? t('dashboard.table.no_results_filter')
                        : t('dashboard.table.no_results')
                      }
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav aria-label="SHACL results pagination">
              <ul className="pagination justify-content-center">
                <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                  <button
                    className="page-link"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                </li>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                  return (
                    <li key={page} className={`page-item ${currentPage === page ? 'active' : ''}`}>
                      <button
                        className="page-link"
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    </li>
                  );
                })}
                <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                  <button
                    className="page-link"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </li>
              </ul>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
};

export default SHACLResultsTable;