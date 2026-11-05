// How the adult-height prediction has moved over time.
//
// Each point is what the app would have predicted right after that
// measurement, using only the data available then (predictionHistory in
// lib/predict.js). A shrinking band means the estimate is firming up; a line
// that jumps usually points at a measurement worth double-checking.

import React, { useMemo } from 'react';
import {
  Chart as ChartJS, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { cmToIn, formatFeetInches } from '../lib/units.js';
import { predictionHistory } from '../lib/predict.js';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const ftIn = (inches) => {
  const ft = Math.floor(inches / 12);
  return `${ft}'${(inches - ft * 12).toFixed(1)}"`;
};

export default function PredictionHistoryChart({ child, heights }) {
  const history = useMemo(() => predictionHistory(child, heights), [child, heights]);

  const data = useMemo(() => {
    const xy = (key) => history.map((p) => ({ x: p.ageYears, y: cmToIn(p[key]) }));
    return {
      datasets: [
        {
          label: '95% low',
          data: xy('lowCm'),
          borderColor: 'rgba(14, 165, 233, 0.3)',
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
        },
        {
          label: '95% range',
          data: xy('highCm'),
          borderColor: 'rgba(14, 165, 233, 0.3)',
          backgroundColor: 'rgba(14, 165, 233, 0.12)',
          borderWidth: 1,
          pointRadius: 0,
          fill: '-1',
        },
        {
          label: 'Predicted adult height',
          data: xy('predictedCm'),
          borderColor: '#0369a1',
          backgroundColor: '#0369a1',
          borderWidth: 2,
          pointRadius: 3,
          fill: false,
        },
      ],
    };
  }, [history]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { filter: (item) => item.text !== '95% low' } },
      tooltip: {
        callbacks: {
          title: (items) => {
            const p = history[items[0]?.dataIndex];
            return p ? `${p.measurementDate} (age ${p.ageYears.toFixed(1)})` : '';
          },
          label: (item) => `${item.dataset.label}: ${ftIn(item.parsed.y)}`,
        },
      },
    },
    scales: {
      x: { type: 'linear', title: { display: true, text: 'Age when measured (years)' } },
      y: { type: 'linear', title: { display: true, text: 'Predicted adult height (inches)' } },
    },
  }), [history]);

  if (history.length < 2) {
    return (
      <p className="text-sm text-slate-500">
        Shows up once there are two or more measurements from age 2 on.
      </p>
    );
  }

  const first = history[0];
  const last = history[history.length - 1];
  const firstWidth = cmToIn(first.highCm - first.lowCm);
  const lastWidth = cmToIn(last.highCm - last.lowCm);

  return (
    <div>
      <p className="text-sm text-slate-600 mb-2">
        At age {first.ageYears.toFixed(1)} the app would have said {formatFeetInches(first.predictedCm)},
        give or take {(firstWidth / 2).toFixed(1)} in. Today it says {formatFeetInches(last.predictedCm)},
        give or take {(lastWidth / 2).toFixed(1)} in.
      </p>
      <div style={{ height: 280 }}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
