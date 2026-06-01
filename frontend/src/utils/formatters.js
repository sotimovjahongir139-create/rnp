export const fmt = (n) => Math.round(n).toLocaleString('en-US');

export const cycleColor = (v) => {
  if (v === 0) return '#B4C8BE';
  if (v <= 2)  return '#287D4F';
  if (v <= 3)  return '#C48000';
  return '#C03434';
};

export const effColor = (e) => {
  if (e >= 90) return '#287D4F';
  if (e >= 50) return '#C48000';
  return '#C03434';
};

export const holatBadge = (h) => {
  if (h === 'Yaxshi')      return 'ok';
  if (h === 'Kritik')      return 'kr';
  return 'na';
};
