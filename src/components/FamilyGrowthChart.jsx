// Every child on one growth chart.
//
// CDC bands are drawn only when all children share a sex, because the boys'
// and girls' reference curves differ and mixing them would mislead.

import React, { useMemo } from 'react';
import {
  Chart as ChartJS, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { cdcPercentileCurves } from '../predictions/index.js';
import { ageInMonths, cmToIn } from '../lib/units.js';
import { sortByDate } from '../lib/predict.js';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const KID_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2'];

export default function FamilyGrowthChart({ kids }) {
  const sharedSex = kids.length && kids.every((k) => k.sex === kids[0].sex) ? kids[0].sex : null;

  const data = useMemo(() => {
    const bands = [];
    if (sharedSex) {
      const curves = cdcPercentileCurves(sharedSex, { startMonths: 24, endMonths: 240, stepMonths: 6 });
      const xy = (key) => curves.map((r) => ({ x: r.ageMonths / 12, y: cmToIn(r[key]) }));
      bands.push(
        { label: '3rd pct', data: xy('p3'), borderColor: 'rgba(100,116,139,0.3)', borderWidth: 1, pointRadius: 0, fill: false, tension: 0.3 },
        { label: '97th pct', data: xy('p97'), borderColor: 'rgba(100,116,139,0.3)', backgroundColor: 'rgba(100,116,139,0.07)', borderWidth: 1, pointRadius: 0, fill: '-1', tension: 0.3 },
        { label: '50th pct', data: xy('p50'), borderColor: 'rgba(100,116,139,0.6)', borderWidth: 1, borderDash: [6, 4], pointRadius: 0, fill: false, tension: 0.3 },
      );
    }
    const lines = kids.map((k, i) => ({
      label: k.name,
      data: sortByDate(k.heights).map((h) => ({
        x: ageInMonths(k.birthDate, h.measurementDate) / 12,
        y: cmToIn(h.heightCm),
      })),
      borderColor: KID_COLORS[i % KID_COLORS.length],
      backgroundColor: KID_COLORS[i % KID_COLORS.length],
      borderWidth: 2,
      pointRadius: 2.5,
      fill: false,
    }));
    return { datasets: [...bands, ...lines] };
  }, [kids, sharedSex]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { filter: (item) => !/pct$/.test(item.text) || item.text === '50th pct' } },
      tooltip: {
        callbacks: {
          title: (items) => (items.length ? `Age ${items[0].parsed.x.toFixed(1)} years` : ''),
          label: (item) => {
            const inches = item.parsed.y;
            const ft = Math.floor(inches / 12);
            return `${item.dataset.label}: ${ft}'${(inches - ft * 12).toFixed(1)}"`;
          },
        },
      },
    },
    scales: {
      x: { type: 'linear', min: 0, max: 20, ticks: { stepSize: 2 }, title: { display: true, text: 'Age (years)' } },
      y: { type: 'linear', min: 15, max: 80, title: { display: true, text: 'Height (inches)' } },
    },
  }), []);

  if (!kids.some((k) => k.heights.length)) return null;
  return (
    <div style={{ height: 360 }}>
      <Line data={data} options={options} />
    </div>
  );
}
