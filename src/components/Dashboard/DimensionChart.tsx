import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import ScoreBadge from '../common/ScoreBadge';
import { DashboardMetricsData } from './DashboardTypes';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface DimensionChartProps {
  dimension: string;
  metricsData: DashboardMetricsData;
  onDownload?: (chartRef: React.RefObject<any>, filename: string) => void;
  theme?: string;
}

const DimensionChart: React.FC<DimensionChartProps> = ({ 
  dimension, 
  metricsData, 
  onDownload,
  theme: propTheme 
}) => {
  const { t } = useTranslation();
  const chartRef = useRef<any>(null);
  const [theme, setTheme] = useState(propTheme || document.documentElement.getAttribute('data-bs-theme') || 'light');
  
  useEffect(() => {
    if (!propTheme) {
      const observer = new MutationObserver(() => {
        setTheme(document.documentElement.getAttribute('data-bs-theme') || 'light');
      });
      
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-bs-theme']
      });
      
      return () => observer.disconnect();
    }
  }, [propTheme]);

  // Filter metrics for this dimension
  const dimensionMetrics = metricsData.metrics.filter(metric => metric.dimension === dimension);
  
  // Calculate dimension score
  const dimensionScore = metricsData.dimensions[dimension as keyof typeof metricsData.dimensions] || 0;
  const dimensionMaxScore = dimensionMetrics.reduce((sum, metric) => sum + metric.maxScore, 0);
  const dimensionPercentage = dimensionMaxScore > 0 ? (dimensionScore / dimensionMaxScore) * 100 : 0;

  // Prepare chart data
  const chartData = {
    labels: dimensionMetrics.map(metric => t(`metrics.specific.${metric.id}`) || metric.id),
    datasets: [
      {
        label: t('dashboard.overview.total_score'),
        data: dimensionMetrics.map(metric => metric.score),
        backgroundColor: 'rgba(13, 110, 253, 0.2)',
        borderColor: 'rgba(13, 110, 253, 1)',
        borderWidth: 2,
      },
      {
        label: t('dashboard.table.max_score'),
        data: dimensionMetrics.map(metric => metric.maxScore),
        backgroundColor: 'rgba(108, 117, 125, 0.3)',
        borderColor: 'rgba(108, 117, 125, 1)',
        borderWidth: 1,
      },
    ],
  };

  const isDark = theme === 'dark';
  const textColor = isDark ? '#ffffff' : '#000000';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: textColor,
        }
      },
      title: {
        display: true,
        text: `${t(`results.dimensions.${dimension}`)}`,
        color: textColor,
        position: 'top' as const,
          font: {
            size: 14,
          },
      },
      tooltip: {
        callbacks: {
          afterLabel: (context: any) => {
            const metric = dimensionMetrics[context.dataIndex];
            const percentage = (metric.score / metric.maxScore * 100).toFixed(1);
            return `${t('dashboard.table.percentage')}: ${percentage}%`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: textColor,
          maxRotation: 45,
          minRotation: 0,
        },
        grid: {
          color: gridColor,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: textColor,
        },
        grid: {
          color: gridColor,
        },
      },
    },
  };

  const handleDownload = () => {
    if (onDownload && chartRef.current) {
      const filename = `${dimension}-metrics-chart.png`;
      onDownload(chartRef, filename);
    }
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 86) return 'text-success';
    if (percentage >= 55) return 'text-success';
    if (percentage >= 30) return 'text-warning';
    return 'text-danger';
  };

  return (
    <div className="card h-100">
      <div className="card-header d-flex justify-content-between align-items-center">
        <div>
          <h6 className="card-title mb-1">
            <i className={`bi bi-${getDimensionIcon(dimension)} me-2`}></i>
            {t(`results.dimensions.${dimension}`)}
          </h6>
          <div className="d-flex align-items-center">
            <ScoreBadge 
              score={dimensionScore}
              maxScore={dimensionMaxScore}
              variant="score"
              size="sm"
              className="me-2"
            />
            <ScoreBadge 
              percentage={dimensionPercentage}
              variant="percentage"
              size="sm"
            />
          </div>
        </div>
        {onDownload && (
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={handleDownload}
            title={t('common.actions.download')}
          >
            <i className="bi bi-download me-1"></i>
            {t('common.actions.download')}
          </button>
        )}
      </div>
      <div className="card-body">
        <div style={{ height: '300px' }}>
          <Bar ref={chartRef} data={chartData} options={chartOptions} />
        </div>
        <div className="mt-2">
          <small className="text-muted">
            {dimensionMetrics.length} {t('dashboard.overview.total_metrics').toLowerCase()}
          </small>
        </div>
      </div>
    </div>
  );
};

// Helper function to get dimension icons
const getDimensionIcon = (dimension: string): string => {
  switch (dimension) {
    case 'findability': return 'search';
    case 'accessibility': return 'unlock';
    case 'interoperability': return 'link-45deg';
    case 'reusability': return 'recycle';
    case 'contextuality': return 'clipboard-data';
    default: return 'graph-up';
  }
};

export default DimensionChart;