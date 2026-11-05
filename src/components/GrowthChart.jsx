// Growth chart: CDC percentile bands overlaid with the child's measurements.
//
// The CDC 2000 stature-for-age curves give us reference percentiles at every
// age from 2 to 20. We plot them as semi-transparent bands (3-10, 10-25,
// 25-75 = "normal" range, 75-90, 90-97) so the child's line pops against a
// familiar growth chart background.
//
// When a prediction is available, the projected path from the latest
// measurement to age 20 is drawn as a dashed line inside a shaded band that
// widens out to the 95% range at adulthood (see projectionPath in
// lib/predict.js).

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

export default function GrowthChart({ child, heights, projection = null }) {
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
      .sort((a, b) => new Date(a.measurementDate) - new Date(b.measurementDate))
      .map((h) => ({
        x: ageInMonths(child.birthDate, h.measurementDate) / 12,
        y: cmToIn(h.heightCm),
      }));

    const proj = projection && projection.length ? projection : null;
    const projXY = (key) => proj.map((r) => ({ x: r.ageYears, y: cmToIn(r[key]) }));
    const projectionSets = proj ? [
      {
        label: 'Projected range',
        data: projXY('lowCm'),
        borderColor: 'rgba(220, 38, 38, 0.25)',
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        tension: 0.3,
      },
      {
        label: 'Projected range (high)',
        data: projXY('highCm'),
        borderColor: 'rgba(220, 38, 38, 0.25)',
        backgroundColor: 'rgba(220, 38, 38, 0.10)',
        borderWidth: 1,
        pointRadius: 0,
        fill: '-1',
        tension: 0.3,
      },
      {
        label: 'Projected path',
        data: projXY('midCm'),
        borderColor: '#dc2626',
        borderWidth: 2,
        borderDash: [5, 4],
        pointRadius: (ctx) => (ctx.dataIndex === proj.length - 1 ? 4 : 0),
        pointBackgroundColor: '#fff',
        fill: false,
        tension: 0.3,
      },
    ] : [];

    return {
      datasets: [
        ...projectionSets,
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
  }, [child, heights, curves, projection]);

  const minAge = useMemo(() => {
    const youngest = Math.min(...heights.map((h) => ageInMonths(child.birthDate, h.measurementDate) / 12));
    return Number.isFinite(youngest) && youngest < 2 ? 0 : 2;
  }, [child.birthDate, heights]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          // Only the named series and the median line in the legend. The
          // bands are self-explanatory once rendered.
          filter: (item) => item.text === child.name || item.text === '50th pct'
            || item.text === 'Projected path' || item.text === 'Projected range',
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
        // Infant readings (under 2) sit left of the CDC bands, which start at
        // age 2. Show them rather than silently cropping them off.
        min: minAge,
        max: 20,
        ticks: { stepSize: 2 },
      },
      y: {
        type: 'linear',
        title: { display: true, text: 'Height (inches)' },
        min: minAge < 2 ? 15 : 30,
        max: 80,
      },
    },
  }), [child.name, minAge]);

  if (!heights.length) {
    return (
      <div className="text-slate-500 text-sm py-8 text-center">
        Add a measurement below to see {child.name}&rsquo;s growth plotted on the CDC chart.
      </div>
    );
  }

  return (
    <div style={{ height: 420 }}>
      <Line data={data} options={options} />
    </div>
  );
}
