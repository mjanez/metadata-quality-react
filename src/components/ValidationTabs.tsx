import React from 'react';
import { useTranslation } from 'react-i18next';
import { ValidationTab } from '../types';
import { getRatingFromScore, getScoreProgressClass } from '../utils/ratingUtils';

interface ValidationTabsProps {
  tabs: ValidationTab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
  maxTabs: number;
}

const ValidationTabs: React.FC<ValidationTabsProps> = ({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewTab,
  maxTabs
}) => {
  const { t } = useTranslation();

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return t('time.just_now');
    } else if (diffMinutes < 60) {
      return t('time.minutes_ago', { count: diffMinutes });
    } else if (diffHours < 24) {
      return t('time.hours_ago', { count: diffHours });
    } else {
      return t('time.days_ago', { count: diffDays });
    }
  };

  const getTabIcon = (tab: ValidationTab) => {
    if (tab.isValidating) {
      return <i className="bi bi-hourglass-split me-2 text-warning"></i>;
    }
    if (tab.error) {
      return <i className="bi bi-exclamation-triangle me-2 text-danger"></i>;
    }
    if (tab.result) {
      const rating = getRatingFromScore(tab.result.quality.totalScore, tab.result.profile);
      // Usar icono de información con el mismo color que el badge
      if (rating === 'excellent') {
        return <i className="bi bi-info-circle me-2 text-success"></i>;      // Excellent - Verde oscuro
      } else if (rating === 'good') {
        return <i className="bi bi-info-circle me-2 text-success-light"></i>; // Good - Verde claro
      } else if (rating === 'sufficient') {
        return <i className="bi bi-info-circle me-2 text-warning"></i>;      // Sufficient - Amarillo
      } else {
        return <i className="bi bi-info-circle me-2 text-danger"></i>;       // Poor - Rojo
      }
    }
    return <i className="bi bi-file-earmark me-2"></i>;
  };

  const getTabBadge = (tab: ValidationTab) => {
    if (tab.result) {
      return (
        <span className={`badge fs-7 ${getScoreProgressClass(tab.result.quality.totalScore, tab.result.profile)}`}>
          {t(`results.ratings.${getRatingFromScore(tab.result.quality.totalScore, tab.result.profile)}`)}
        </span>
      );
    }
    return null;
  };

  const getTabTitle = (tab: ValidationTab) => {
    const timeAgo = formatTimeAgo(tab.createdAt);
    
    let status = t('validation.tabs.new');
    if (tab.isValidating) {
      status = t('validation.tabs.validating');
    } else if (tab.error) {
      status = t('validation.tabs.error');
    } else if (tab.result) {
      const rating = getRatingFromScore(tab.result.quality.totalScore, tab.result.profile);
      status = `${tab.result.quality.totalScore.toFixed(1)}/${tab.result.quality.maxScore} (${t(`results.ratings.${rating}`)}) - ${t(`validation.profiles.${tab.result.profile}`)}`;
    }

    return `${tab.name}\n${status}\n${timeAgo}`;
  };

  return (
    <div className="validation-tabs mb-3">
      <ul className="nav nav-tabs" role="tablist">
        {tabs.map((tab) => (
          <li key={tab.id} className="nav-item d-flex" role="presentation">
            <button
              className={`nav-link d-flex align-items-center ${
                activeTabId === tab.id ? 'active' : ''
              }`}
              onClick={() => onTabSelect(tab.id)}
              type="button"
              role="tab"
              title={getTabTitle(tab)}
              style={{ maxWidth: '300px' }}
            >
              {getTabIcon(tab)}
              <span className="text-truncate me-2" style={{ maxWidth: '200px' }}>
                {tab.name}
              </span>
              {getTabBadge(tab)}
            </button>
            
            {tabs.length > 1 && (
              <button
                className="btn btn-sm btn-outline-secondary border-start-0"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                title={t('validation.tabs.close')}
                style={{ 
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  marginLeft: '-1px'
                }}
              >
                <i className="bi bi-x"></i>
              </button>
            )}
          </li>
        ))}
        
        {tabs.length < maxTabs && (
          <li className="nav-item" role="presentation">
            <button
              className="nav-link border-0"
              onClick={onNewTab}
              type="button"
              title={t('validation.tabs.new')}
            >
              <i className="bi bi-plus-lg"></i>
            </button>
          </li>
        )}
      </ul>
      
      {tabs.length >= maxTabs && (
        <div className="alert alert-info mt-2 mb-0">
          <i className="bi bi-info-circle me-2"></i>
          {t('validation.tabs.max_tabs_reached', { max: maxTabs })}
        </div>
      )}
    </div>
  );
};

export default ValidationTabs;