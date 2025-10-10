/**
 * Chart Export Utilities
 * 
 * Provides standardized image export functionality for all charts in the application.
 * All exported images follow the same dimensions and DPI for consistency across different contexts
 * (reports, presentations, documentation, etc.)
 */

/**
 * Standard export configuration for all charts
 */
export const CHART_EXPORT_CONFIG = {
  // Standard width (height will be calculated based on original aspect ratio)
  targetWidth: 800,  // Fixed width for consistency

  // Scale factor for high-resolution export
  // 2x = 200% resolution, 3x = 300%, etc.
  scaleFactor: 1.5,    // 1.5x resolution for sharp, detailed images
  
  // Format settings
  format: 'image/png' as const,
  quality: 1.0,     // Maximum quality (1.0 = 100%)
  
  // Background color (transparent for charts)
  backgroundColor: 'transparent',
} as const;

/**
 * Optional target widths for different chart types
 * Height will be calculated automatically based on original aspect ratio
 */
export const CHART_DIMENSIONS = {
  radar: {
    width: 500,    // Square format for radar chart
    height: 500,   // No margins, just the chart
    noScale: true, // Don't apply scale factor for radar
  },
  bar: {
    width: 800,
  },
  dimensionDetail: {
    width: 800,
  },
  square: {
    width: 800,
  },
} as const;



/**
 * Download a chart with fixed width and preserved aspect ratio at high resolution
 * 
 * @param chartRef - Reference to the Chart.js chart instance
 * @param filename - Desired filename for the download
 * @param dimensions - Optional custom dimensions (only width is used, height calculated from aspect ratio)
 */
export const downloadChartAsImage = (
  chartRef: React.RefObject<any>,
  filename: string,
  dimensions?: { width: number; height?: number }
): void => {
  if (!chartRef.current) {
    console.warn('Chart reference is null, cannot download');
    return;
  }

  try {
    const chart = chartRef.current;
    const originalCanvas = chart.canvas;
    
    // Get original dimensions to preserve aspect ratio
    const originalWidth = originalCanvas.width;
    const originalHeight = originalCanvas.height;
    const aspectRatio = originalHeight / originalWidth;
    
    // Calculate target dimensions (fixed width, calculated height)
    const targetWidth = dimensions?.width || CHART_EXPORT_CONFIG.targetWidth;
    const targetHeight = dimensions?.height || Math.round(targetWidth * aspectRatio);
    
    // Apply scale factor for high resolution (final export size)
    // Skip scaling if noScale is true (for radar chart)
    const scaleFactor = (dimensions as any)?.noScale ? 1 : CHART_EXPORT_CONFIG.scaleFactor;
    const exportWidth = targetWidth * scaleFactor;
    const exportHeight = targetHeight * scaleFactor;
       
    // Store original size for restoration
    const originalStyle = {
      width: originalCanvas.style.width,
      height: originalCanvas.style.height
    };

    // Small delay to allow chart to fully render before export
    setTimeout(() => {
      try {
        // Temporarily resize chart to export size
        chart.resize(exportWidth, exportHeight);
        chart.update('none'); // Update without animation
        
        // Wait for resize to complete
        setTimeout(() => {
          try {
            const dataURL = originalCanvas.toDataURL(
              CHART_EXPORT_CONFIG.format,
              CHART_EXPORT_CONFIG.quality
            );

            const link = document.createElement('a');
            link.download = filename;
            link.href = dataURL;
            link.click();
            
            console.log(`✅ Chart exported: ${filename} (${exportWidth}x${exportHeight}px)`);
          } finally {
            // Always restore original size
            chart.resize(originalWidth, originalHeight);
            if (originalStyle.width) originalCanvas.style.width = originalStyle.width;
            if (originalStyle.height) originalCanvas.style.height = originalStyle.height;
            chart.update('none');
          }
        }, 100);
      } catch (error) {
        // Restore original size on error
        chart.resize(originalWidth, originalHeight);
        if (originalStyle.width) originalCanvas.style.width = originalStyle.width;
        if (originalStyle.height) originalCanvas.style.height = originalStyle.height;
        throw error;
      }
    }, 50);
    
  } catch (error) {
    console.error('Error downloading chart:', error);
    // Fallback to simple download
    fallbackDownload(chartRef, filename);
  }
};

/**
 * Fallback download method using simple toDataURL
 */
const fallbackDownload = (
  chartRef: React.RefObject<any>,
  filename: string
): void => {
  if (!chartRef.current) return;

  try {
    const canvas = chartRef.current.canvas;
    const url = canvas.toDataURL(CHART_EXPORT_CONFIG.format, CHART_EXPORT_CONFIG.quality);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
  } catch (error) {
    console.error('Fallback download also failed:', error);
  }
};

/**
 * Render a chart at high resolution and return as base64 data
 * This is a helper for batch ZIP exports
 * 
 * @param chartOrCanvas - Chart.js instance or HTMLCanvasElement
 * @param targetWidth - Desired output width (height calculated from aspect ratio)
 * @returns Promise with Base64 encoded image data at high resolution
 */
export const renderChartAtHighRes = async (
  chartOrCanvas: any,
  targetWidth: number = CHART_EXPORT_CONFIG.targetWidth,
  targetHeight?: number,
  noScale?: boolean
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      // Determine if we have a Chart.js instance or a raw canvas
      const isChartInstance = chartOrCanvas.canvas !== undefined;
      const canvas = isChartInstance ? chartOrCanvas.canvas : chartOrCanvas;
      const chart = isChartInstance ? chartOrCanvas : null;
      
      // Get original dimensions to preserve aspect ratio
      const originalWidth = canvas.width;
      const originalHeight = canvas.height;
      const aspectRatio = originalHeight / originalWidth;
      
      // Calculate target dimensions
      const calculatedHeight = targetHeight || Math.round(targetWidth * aspectRatio);
      
      // Apply scale factor for high resolution (skip if noScale is true)
      const scaleFactor = noScale ? 1 : CHART_EXPORT_CONFIG.scaleFactor;
      const exportWidth = targetWidth * scaleFactor;
      const exportHeight = calculatedHeight * scaleFactor;

      if (chart) {
        // For Chart.js instances, temporarily resize for accurate export
        const originalStyle = {
          width: canvas.style.width,
          height: canvas.style.height
        };

        setTimeout(() => {
          try {
            chart.resize(exportWidth, exportHeight);
            chart.update('none');
            
            setTimeout(() => {
              try {
                const dataURL = canvas.toDataURL(
                  CHART_EXPORT_CONFIG.format,
                  CHART_EXPORT_CONFIG.quality
                );
                resolve(dataURL);
              } finally {
                // Restore original size
                chart.resize(originalWidth, originalHeight);
                if (originalStyle.width) canvas.style.width = originalStyle.width;
                if (originalStyle.height) canvas.style.height = originalStyle.height;
                chart.update('none');
              }
            }, 100);
          } catch (error) {
            chart.resize(originalWidth, originalHeight);
            if (originalStyle.width) canvas.style.width = originalStyle.width;
            if (originalStyle.height) canvas.style.height = originalStyle.height;
            reject(error);
          }
        }, 50);
      } else {
        // For raw canvas without Chart.js instance, scale directly
        const exportCanvas = document.createElement('canvas');
        const ctx = exportCanvas.getContext('2d', { alpha: true }); // Allow transparency
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        exportCanvas.width = exportWidth;
        exportCanvas.height = exportHeight;

        // Only fill background if it's not transparent
        if (CHART_EXPORT_CONFIG.backgroundColor !== 'transparent') {
          ctx.fillStyle = CHART_EXPORT_CONFIG.backgroundColor;
          ctx.fillRect(0, 0, exportWidth, exportHeight);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.drawImage(canvas, 0, 0, exportWidth, exportHeight);

        resolve(exportCanvas.toDataURL(CHART_EXPORT_CONFIG.format, CHART_EXPORT_CONFIG.quality));
      }
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Download multiple charts as a ZIP file with fixed width and preserved aspect ratios
 * Uses high-resolution rendering for each chart
 * 
 * @param charts - Array of chart references with their filenames
 * @param zipFilename - Name for the ZIP file
 */
export const downloadChartsAsZip = async (
  charts: Array<{
    ref: React.RefObject<any>;
    filename: string;
    targetWidth?: number;
  }>,
  zipFilename: string = 'charts.zip'
): Promise<void> => {
  try {
    // Dynamic import to reduce bundle size
    const { zip } = await import(/* webpackChunkName: "fflate" */ 'fflate');
    
    const files: { [key: string]: Uint8Array } = {};

    // Render each chart at high resolution
    for (const chart of charts) {
      if (chart.ref.current) {
        const targetWidth = chart.targetWidth || CHART_EXPORT_CONFIG.targetWidth;
        
        // Use renderChartAtHighRes for true high-quality export
        const dataUrl = await renderChartAtHighRes(chart.ref.current, targetWidth);
        const base64Data = dataUrl.split(',')[1];
        
        // Convert to Uint8Array
        files[chart.filename] = new Uint8Array(
          atob(base64Data).split('').map(c => c.charCodeAt(0))
        );
      }
    }

    // Create ZIP using callback style
    zip(files, { level: 6 }, (err, data) => {
      if (err) {
        console.error('Error creating ZIP:', err);
        throw err;
      }
      
      // Download ZIP
      const arrayBuffer = (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength);
      const blob = new Blob([arrayBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = zipFilename;
      link.href = url;
      link.click();
      
      // Clean up
      URL.revokeObjectURL(url);
      
      console.log(`✅ ZIP created with ${Object.keys(files).length} high-res charts`);
    });
  } catch (error) {
    console.error('Error creating ZIP file:', error);
    throw error;
  }
};

/**
 * Get metadata for exported images
 */
export const getExportMetadata = () => {
  return {
    targetWidth: `${CHART_EXPORT_CONFIG.targetWidth}px`,
    scaleFactor: `${CHART_EXPORT_CONFIG.scaleFactor}x`,
    effectiveResolution: `${CHART_EXPORT_CONFIG.targetWidth * CHART_EXPORT_CONFIG.scaleFactor}px width`,
    format: CHART_EXPORT_CONFIG.format,
    quality: `${CHART_EXPORT_CONFIG.quality * 100}%`,
    aspectRatio: 'Preserved from original',
    generatedAt: new Date().toISOString(),
  };
};
