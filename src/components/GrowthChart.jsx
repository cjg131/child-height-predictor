// Growth chart: CDC percentile bands overlaid with the child's measurements.
//
// The CDC 2000 stature-for-age curves give us reference percentiles at every
// age from 2 to 20. We plot them as semi-transparent bands (3-10, 10-25,
// 25-75 = "normal" range, 75-90, 90-97) so the child's line pops against a
// familiar growth chart background.

import React, { useMemo } from 'react';
import {
  Chart as ChartJS, LinearScale, PointElement, LineElement, Tooltip, Legend,
  Title, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { cdcPercentileCurves } from '../predictions/index.js';
import { ageInMonths, cmToIn } from '../lib/units.js';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend, Title, Filler);

const BAND_COLOR = 'rgba(14, 165, 233, 0.10)';
const LINE_COLOR = 'rgba(14, 165, 233, 0.35)';
const MEDIAN_COLOR = 'rgba(14, 165, 233, 0.75)';

export default function GrowthChart({ child, heights }) {
  const curves = useMemo(
    () => cdcPercentileCurves(child.sex, { startMonths: 24, endMonths: 240, stepMonths: 6 }),
    [child.sex],
  );

  const data = useMemo(() => {
    const xy = (key) => curves.map((r) => ({ x: r.ageMonths / 12, y: cmToIn(r[key]) }));
    const band = (key, fill) => ({
      label: `${key.replace('p', '')}th pct`,
      data: xy(key),
      borderColor: LINE_COLOR,
      borderWidth: 1,
      backgroundColor: BAND_COLOR,
      fill,
      pointRadius: 0,
      tension: 0.3,
    });

    const childData = heights
      .slice()
      .sort((a, b) => a.measurementDate.localeCompare(b.measurementDate))
      .map((h) => ({
        x: ageInMonths(child.birthDate, h.measurementDate) / 12,
        y: cmToIn(h.heightCm),
      }));

    return {
      datasets: [
        band('p3', false),
        band('p10', '-1'),
        band('p25', '-1'),
        {
          label: '50th pct',
          data: xy('p50'),
          borderColor: MEDIAN_COLOR,
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          tension: 0.3,
          fill: false,
        },
        band('p75', false),
        band('p90', '-1'),
        band('p97', '-1'),
        {
          label: child.name,
          data: childData,
          borderColor: '#dc2626',
          backgroundColor: '#dc2626',
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false,
          tension: 0,
          showLine: true,
        },
      ],
    };
  }, [child, heights, curves]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          // Only the named series and the median line in the legend. The
          // bands are self-explanatory once rendered.
          filter: (item) => item.text === child.name || item.text === '50th pct',
        },
      },
      tooltip: {
        callbacks: {
          title: (items) => items.length
            ? `Age ${items[0].parsed.x.toFixed(1)} years`
            : '',
          label: (item) => {
            const inches = item.parsed.y;
            const ft = Math.floor(inches / 12);
            const rem = inches - ft * 12;
            return `${item.dataset.label}: ${ft}'${rem.toFixed(1)}" (${inches.toFixed(1)} in)`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        title: { display: true, text: 'Age (years)' },
        min: 2,
        max: 20,
        ticks: { stepSize: 2 },
      },
      y: {
        type: 'linear',
        title: { display: true, text: 'Height (inches)' },
        min: 30,
        max: 80,
      },
    },
  }), [child.name]);

  if (!heights.length) {
    return (
      <div className="text-slate-500 text-sm py-8 text-center">
        Add a measurement below to see {child.name}'s growth plotted on the CDC chart.
      </div>
    );
  }

  return (
    <div style={{ height: 420 }}>
      <Line data={data} options={options} />
    </div>
  );
}
