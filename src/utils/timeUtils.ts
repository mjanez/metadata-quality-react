/**
 * Utility functions for time formatting
 */

/**
 * Format duration in milliseconds to human readable format
 * @param milliseconds - Duration in milliseconds
 * @param t - Translation function
 * @returns Formatted time string
 */
export const formatValidationDuration = (milliseconds: number, t?: (key: string, options?: any) => string): string => {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }
  
  const seconds = Math.floor(milliseconds / 1000);
  const remainingMs = milliseconds % 1000;
  
  if (seconds < 60) {
    if (remainingMs > 0) {
      return `${seconds}.${Math.floor(remainingMs / 100)}s`;
    }
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    if (remainingSeconds > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${hours}h`;
};

/**
 * Format duration for display with icon
 * @param milliseconds - Duration in milliseconds
 * @param t - Translation function
 * @returns Object with formatted time and icon
 */
export const formatValidationDurationWithIcon = (milliseconds: number, t?: (key: string, options?: any) => string) => {
  const formattedTime = formatValidationDuration(milliseconds, t);
  let icon = 'bi-clock';
  let className = 'text-muted';
  
  if (milliseconds < 5000) { // < 5 seconds
    icon = 'bi-lightning-charge';
    className = 'text-success';
  } else if (milliseconds < 30000) { // < 30 seconds
    icon = 'bi-clock';
    className = 'text-info';
  } else if (milliseconds < 120000) { // < 2 minutes
    icon = 'bi-clock-history';
    className = 'text-warning';
  } else {
    icon = 'bi-hourglass-split';
    className = 'text-danger';
  }
  
  return {
    formattedTime,
    icon,
    className
  };
};