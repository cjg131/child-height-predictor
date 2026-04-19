import React from 'react';
import { formatHeight, kgToLb, cmToIn, ageInYears } from '../lib/units.js';
import { cdcStatureZ, zToPercentile } from '../predictions/cdcPercentile.js';

export default function HeightTable({ heights, child, onDelete }) {
  if (!heights.length) return <p className="text-slate-600">No measurements yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-slate-600 border-b border-slate-200">
        <tr>
          <th className="py-2">Date</th>
          <th>Age</th>
          <th>Height</th>
          <th>%ile</th>
          <th>Weight</th>
          <th>Note</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {heights.slice().reverse().map((h) => {
          const age = ageInYears(child.birthDate, h.measurementDate);
          const z = cdcStatureZ({
            sex: child.sex,
            birthDate: child.birthDate,
            measurementDate: h.measurementDate,
            heightCm: h.heightCm,
          });
          return (
            <tr key={h.id} className="border-b border-slate-100">
              <td className="py-2">{h.measurementDate}</td>
              <td>{age.toFixed(1)}</td>
              <td>{formatHeight(h.heightCm)}</td>
              <td>{zToPercentile(z.z).toFixed(0)}</td>
              <td>{h.weightKg ? `${kgToLb(h.weightKg).toFixed(1)} lb` : '-'}</td>
              <td className="text-slate-600">{h.note || ''}</td>
              <td>
                <button onClick={() => onDelete(h.id)}
                  className="text-red-600 hover:text-red-700 text-xs">
                  delete
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
