import React, { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';
import { downloadChartAsImage, CHART_DIMENSIONS } from '../utils/chartExport';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

interface QualityChartProps {
  data: {
    [key: string]: {
      score: number;
      maxScore: number;
      percentage: number;
    };
  };
  showDownload?: boolean;
}

const QualityChart = forwardRef<any, QualityChartProps>(({ data, showDownload = false }, ref) => {
  const { t } = useTranslation();
  const chartRef = useRef<any>(null);
  
  // Expose the internal chartRef to parent components
  useImperativeHandle(ref, () => chartRef.current);
  const [theme, setTheme] = useState(document.documentElement.getAttribute('data-bs-theme') || 'light');
  
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-bs-theme') || 'light');
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-bs-theme']
    });
    
    return () => observer.disconnect();
  }, []);
  
  // Download chart function
  const downloadChart = () => {
    downloadChartAsImage(chartRef, 'fairc-radar-chart.png', CHART_DIMENSIONS.radar);
  };
  
  // Read primary RGB from CSS variable --bs-primary-rgb (e.g. "13, 110, 253")
  const primaryRgbRaw = getComputedStyle(document.documentElement).getPropertyValue('--bs-primary-rgb') || '';
  const primaryRgb = primaryRgbRaw.trim() || '13,110,253';
  const primary = `rgba(${primaryRgb}, 1)`;
  const primaryAlpha = `rgba(${primaryRgb}, 0.2)`;

  // Filter out categories with no max score
  const validCategories = Object.entries(data).filter(([_, scores]) => scores.maxScore > 0);
  
  if (validCategories.length === 0) {
    return (
      <div className="text-center text-muted py-4">
        <p>No quality data available for chart</p>
      </div>
    );
  }

  const isDark = theme === 'dark';
  const textColor = isDark ? '#ffffff' : '#000000';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

  const chartData = {
    labels: validCategories.map(([category]) => 
      t(`results.dimensions.${category}`)
    ),
    datasets: [
      {
        label: t('results.quality.chart_label'),
        data: validCategories.map(([_, scores]) => scores.percentage),
        backgroundColor: primaryAlpha,
        borderColor: primary,
        borderWidth: 2,
        pointBackgroundColor: primary,
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: primary,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: textColor,
          font: {
            size: 12,
          },
        }
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const categoryIndex = context.dataIndex;
            const [category, scores] = validCategories[categoryIndex];
            return `${t(`results.dimensions.${category}`)}: ${scores.score}/${scores.maxScore} (${scores.percentage.toFixed(1)}%)`;
          }
        }
      }
    },
    scales: {
      r: {
        beginAtZero: true,
        max: 100,
        ticks: {
          stepSize: 20,
          color: textColor,
          backdropColor: 'transparent',
          callback: function(value: any) {
            return value + '%';
          },
          font: {
            size: 12,
          },
        },
        pointLabels: {
          color: textColor,
          font: {
            size: 12,
          },
          padding: 5,
        },
        grid: {
          color: gridColor,
        },
        angleLines: {
          lineWidth: 2,
        },
      },
    },
  };

  return (
    <div style={{ position: 'relative' }}>
      {showDownload && (
        <div className="d-flex justify-content-end mb-2">
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={downloadChart}
            title={t('results.downloads.radar_chart', 'Descargar gráfico radar como PNG')}
          >
            <i className="bi bi-download me-1"></i>
            PNG
          </button>
        </div>
      )}
      <div style={{ height: '400px', position: 'relative' }}>
        <Radar ref={chartRef} data={chartData} options={options} />
      </div>
    </div>
  );
});

QualityChart.displayName = 'QualityChart';

export default QualityChart;
