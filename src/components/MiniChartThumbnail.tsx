import React from 'react';

interface MiniChartThumbnailProps {
  symbol: string;
  changePct: number;
  width?: number;
  height?: number;
}

export const MiniChartThumbnail: React.FC<MiniChartThumbnailProps> = ({
  symbol,
  changePct,
  width = 90,
  height = 28
}) => {
  // Generate deterministic sparkline points based on symbol hash & changePct
  const isPositive = changePct >= 0;
  const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  const pointsCount = 10;
  const points: number[] = [];
  let val = 50;

  for (let i = 0; i < pointsCount; i++) {
    const jitter = Math.sin((hash + i * 3) * 0.8) * 15;
    const trend = (i / pointsCount) * (changePct * 2.5);
    val = Math.max(10, Math.min(90, 50 + jitter + trend));
    points.push(val);
  }

  // Force last point to match direction
  points[points.length - 1] = isPositive ? 80 : 20;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = (i / (pointsCount - 1)) * (width - 4) + 2;
    const y = height - 4 - ((p - min) / range) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const strokeColor = isPositive ? '#10B981' : '#EF4444';
  const fillColor = isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';

  // Closed path for area under curve
  const areaPath = `M 2,${height - 2} L ${coords} L ${width - 2},${height - 2} Z`;

  return (
    <div className="inline-flex items-center gap-1.5" title={`${symbol} 10-day price trajectory (${changePct > 0 ? '+' : ''}${changePct}%)`}>
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#grad-${symbol})`} />
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={coords}
        />
        {/* End tick pulse */}
        <circle
          cx={width - 2}
          cy={height - 4 - ((points[points.length - 1] - min) / range) * (height - 8)}
          r="2.5"
          fill={strokeColor}
        />
      </svg>
    </div>
  );
};
