/**
 * Title: Player Dashboard
 * Description: A player dashboard to compare NBA player stats
 */
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Search } from 'lucide-react';
import csvData from '../data/nba_stats.csv?raw';

/**
 * Parses a CSV string into an array of objects
 * @param {string} csvString - The CSV string to parse
 * @returns {Array} An array of objects representing the CSV data
 */
const parseCSV = (csvString) => {
  const rows = csvString.split('\n');
  const headers = rows[0].split(',').map(h => h.replace(/"/g, '').trim());
  return rows.slice(1)
    .filter(row => row.trim() !== '')
    .map(row => {
      const values = row.split(',').map(v => v.replace(/"/g, '').trim());
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] === '' ? null : isNaN(values[index]) ? values[index] : parseFloat(values[index]);
      });
      return obj;
    })
    .filter(player => player.PPG !== null);
};

/**
 * Checks if a player object has valid data for the given configuration
 * @param {Object} player - The player object to check
 * @param {Object} config - The chart configuration object
 * @returns {boolean} True if the player has valid data, false otherwise
 * */
const isValidPlayerData = (player, config) => {
  return player && 
        typeof player[config.x] !== 'undefined' && 
        typeof player[config.y] !== 'undefined' && 
        player.TEAM && 
        player.POS && 
        player.NAME;
};

/**
 * Calculates the regression line for a set of data points
 * @param {Array} data - The data points to calculate the regression line for
 * @param {Function} xAccessor - The function to access the x value of a data point
 * @param {Function} yAccessor - The function to access the y value of a data point
 * @returns {Array} An array of two points representing the regression line
 */
const calculateRegressionLine = (data, xAccessor, yAccessor) => {
  const points = data.map(d => [xAccessor(d), yAccessor(d)]);
  const xSum = points.reduce((acc, p) => acc + p[0], 0);
  const ySum = points.reduce((acc, p) => acc + p[1], 0);
  const n = points.length;
  const xMean = xSum / n;
  const yMean = ySum / n;
  const numerator = points.reduce((acc, p) => acc + (p[0] - xMean) * (p[1] - yMean), 0);
  const denominator = points.reduce((acc, p) => acc + Math.pow(p[0] - xMean, 2), 0);
  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;
  return [
    [d3.min(points, p => p[0]), slope * d3.min(points, p => p[0]) + intercept],
    [d3.max(points, p => p[0]), slope * d3.max(points, p => p[0]) + intercept]
  ];
};

/**
 * Calculates the correlation coefficient between two variables in a dataset
 * @param {Array} data - The dataset to calculate the correlation for
 * @param {string} xKey - The key of the x variable in the dataset
 * @param {string} yKey - The key of the y variable in the dataset
 * @returns {number} The correlation coefficient between the two variables
 */
const calculateCorrelation = (data, xKey, yKey) => {
  const n = data.length;
  const xMean = d3.mean(data, d => d[xKey]);
  const yMean = d3.mean(data, d => d[yKey]);
  const numerator = data.reduce((sum, d) => 
    sum + ((d[xKey] - xMean) * (d[yKey] - yMean)), 0);
  const xVariance = data.reduce((sum, d) => 
    sum + Math.pow(d[xKey] - xMean, 2), 0);
  const yVariance = data.reduce((sum, d) => 
    sum + Math.pow(d[yKey] - yMean, 2), 0);
  return numerator / Math.sqrt(xVariance * yVariance);
};

// ==============================
// PlayerDashboard Component
// ==============================
const PlayerDashboard = () => {
  /**
   * Refs for the scatter plot and bar chart elements
   */
  const scatterRef = useRef(null);
  const barRef = useRef(null);
  const [data, setData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMetric, setSelectedMetric] = useState('PPG');
  const [selectedView, setSelectedView] = useState('scoring');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [minMinutes, setMinMinutes] = useState(0);
  const positionColors = {
    'G': '#1f77b4',  
    'F': '#2ca02c',  
    'C': '#ff7f0e',  
    'ALL': '#9467bd' 
  };

  // ==============================
  // Helper Functions
  // ==============================
  /**
   * Gets the color for a player based on their position
   * @param {string} position - The position of the player
   * @returns {string} The color for the player
   */
  const getPlayerColor = (position) => {
    if (position.includes('G')) return positionColors['G'];
    if (position.includes('F')) return positionColors['F'];
    if (position.includes('C')) return positionColors['C'];
    return positionColors['ALL'];
  };

  /**
   * Gets the search suggestions based on the search term
   * @param {string} searchTerm - The search term to get suggestions for
   * @returns {Array} An array of search suggestions
   */
  const getSearchSuggestions = (searchTerm) => {
    if (!searchTerm) return [];
    return data
      .filter(player => 
        player.NAME.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !selectedPlayers.includes(player.NAME)
      )
      .map(player => player.NAME)
      .slice(0, 5); 
  };
  /**
   * Toggles a player in the selected players list
   * @param {string} playerName - The name of the player to toggle
   */
  const [activeFilters, setActiveFilters] = useState({
    position: false,
    minutes: false,
    search: false,
    metric: false,
    view: false
  });
  
  const DEFAULT_METRIC = 'PPG';
  const DEFAULT_VIEW = 'scoring';


  // ==============================
  // UseEffect Hooks
  // ==============================

  /**
   * Parses the CSV data when the component mounts and sets the data state
   */
  useEffect(() => {
    const parsedData = parseCSV(csvData);
    setData(parsedData);
  }, []);


  //================================================================================================
  // Scatter Plot
  //================================================================================================
  useEffect(() => {
    if (!data.length) return;
    d3.select(scatterRef.current).selectAll('*').remove();

    const container = d3.select(scatterRef.current);
    const containerWidth = container.node().getBoundingClientRect().width;
    const containerHeight = Math.min(containerWidth * 0.6, 500);

    // Calculate margins based on container dimensions
    const margin = {
        top: containerHeight * 0.1,     // 10% of height
        right: containerWidth * 0.05,   // 5% of width
        bottom: containerHeight * 0.25,  // 25% of height
        left: containerWidth * 0.1      // 10% of width
    };

    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;


    const legendHeight = 0;  
    const totalHeight = height + margin.top + margin.bottom + legendHeight;
    const svg = d3.select(scatterRef.current)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', totalHeight)  
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Zoom Functionality
  const zoom = d3.zoom()
    .scaleExtent([1, 8])  
    .extent([[0, 0], [width, height]])
    .translateExtent([[0, 0], [width, height]])  
    .on('zoom', zoomed);

  // Zoom Overlay
  svg.append('rect')
    .attr('class', 'zoom-overlay')
    .attr('width', width)
    .attr('height', height)
    .style('fill', 'none')
    .style('pointer-events', 'all')
    .call(zoom)
    .on('mousedown.zoom', null)
    .on('touchstart.zoom', null);
  
  /**
   * Zoom Event Handler
   * @param {Object} event - The zoom event object
   */
  function zoomed(event) {
    const transform = event.transform;
    const newX = transform.rescaleX(x);
    const newY = transform.rescaleY(y);
    svg.select('.x-axis')
      .transition()
      .duration(50)
      .call(d3.axisBottom(newX));
    svg.select('.y-axis')
      .transition()
      .duration(50)
      .call(d3.axisLeft(newY));
    plotArea.selectAll('circle')
    .attr('cx', d => newX(d[config.x]))
    .attr('cy', d => newY(d[config.y]))
    .attr('r', function() {
      const isSelected = d3.select(this).classed('selected');
      const searchActive = searchTerm && !d3.select(this).datum().NAME.toLowerCase().includes(searchTerm.toLowerCase());
      if (isSelected) return 8;
      if (searchActive) return 4;
      return 6;
      });

  /**
   * Updates the scatter plot based on the current configuration
   */
  plotArea.selectAll('.connection-line')
    .attr('x1', d => newX(d.source[config.x]))
    .attr('y1', d => newY(d.source[config.y]))
    .attr('x2', d => newX(d.target[config.x]))
    .attr('y2', d => newY(d.target[config.y]))
    .style('stroke-width', 1 / transform.k); 
    svg.select('.x-axis').call(d3.axisBottom(newX));
    svg.select('.y-axis').call(d3.axisLeft(newY));
    svg.selectAll('circle')
    .filter(d => isValidPlayerData(d, config))
    .attr('cx', d => newX(d[config.x]))
    .attr('cy', d => newY(d[config.y]));
    }

  /**
   * Updates the scatter plot based on the current configuration
  */
  const getChartConfig = () => {
    // Configuration for each view
    const viewConfigs = {
      'efficiency': {
        x: 'TS%',
        xLabel: 'True Shooting Percentage',
        defaultY: 'eFG%',
        defaultYLabel: 'Effective Field Goal Percentage',
        title: 'Player Efficiency Comparison'
      },
      'scoring': {
        x: 'USG%',
        xLabel: 'Usage Rate (% of Team Plays)',
        defaultY: 'PPG',
        defaultYLabel: 'Points per Game',
        title: 'Player Scoring Analysis'
      },
      'overview': {
        x: 'MPG',
        xLabel: 'Minutes per Game',
        defaultY: 'VI',
        defaultYLabel: 'Versatility Index',
        title: 'Player Impact Analysis'
      }
  };

  // Get the label for a given metric
  const getMetricLabel = (metric) => {
    const metricLabels = {
      'PPG': 'Points per Game',
      'RPG': 'Rebounds per Game',
      'APG': 'Assists per Game',
      'TS%': 'True Shooting Percentage',
      'USG%': 'Usage Rate',
      'eFG%': 'Effective Field Goal Percentage',
      'VI': 'Versatility Index',
      'ORTG': 'Offensive Rating',
      'DRTG': 'Defensive Rating'
    };
    return metricLabels[metric] || metric;
  };

  // Get the configuration for the selected view
  const baseConfig = viewConfigs[selectedView];
  return {
    x: baseConfig.x,
    y: selectedMetric,
    xLabel: baseConfig.xLabel,
    yLabel: getMetricLabel(selectedMetric),
    title: `${baseConfig.title} vs ${getMetricLabel(selectedMetric)}`
  };
};
  // Get the configuration for the chart
  const config = getChartConfig();
  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d[config.x])])
    .range([0, width]);
  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d[config.y])])
    .range([height, 0]);

  // Append the plot area and clip path
  svg.append('defs')
    .append('clipPath')
    .attr('id', 'plot-area')
    .append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('x', 0)
    .attr('y', 0);

  // Append the plot area and regression line
  const plotArea = svg.append('g')
    .attr('clip-path', 'url(#plot-area)');
  const regressionPoints = calculateRegressionLine(
    filteredPlayers,
    d => d[config.x],
    d => d[config.y]
  );
  
  // Append the axes and labels
  svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height})`)
    .transition()
    .duration(1000)
    .call(d3.axisBottom(x));

  svg.append('g')
    .attr('class', 'y-axis')
    .transition()
    .duration(1000)
    .call(d3.axisLeft(y));

  // Append the axis labels
  svg.append('text')
    .attr('class', 'x-axis-label')
    .attr('x', width / 2)
    .attr('y', height + 40)
    .attr('text-anchor', 'middle')
    .style('font-size', '14px')
    .style('fill', '#666')
    .text(config.xLabel);

  // Append the y-axis label
  svg.append('text')
    .attr('class', 'y-axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', -45)
    .attr('text-anchor', 'middle')
    .style('font-size', '14px')
    .style('fill', '#666')
    .text(config.yLabel);

  // Append the mean lines
  const xMean = d3.mean(filteredPlayers, d => d[config.x]);
  const yMean = d3.mean(filteredPlayers, d => d[config.y]);
  
  svg.append('line')
    .attr('x1', x(xMean))
    .attr('x2', x(xMean))
    .attr('y1', 0)
    .attr('y2', height)
    .style('stroke', '#ddd')
    .style('stroke-dasharray', '4,4');
  svg.append('line')
    .attr('x1', 0)
    .attr('x2', width)
    .attr('y1', y(yMean))
    .attr('y2', y(yMean))
    .style('stroke', '#ddd')
    .style('stroke-dasharray', '4,4');

  // Append the quadrant labels
  const quadrantLabels = [
    { x: width * 0.25, y: height * 0.25, text: "High " + config.yLabel },
    { x: width * 0.75, y: height * 0.25, text: "Elite Performance" },
    { x: width * 0.25, y: height * 0.75, text: "Below Average" },
    { x: width * 0.75, y: height * 0.75, text: "High " + config.xLabel }
  ];

  svg.selectAll('.quadrant-label')
    .data(quadrantLabels)
    .enter()
    .append('text')
    .attr('class', 'quadrant-label')
    .attr('x', d => d.x)
    .attr('y', d => d.y)
    .attr('text-anchor', 'middle')
    .style('font-size', '10px')
    .style('fill', '#999')
    .text(d => d.text);

  // Append the correlation coefficient
  const correlation = calculateCorrelation(filteredPlayers, config.x, config.y);
  
  svg.append('text')
    .attr('x', 10)
    .attr('y', 10)
    .style('font-size', '12px')
    .style('fill', '#666')
    .text(`Correlation: ${correlation.toFixed(2)}`);

  // Append the chart title
  svg.append('text')
    .attr('class', 'chart-title')
    .attr('x', width / 2)
    .attr('y', -20)
    .attr('text-anchor', 'middle')
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('fill', '#333')
    .text(config.title);

  // Append the tooltip
  const validPlayers = filteredPlayers.filter(player => isValidPlayerData(player, config));
  const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'tooltip')
    .style('position', 'absolute')
    .style('background-color', 'white')
    .style('padding', '10px')
    .style('border', '1px solid #ccc')
    .style('border-radius', '5px')
    .style('visibility', 'hidden')
    .style('pointer-events', 'none')
    .style('z-index', '1000');

  /**
   * Event handler for mouseover events on the data points
   * @param {Object} event - The mouseover event object
   * @param {Object} d - The data point object
   */
  svg.on('click', (event) => {
    if (event.target.tagName === 'svg' || event.target.tagName === 'rect') {
      svg.selectAll('.connection-line').remove();
      svg.selectAll('circle')
        .classed('selected', false)
        .transition()
        .duration(400)
        .style('opacity', d => {
          if (searchTerm && !d.NAME.toLowerCase().includes(searchTerm.toLowerCase())) {
            return 0.3;
          }
          return 0.7;
        })
        .attr('r', 6)
        .style('stroke-width', 1);
      tooltip.style('visibility', 'hidden');
    }
  });

  // Append the data points
  const dots = plotArea.selectAll('circle')
    .data(validPlayers, d => d.NAME);

  // Update the existing points
  dots.exit()
    .transition()
    .duration(500)
    .attr('r', 0)
    .remove();

  // Enter the new points
  const dotsEnter = dots.enter()
    .append('circle')
    .attr('r', 0);

  // Merge the old and new points
  const allDots = dots.merge(dotsEnter)
    .attr('cx', d => x(d[config.x]))
    .attr('cy', d => y(d[config.y]))
    .style('fill', d => {
      if (searchTerm && !d.NAME.toLowerCase().includes(searchTerm.toLowerCase())) {
        return '#303030';
      }
      return getPlayerColor(d.POS);
    });

  // Transition the points
  allDots.transition()
    .duration(1000)
    .attr('r', 6)
    .style('opacity', d => {
      if (searchTerm && !d.NAME.toLowerCase().includes(searchTerm.toLowerCase())) {
        return 0.3;
      }
      return 0.7;
    });



  //================================================================================================
  // Event Handlers
  //================================================================================================

  /**
   * Event handler for mouseover events on the data points
   * @param {Object} event - The mouseover event object
   * @param {Object} d - The data point object
   */
  allDots.on('mouseover', function(event, d) {
      if (!isValidPlayerData(d, config)) return;
      const dot = d3.select(this);

      // Highlight the selected point
      dot.raise();
      dot.transition()
        .duration(200)
        .attr('r', 8)
        .style('opacity', 1)
        .style('stroke', '#fff')
        .style('stroke-width', 2);

      // Highlight similar players
      svg.selectAll('circle')
        .filter(pd => {
          if (!isValidPlayerData(pd, config)) return false;
          return pd !== d && (pd.TEAM === d.TEAM || pd.POS === d.POS);
        })
        .transition()
        .duration(200)
        .style('opacity', 0.5)
        .style('stroke', '#fff')
        .style('stroke-width', 1);

      // Show the tooltip
      tooltip.style('visibility', 'visible')
        .html(`
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px">${d.NAME}</div>
          <div style="font-size: 12px; margin-bottom: 8px">Team: ${d.TEAM} | Position: ${d.POS}</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px">
            <div><strong>${config.xLabel}:</strong> ${d[config.x]?.toFixed(1)}</div>
            <div><strong>${config.yLabel}:</strong> ${d[config.y]?.toFixed(1)}</div>
            <div><strong>Minutes/Game:</strong> ${d.MPG?.toFixed(1)}</div>
            <div><strong>Games Played:</strong> ${d.GP}</div>
          </div>
        `);
    })

    // Event handler for mousemove events on the data points
    .on('mousemove', (event) => {
      tooltip
        .style('top', `${event.pageY - 10}px`)
        .style('left', `${event.pageX + 10}px`);
    })

    // Event handler for mouseout events on the data points
    .on('mouseout', function(event, d) {
      if (!isValidPlayerData(d, config)) return;
      if (!d3.select(this).classed('selected')) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', 6)
          .style('opacity', d => {
            if (searchTerm && !d.NAME.toLowerCase().includes(searchTerm.toLowerCase())) {
              return 0.3;
            }
            return 0.7;
          })
          .style('stroke-width', 1);
        
        // Reset the opacity and stroke of similar players
        svg.selectAll('circle:not(.selected)')
          .transition()
          .duration(200)
          .style('opacity', d => {
            if (searchTerm && !d.NAME.toLowerCase().includes(searchTerm.toLowerCase())) {
              return 0.3;
            }
            return 0.7;
          })
          .style('stroke-width', 1);
      }
      // Hide the tooltip
      tooltip.style('visibility', 'hidden');
    })

    /**
     * Event handler for click events on the data points
     * @param {Object} event - The click event object
     * @param {Object} d - The data point object
     */
    allDots.on('click', function(event, d) {
      if (!isValidPlayerData(d, config)) return;
      event.stopPropagation();

      // Get the selected point
      const dot = d3.select(this);
      const wasSelected = dot.classed('selected');

      // Deselect all points
      svg.selectAll('circle')
        .classed('selected', false)
        .transition()
        .duration(200)
        .style('opacity', 0.15)  
        .attr('r', 4)  
        .style('stroke-width', 0);
      
      // Highlight the selected point and similar players
      if (!wasSelected) {
        const similarPlayers = svg.selectAll('circle')
          .filter(p => {
            if (!isValidPlayerData(p, config)) return false;
            const statDiff = Math.abs(p[config.y] - d[config.y]) / d[config.y];
            const positionMatch = p.POS === d.POS;
            const teamMatch = p.TEAM === d.TEAM;
            return (positionMatch || teamMatch) && statDiff < 0.2;
        });

      // Highlight the selected point and similar players
      similarPlayers
      .transition()
      .duration(400)
      .style('opacity', 1)
      .attr('r', 7)
      .style('stroke', '#fff')
      .style('stroke-width', 1.5);

    /**
     * Event handler for mouseover events on the data points
     * @param {Object} event - The mouseover event object
     * @param {Object} d - The data point object
     */
    const selectedPoint = [x(d[config.x]), y(d[config.y])];

    // Draw connection lines to similar players
    svg.selectAll('.connection-line').remove();
    similarPlayers.each(function(p) {
      if (p !== d) {  
        svg.append('line')
          .attr('class', 'connection-line')
          .style('stroke', '#ff6b6b')
          .style('stroke-width', 1)
          .style('stroke-dasharray', '3,3')
          .style('opacity', 0)
          .attr('x1', selectedPoint[0])
          .attr('y1', selectedPoint[1])
          .attr('x2', x(p[config.x]))
          .attr('y2', y(p[config.y]))
          .transition()
          .duration(400)
          .style('opacity', 0.3);
      }
    });

    // Highlight the selected point
    dot.classed('selected', true)
      .raise()  
      .transition()
      .duration(400)
      .style('opacity', 1)
      .attr('r', 9)
      .style('stroke', '#ff6b6b')
      .style('stroke-width', 2.5);

    // Show the tooltip
    const tooltipContent = `
      <div class="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
        <div class="font-bold text-lg mb-1">${d.NAME}</div>
        <div class="text-sm text-gray-600 mb-2">${d.TEAM} | ${d.POS}</div>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div><span class="font-medium">${config.xLabel}:</span> ${d[config.x]?.toFixed(1)}</div>
          <div><span class="font-medium">${config.yLabel}:</span> ${d[config.y]?.toFixed(1)}</div>
        </div>
        <div class="mt-2 text-xs text-gray-500">
          ${similarPlayers.size() - 1} similar players found
        </div>
      </div>
    `;
    tooltip.html(tooltipContent)
      .style('visibility', 'visible');
      
    } else {
      // Deselect the point
      svg.selectAll('.connection-line').remove();
      svg.selectAll('circle')
        .transition()
        .duration(400)
        .style('opacity', d => {
          if (searchTerm && !d.NAME.toLowerCase().includes(searchTerm.toLowerCase())) {
            return 0.3;
          }
          return 0.7;
        })
        .attr('r', 6)
        .style('stroke-width', 1);
      tooltip.style('visibility', 'hidden');
      }
    });

    // Append the regression line
    svg.append('line')
    .attr('class', 'trend-line')
    .style('stroke', '#ff6b6b') 
    .style('stroke-width', 3)   
    .style('stroke-dasharray', '8,4') 
    .style('opacity', 0.8)   
    .attr('x1', x(regressionPoints[0][0]))
    .attr('y1', y(regressionPoints[0][1]))
    .attr('x2', x(regressionPoints[1][0]))
    .attr('y2', y(regressionPoints[1][1]));
  }, [data, selectedMetric, selectedView, positionFilter, minMinutes, searchTerm, selectedPlayers]); 


  //================================================================================================
  // Bar Chart
  //================================================================================================
  useEffect(() => {
    // Check if data is available
    if (!data.length) return;
    d3.select(barRef.current).selectAll('*').remove();

    // Get the configuration for the selected view
    const getViewConfig = () => {
      switch(selectedView) {
        case 'scoring':
          return {
            primaryMetric: selectedMetric,
            secondaryMetric: 'USG%',
            title: 'Scoring Impact',
            yAxisLabel: selectedMetric
          };
        case 'efficiency':
          return {
            primaryMetric: selectedMetric,
            secondaryMetric: 'TS%',
            title: 'Shooting Efficiency',
            yAxisLabel: selectedMetric
          };
        case 'overview':
          return {
            primaryMetric: selectedMetric,
            secondaryMetric: 'MPG',
            title: 'Overall Impact',
            yAxisLabel: selectedMetric
          };
        default:
          return {
            primaryMetric: selectedMetric,
            secondaryMetric: 'USG%',
            title: 'Player Impact',
            yAxisLabel: selectedMetric
          };
      }
    };

    // Get the configuration for the chart
    const viewConfig = getViewConfig();

    // Get the full name of a metric
    const getFullMetricName = (metric) => {
      const metricNames = {
        'PPG': 'Points per Game',
        'RPG': 'Rebounds per Game',
        'APG': 'Assists per Game',
        'SPG': 'Steals per Game',
        'BPG': 'Blocks per Game',
        'TS%': 'True Shooting Percentage',
        'eFG%': 'Effective Field Goal Percentage',
        'USG%': 'Usage Rate',
        'VI': 'Versatility Index',
        'P+R': 'Points + Rebounds',
        'P+A': 'Points + Assists',
        'P+R+A': 'Points + Rebounds + Assists',
        'MPG': 'Minutes per Game'
      };
      return metricNames[metric] || metric;
    };

    // Filter the data based on the selected players, position, and minutes
    const filteredData = data
    .filter(player => {
      const matchesSearch = selectedPlayers.length === 0 || 
        selectedPlayers.includes(player.NAME);
      const matchesPosition = positionFilter === 'ALL' || 
        player.POS.includes(positionFilter);
      const matchesMinutes = player.MPG >= minMinutes;
      return matchesSearch && matchesPosition && matchesMinutes;
    });

    // Sort the data based on the primary metric
    const sortedData = selectedPlayers.length > 0
    ? filteredData
    .filter(player => selectedPlayers.includes(player.NAME))
    .sort((a, b) => b[viewConfig.primaryMetric] - a[viewConfig.primaryMetric])
    : filteredData
        .sort((a, b) => b[viewConfig.primaryMetric] - a[viewConfig.primaryMetric])
        .slice(0, 10);

        const container = d3.select(barRef.current);
        const containerWidth = container.node().getBoundingClientRect().width;
        const containerHeight = Math.min(containerWidth * 0.6, 500);
        
        // Calculate margins based on container dimensions
        const margin = {
            top: containerHeight * 0.1,     // 10% of height
            right: containerWidth * 0.05,   // 5% of width
            bottom: containerHeight * 0.35,  // 25% of height (more space for rotated labels)
            left: containerWidth * 0.1      // 10% of width
        };
        
        const width = containerWidth - margin.left - margin.right;
        const height = containerHeight - margin.top - margin.bottom;

    // Append the SVG element
    const svg = d3.select(barRef.current)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create the scales
    const x = d3.scaleBand()
      .range([0, width])
      .domain(sortedData.map(d => d.NAME))
      .padding(0.2);
    const y = d3.scaleLinear()
      .domain([0, d3.max(sortedData, d => d[viewConfig.primaryMetric])])
      .range([height, 0]);
    const y2 = d3.scaleLinear()
      .domain([0, d3.max(sortedData, d => d[viewConfig.secondaryMetric])])
      .range([height, 0]);

    // Append the axes and labels
    svg.append('text')
    .attr('x', width / 2)
    .attr('y', -25)
    .attr('text-anchor', 'middle')
    .style('font-size', '14px')
    .style('font-weight', 'bold')
    .text(`${viewConfig.title} - Top Players by ${viewConfig.yAxisLabel}`);

    svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x))
    .selectAll('text')  
    .attr('transform', 'rotate(-45)')  
    .style('text-anchor', 'end')  
    .attr('dx', '-0.8em')  
    .attr('dy', '0.15em');
    
    // Append the axis labels
    svg.append('text')
    .attr('x', width / 2)
    .attr('y', height + 70)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px')
    .text('Player Names');

    // Append the y-axis labels
    svg.append('g')
    .attr('class', 'y-axis')
    .call(d3.axisLeft(y))
    .append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -45)
    .attr('x', -height/2)
    .attr('text-anchor', 'middle')
    .style('font-size', '11px')
    .style('fill', '#666')
    .text(getFullMetricName(viewConfig.primaryMetric));

    // Append the secondary y-axis labels
    svg.append('g')
    .attr('class', 'y-axis-2')
    .attr('transform', `translate(${width}, 0)`)
    .call(d3.axisRight(y2))
    .append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', 45)
    .attr('x', -height/2)
    .attr('text-anchor', 'middle')
    .style('font-size', '11px')
    .style('fill', '#666')
    .text(getFullMetricName(viewConfig.secondaryMetric));

    
    // Append the bars
    const barGroups = svg.selectAll('.bar-group')
      .data(sortedData)
      .enter()
      .append('g')
      .attr('class', 'bar-group')
      .attr('transform', d => `translate(${x(d.NAME)},0)`);

      // Append the primary metric bars
      // For the bars, add transition
      barGroups.append('rect')
      .attr('width', x.bandwidth())
      .attr('y', height) // Start from bottom
      .attr('height', 0) // Start with height 0
      .attr('fill', d => getPlayerColor(d.POS))
      .style('opacity', 0.8)
      .transition() // Add transition
      .duration(1000) // Match scatter plot duration
      .attr('height', d => height - y(d[viewConfig.primaryMetric]))
      .attr('y', d => y(d[viewConfig.primaryMetric]));

      // Append the secondary metric line
      const line = d3.line()
        .x(d => x(d.NAME) + x.bandwidth()/2)
        .y(d => y2(d[viewConfig.secondaryMetric]));

      // Append the secondary metric line
      svg.append('path')
        .datum(sortedData)
        .attr('fill', 'none')
        .attr('stroke', '#ff6b6b')
        .attr('stroke-width', 2)
        .attr('d', line)
        .style('opacity', 0) // Start invisible
        .transition() // Add transition
        .duration(1000) // Match scatter plot duration
        .style('opacity', 1); // Fade in

      // Append the secondary metric legend
      svg.append('g')
      .attr('class', 'secondary-metric-legend')
      .attr('transform', `translate(${width - 150}, 10)`)  
      .call(g => {
        g.append('line')
          .attr('x1', 0)
          .attr('x2', 20)
          .attr('y1', 0)
          .attr('y2', 0)
          .style('stroke', '#ff6b6b')
          .style('stroke-width', 2);
        g.append('text')
          .attr('x', 25)
          .attr('y', 4)
          .style('font-size', '11px')
          .style('fill', '#666')
          .text(`${getFullMetricName(viewConfig.secondaryMetric)}`);
      });

    // Append the tooltip  
    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('pointer-events', 'none')
      .style('background', 'white')
      .style('padding', '10px')
      .style('border', '1px solid #ddd')
      .style('border-radius', '4px')
      .style('z-index', '10');

      // Event handlers for the bars
      barGroups
      .on('mouseover', function(event, d) {
        tooltip.style('visibility', 'visible')
          .html(`
            <div style="font-weight: bold">${d.NAME}</div>
            <div>${d.TEAM} | ${d.POS}</div>
            <div style="margin-top: 2px">${getFullMetricName(viewConfig.primaryMetric)}: ${d[viewConfig.primaryMetric]?.toFixed(1)}</div>
            <div style="margin-top: 2px">Minutes per Game: ${d.MPG?.toFixed(1)}</div>
          `);
        d3.select(this).selectAll('rect')
          .style('opacity', 1)
          .style('stroke', '#000')
          .style('stroke-width', 1);
      })

      // Event handlers for the bars
      .on('mousemove', (event) => {
        tooltip
          .style('top', (event.pageY - 10) + 'px')
          .style('left', (event.pageX + 10) + 'px');
      })
      .on('mouseout', function() {
        tooltip.style('visibility', 'hidden');
        d3.select(this).selectAll('rect')
          .style('opacity', 0.8)
          .style('stroke', 'none');
      });

    // Append the mean lines
    const primaryMean = d3.mean(filteredData, d => d[viewConfig.primaryMetric]);
    const secondaryMean = d3.mean(filteredData, d => d[viewConfig.secondaryMetric]);
    
    svg.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', y(primaryMean))
      .attr('y2', y(primaryMean))
      .style('stroke', '#666')
      .style('stroke-dasharray', '4,4')
      .style('opacity', 0) // Start invisible
      .transition() // Add transition
      .duration(1000)
      .style('opacity', 0.5);

    svg.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', y2(secondaryMean))
      .attr('y2', y2(secondaryMean))
      .style('stroke', '#ff6b6b')
      .style('stroke-dasharray', '4,4')
      .style('opacity', 0) // Start invisible
      .transition() // Add transition
      .duration(1000)
      .style('opacity', 0.5);

    // Append the mean labels
    svg.append('text')
    .attr('x', width - 5)
    .attr('y', y(primaryMean) - 5)
    .attr('text-anchor', 'end')
    .style('font-size', '10px')
    .style('fill', '#666')
    .text(`League Average ${viewConfig.yAxisLabel}: ${primaryMean.toFixed(1)}`);
    
    svg.append('text')
    .attr('x', width - 5)
    .attr('y', y2(secondaryMean) - 5)
    .attr('text-anchor', 'end')
    .style('font-size', '10px')
    .style('fill', '#666')
    .text(`League Average ${viewConfig.secondaryAxisLabel}: ${secondaryMean.toFixed(1)}`);

  }, [data, selectedMetric, selectedView, positionFilter, minMinutes, searchTerm, selectedPlayers]);

  // Define the default metric and view
  const metrics = [
    { value: 'PPG', label: 'Points per Game' },
    { value: 'TS%', label: 'True Shooting %' },
    { value: 'USG%', label: 'Usage Rate' },
    { value: 'P+R+A', label: 'Points + Rebounds + Assists' },
    { value: 'P+A', label: 'Points + Assists' },
    { value: 'APG', label: 'Assists per Game' },
    { value: 'eFG%', label: 'Effective Field Goal %' },
    { value: 'VI', label: 'Versatility Index' },
    { value: 'RPG', label: 'Rebounds per Game' },
    { value: 'SPG', label: 'Steals per Game' },
    { value: 'BPG', label: 'Blocks per Game' }
  ];
  
  const views = [
    { 
      value: 'scoring', 
      label: 'Scoring & Creation',
    },
    { 
      value: 'efficiency', 
      label: 'Shooting Efficiency',
    },
    { 
      value: 'overview', 
      label: 'Playing Time Impact',
    },
  ];
  
  
    // Define the default metric and view
    const filteredPlayers = data
      // Filter by selected players
      .filter(player => {
        const matchesSearch = selectedPlayers.length === 0 || 
          selectedPlayers.includes(player.NAME);
        const matchesPosition = positionFilter === 'ALL' || 
          player.POS.includes(positionFilter);
        const matchesMinutes = player.MPG >= minMinutes;
        
        // Return the player if all filters match
        return matchesSearch && matchesPosition && matchesMinutes;
    })
    // Sort the data based on the selected metric
    .sort((a, b) => b[selectedMetric] - a[selectedMetric]);

  // Get the top 10 players

  //================================================================================================
  // Dashboard
  //================================================================================================
  return (

    /**
     * Dashboard Container
     * @description The main container for the player dashboard
     * @returns {JSX.Element} The dashboard container

     */
    <div className="dashboard-container p-4 min-h-screen">
      <Card className="relative backdrop-blur-md shadow-xl w-[94vw] max-w-[1900px] mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">NBA Player Performance 2024-2025</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
      <div className="space-y-4 mb-4">
        <div className="flex gap-4">
        <div className="relative flex-1">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-white-500" />
      <div className="flex flex-wrap gap-2 w-full pl-8 pr-4 py-2 border rounded-md min-h-[42px] bg-white">
        {selectedPlayers.map((player) => (
          <div 
            key={player}
            className="flex items-center gap-1 bg-blue-100 px-2 py-1 rounded-md"
          >
            <span>{player}</span>
            <button
              onClick={() => setSelectedPlayers(prev => prev.filter(p => p !== player))}
              className="text-blue-500 hover:text-blue-700"
            >
              ×
            </button>
          </div>
        ))}
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setSearchResults(getSearchSuggestions(e.target.value));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchTerm && searchResults.length > 0) {
              setSelectedPlayers(prev => [...prev, searchResults[0]]);
              setSearchTerm('');
              setSearchResults([]);
            }
          }}
          placeholder={selectedPlayers.length === 0 ? "Search players..." : ""}
          className="flex-1 outline-none min-w-[120px] bg-transparent"
        />
      </div>
  {searchResults.length > 0 && (
    <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg">
      {searchResults.map((player) => (
        <div
          key={player}
          className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
          onClick={() => {
            setSelectedPlayers(prev => [...prev, player]);
            setSearchTerm('');
            setSearchResults([]);
          }}
        >
          {player}
        </div>
      ))}
    </div>
  )}
</div>
<button
  onClick={() => {
    setSearchTerm('');
    setSelectedPlayers([]);
    setSearchResults([]); 
    setPositionFilter('ALL');
    setMinMinutes(0);
    setSelectedMetric(DEFAULT_METRIC);
    setSelectedView(DEFAULT_VIEW);
    setActiveFilters({
      position: false,
      minutes: false,
      search: false,
      metric: false,
      view: false
    });
  }}
  className={`px-4 py-2 rounded-md transition-all ${
    Object.values(activeFilters).some(v => v) || selectedPlayers.length > 0
      ? 'bg-red-500 text-white hover:bg-red-600'
      : 'bg-gray-200 text-gray-500'
  }`}
>
  Reset Filters
</button>
  </div>
  <div className="flex flex-wrap gap-4">
    <select
      className={`p-2 border rounded-md ${
        selectedMetric !== DEFAULT_METRIC ? 'border-yellow-500 bg-yellow-50' : ''
      }`}
      onChange={(e) => {
        setSelectedMetric(e.target.value);
        setActiveFilters(prev => ({...prev, metric: e.target.value !== DEFAULT_METRIC}));
      }}
      value={selectedMetric}
    >
      {metrics.map(metric => (
        <option key={metric.value} value={metric.value}>{metric.label}</option>
      ))}
    </select>
    <select
      className={`p-2 border rounded-md ${
        selectedView !== DEFAULT_VIEW ? 'border-orange-500 bg-orange-50' : ''
      }`}
      onChange={(e) => {
        setSelectedView(e.target.value);
        setActiveFilters(prev => ({...prev, view: e.target.value !== DEFAULT_VIEW}));
      }}
      value={selectedView}
    >
      {views.map(view => (
        <option key={view.value} value={view.value}>{view.label}</option>
      ))}
    </select>
    <select
      className={`p-2 border rounded-md ${
        positionFilter !== 'ALL' ? 'border-green-500 bg-green-50' : ''
      }`}
      onChange={(e) => {
        setPositionFilter(e.target.value);
        setActiveFilters(prev => ({...prev, position: e.target.value !== 'ALL'}));
      }}
      value={positionFilter}
    >
      <option value="ALL">All Positions</option>
      <option value="G">Guards</option>
      <option value="F">Forwards</option>
      <option value="C">Centers</option>
    </select>
    <div className="flex items-center gap-2">
      <label>Min MPG:</label>
      <input
        type="number"
        min="0"
        max="48"
        value={minMinutes}
        onChange={(e) => {
          setMinMinutes(Number(e.target.value));
          setActiveFilters(prev => ({...prev, minutes: Number(e.target.value) > 0}));
        }}
        className={`p-2 border rounded-md w-20 ${
          minMinutes > 0 ? 'border-purple-500 bg-purple-50' : ''
        }`}
      />
    </div>
  <div className="h-6 w-px bg-gray-200"></div>
    <div className="flex items-center gap-4">
    {Object.entries({ 'G': 'Guards', 'F': 'Forwards', 'C': 'Centers' }).map(([pos, label]) => (
      <div key={pos} className="flex items-center gap-2">
        <div 
          className="w-3 h-3 rounded-full" 
          style={{ backgroundColor: positionColors[pos] }}
        />
        <span className="text-sm text-gray-600">{label}</span>
      </div>
    ))}
  </div>
  </div>
  {Object.values(activeFilters).filter(v => v).length > 0 && (
    <div className="flex items-center text-sm text-gray-600 gap-2">
      <span>Active filters:</span>
      {activeFilters.position && (
        <span className="px-2 py-1 bg-green-100 rounded">Position</span>
      )}
      {activeFilters.minutes && (
        <span className="px-2 py-1 bg-purple-100 rounded">Minutes</span>
      )}
      {activeFilters.search && (
        <span className="px-2 py-1 bg-blue-100 rounded">Search</span>
      )}
      {activeFilters.metric && (
        <span className="px-2 py-1 bg-blue-100 rounded">View</span>
      )}
      {activeFilters.view && (
        <span className="px-2 py-1 bg-orange-100 rounded">Metric</span>
      )}
    </div>
  )}
</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
            <Card className="p-4 w-full h-[450px] overflow-hidden">
              <div ref={scatterRef} className="w-full h-full"></div>
            </Card>
            <Card className="p-4 w-full h-[450px] overflow-hidden">
              <div ref={barRef} className="w-full h-full"></div>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
export default PlayerDashboard;