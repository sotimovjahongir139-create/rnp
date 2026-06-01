export const ROLES = { ADMIN: 'admin', MANAGER: 'manager' };

export const KPI_THRESHOLDS = {
  missedCallWarning:  10,
  missedCallCritical: 20,
  efficiencyWarning:  70,
  efficiencyCritical: 50,
  cycleWarning:       3,
  cycleCritical:      5,
};

export const DEPARTMENTS = ['Quyish PU', 'Sifat nazorati', 'Lazer', 'Chaxlash', 'Sklad', 'Quyish TEP'];

// Normalize source `production_jarayon` names -> dashboard department labels.
export const WORKSHOP_LABELS = {
  'Sifat Nazorati': 'Sifat nazorati',
  'Sklad (Kirim)':  'Sklad',
};
export const normalizeWorkshop = (name) => WORKSHOP_LABELS[name] || name;
