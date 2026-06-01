// ─── ISHLAB CHIQARISH ────────────────────────────────────────
export const DEPT = [
  { name: 'Quyish PU',      st: 'Normal', jami: 43510, baj: 43410, qol: 100,  pct: 99.77, cards: 142 },
  { name: 'Sifat nazorati', st: 'Normal', jami: 24652, baj: 23961, qol: 691,  pct: 97.2,  cards: 162 },
  { name: 'Lazer',          st: 'Kritik', jami: 5680,  baj: 3350,  qol: 2330, pct: 58.98, cards: 32  },
  { name: 'Chaxlash',       st: 'Kritik', jami: 2150,  baj: 1395,  qol: 755,  pct: 64.88, cards: 23  },
  { name: 'Sklad',          st: 'Normal', jami: 21502, baj: 20926, qol: 576,  pct: 97.32, cards: 140 },
  { name: 'Quyish TEP',     st: 'Normal', jami: 5342,  baj: 5242,  qol: 100,  pct: 98.13, cards: 26  },
];

export const PRODUCTION_KPI = {
  jamiZakaz:      78886,
  jamiKartochka:  525,
  bajarildi:      73973,
  qoldi:          4913,
  bajarildiPct:   93.8,
  qoldiPct:       6.2,
};

export const WEEKLY = [
  { name: 'Quyish PU',      k: 12, b: 18, eff: 150, holat: 'Yaxshi',      sikl: '2.3 kun', mm: '0/16' },
  { name: 'Sifat nazorati', k: 22, b: 20, eff: 91,  holat: 'Yaxshi',      sikl: '1.7 kun', mm: '0/13' },
  { name: 'Lazer',          k: 5,  b: 0,  eff: 0,   holat: 'Kritik',      sikl: '—',       mm: '—'    },
  { name: 'Chaxlash',       k: 0,  b: 0,  eff: 0,   holat: 'Malumot yoq', sikl: '—',       mm: '—'    },
  { name: 'Sklad',          k: 20, b: 8,  eff: 40,  holat: 'Kritik',      sikl: '3.4 kun', mm: '2/6'  },
  { name: 'Quyish TEP',     k: 11, b: 7,  eff: 98,  holat: 'Yaxshi',      sikl: '2.9 kun', mm: '0/8'  },
];

export const CYCLE = [
  { name: 'Quyish PU',     v: 2.3 },
  { name: 'Sifat n.',      v: 1.7 },
  { name: 'Lazer',         v: 0   },
  { name: 'Chaxlash',      v: 0   },
  { name: 'Sklad',         v: 3.4 },
  { name: 'Quyish TEP',    v: 2.9 },
];

export const SKU = [
  { dept: 'Quyish PU',      models: ['ma', 'mb', 'mc'] },
  { dept: 'Sifat nazorati', models: ['ma', 'mb', 'mc', 'md'] },
  { dept: 'Lazer',          models: ['mb', 'md'] },
  { dept: 'Chaxlash',       models: ['ma', 'mc'] },
  { dept: 'Sklad',          models: ['mall'] },
  { dept: 'Quyish TEP',     models: ['ma', 'mb'] },
];

export const MODEL_LABELS = {
  ma:   { label: 'Model A', cls: 'ma' },
  mb:   { label: 'Model B', cls: 'mb' },
  mc:   { label: 'Model C', cls: 'mc' },
  md:   { label: 'Model D', cls: 'md' },
  mall: { label: 'Barchasi', cls: 'mall' },
};

export const TENDENCY = {
  months: ['Dek 2025', 'Yan 2026', 'Fev 2026', 'Mar 2026', 'Apr 2026', 'May 2026'],
  values: [0, 0, 0, 0, 2, 93.8],
  badges: [
    { from: 'Fev → Mar', val: '0%',     type: 'neutral' },
    { from: 'Mar → Apr', val: '+2%',    type: 'amber'   },
    { from: 'Apr → May', val: '+100%',  type: 'green'   },
  ],
};

// ─── SIFAT NAZORATI (QC) ─────────────────────────────────────
export const QC_KPI = {
  bugunNuqson:   0,
  oyNuqson:      0,
  topModel:      'Padosh - Brunelli cucunelli - oq',
  topModelCount: 271,
  topSabab:      'Charxlaganda havo chiqib qolgan',
  topSababCount: 119,
};

export const QC_TREND = {
  months: ['Yan 2026', 'Fev 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Iyn 2026'],
  values: [0, 0, 0, 0, 443, 0],
  badges: [
    { from: 'Apr → May', val: '+100%',   type: 'green'   },
    { from: 'May → Iyn', val: '-100.0%', type: 'neutral' },
  ],
};

export const QC_TOP_MODELS = [
  { lbl: "Padosh - Brunelli - oq",   v: 271, c: '#3B6FD4' },
  { lbl: "Stilka - 6668 - ko'k",     v: 134, c: '#34C377' },
  { lbl: "Padosh - Brunelli - ko'k", v: 19,  c: '#E05050' },
  { lbl: "Padosh - 9092 - ko'k",     v: 18,  c: '#C48000' },
  { lbl: "Padosh - 9092 - qora",     v: 11,  c: '#7B5EA7' },
];

export const QC_SABABLARI = [
  { lbl: 'Randida havo qolib ketgan',       v: 35,  c: '#3B6FD4' },
  { lbl: "Dog' bo'lib qolgan",              v: 42,  c: '#E05050' },
  { lbl: 'Qolip ushlab ketgan',             v: 120, c: '#34C377' },
  { lbl: 'Dav qolib ketgan',                v: 8,   c: '#C48000' },
  { lbl: 'Parda tushgan',                   v: 3,   c: '#7B5EA7' },
  { lbl: 'Randi kesib ketgan',              v: 5,   c: '#287D4F' },
  { lbl: 'Qolostagi kamchiliklar',          v: 6,   c: '#B5741A' },
  { lbl: 'Charxlaganda havo chiqib qolgan', v: 119, c: '#C48000' },
  { lbl: "Chanolab qo'ygan",               v: 2,   c: '#8CA496' },
];

export const QC_TOP10 = [
  { rank: 1, model: "Padosh - Brunelli cucunelli - oq",   v: 271 },
  { rank: 2, model: "Stilka - 6668 - ko'k",               v: 134 },
  { rank: 3, model: "Padosh - Brunelli cucunelli - ko'k", v: 19  },
  { rank: 4, model: "Padosh - 9092 - ko'k",               v: 18  },
  { rank: 5, model: "Padosh - 9092 - qora",               v: 11  },
  { rank: 6, model: "Padosh - 1603-siliq - oq",           v: 5   },
  { rank: 7, model: "Padosh - 23338 - ko'k",              v: 3   },
];

// ─── CRM — QONGIROQLAR ────────────────────────────────────────
export const CRM_OYLIK = {
  jami:           598,
  kiruvchi:       359,
  chiquvchi:      193,
  otkazib:        46,
  qaytaChiqilgan: 36,
  qaytaChiqilmagan: 10,
  otkazibPct:     '7.7%',
  missedStats: {
    qaytaChiqilgan:   36,
    qaytaChiqilmagan: 10,
    qaytaAloqaDaq:    '3,702.8',
  },
  bars: [
    { lbl: 'Javob berish',     pct: 92, cls: 'g' },
    { lbl: 'Qayta chiqish',    pct: 78, cls: 'a' },
    { lbl: 'Qayta chiqilmagan', pct: 22, cls: 'r' },
  ],
};

export const CRM_KUNLIK = {
  jami:           22,
  kiruvchi:       14,
  chiquvchi:      7,
  otkazib:        1,
  qaytaChiqilgan: 1,
  qaytaChiqilmagan: 0,
  otkazibPct:     '4.5%',
  missedStats: {
    qaytaChiqilgan:   1,
    qaytaChiqilmagan: 0,
    qaytaAloqaDaq:    '48.3',
  },
  bars: [
    { lbl: 'Javob berish',     pct: 95,  cls: 'g' },
    { lbl: 'Qayta chiqish',    pct: 100, cls: 'a' },
    { lbl: 'Qayta chiqilmagan', pct: 0,  cls: 'r' },
  ],
};

export const HOURLY = [
  { lbl: '09–11', v: 95  },
  { lbl: '11–13', v: 126 },
  { lbl: '13–15', v: 115 },
  { lbl: '15–17', v: 130 },
  { lbl: '17–19', v: 104 },
  { lbl: '19–21', v: 65  },
  { lbl: '21–23', v: 22  },
];

export const HOURLY_K = [
  { lbl: '09–11', v: 3 },
  { lbl: '11–13', v: 5 },
  { lbl: '13–15', v: 4 },
  { lbl: '15–17', v: 6 },
  { lbl: '17–19', v: 2 },
  { lbl: '19–21', v: 1 },
  { lbl: '21–23', v: 1 },
];

// ─── TELEGRAM ─────────────────────────────────────────────────
export const TELEGRAM_KPI = {
  jamiXabarlar:      115,
  mijozXabarlari:    46,
  menejerJavoblari:  69,
  ortachaJavobVaqti: '30.80',
  javobDarajasi:     '100%',
  murojaatHal:       '93.94%',
};

export const CATS = [
  { lbl: 'Menejer javoblari',  v: 69, c: '#3B6FD4' },
  { lbl: 'Mijoz xabarlari',    v: 46, c: '#34C377' },
  { lbl: 'Mijoz murojaatlari', v: 33, c: '#7B5EA7' },
  { lbl: 'Javob berilgan',     v: 31, c: '#287D4F' },
  { lbl: 'Javob kutilayotgan', v: 2,  c: '#C03434', pct: '1.74%' },
];
