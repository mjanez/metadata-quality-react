import React from 'react';
import { useTranslation } from 'react-i18next';

interface LoadingSpinnerProps {
  message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message }) => {
  const { t } = useTranslation();
  const displayMessage = message || t('common.states.loading');
  const showDetailedMessage = !message; // Only show detailed message when using default
  
  return (
    <div className="text-center py-5">
      <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
        <span className="visually-hidden">{t('common.states.loading')}</span>
      </div>
      <div className="mt-3">
        <p className="text-muted">{displayMessage}</p>
        {showDetailedMessage && (
          <small className="text-muted">
            <i>{t('common.states.validating_detailed')}</i>
          </small>
        )}
      </div>
    </div>
  );
};

export default LoadingSpinner;
