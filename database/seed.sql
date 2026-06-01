USE rnp_analytics;

-- ─── DEPARTMENTS ─────────────────────────────────────────────────
INSERT IGNORE INTO departments (name, code) VALUES
  ('Quyish PU',      'QUPU'),
  ('Sifat nazorati', 'SIFAT'),
  ('Lazer',          'LAZER'),
  ('Chaxlash',       'CHAX'),
  ('Sklad',          'SKLAD'),
  ('Quyish TEP',     'QTEP');

-- ─── USERS (admin + 1 manager) ───────────────────────────────────
-- Password: admin123  →  bcrypt hash (cost 10)
INSERT IGNORE INTO users (username, password_hash, full_name, role) VALUES
  ('admin', '$2a$10$MnDr1xNnj4hzDv7uYjMRU.C8V4H0pZaZhUUZCkpqr3KAHgmkmFGS.', 'Administrator', 'admin'),
  ('menejer1', '$2a$10$wrs4FO0J5RG2Tkd4WQQkvu4j8vTcDXYtIvnc6qZTKwptssimnwdDe', 'Menejer 1', 'manager');

-- ─── SKU ASSIGNMENTS ─────────────────────────────────────────────
INSERT IGNORE INTO sku_assignments (department_id, model_code, model_label)
SELECT d.id, m.code, m.label FROM departments d
JOIN (SELECT 'ma' code,'Model A' label UNION SELECT 'mb','Model B' UNION SELECT 'mc','Model C') m
WHERE d.code = 'QUPU';

INSERT IGNORE INTO sku_assignments (department_id, model_code, model_label)
SELECT d.id, m.code, m.label FROM departments d
JOIN (SELECT 'ma' code,'Model A' label UNION SELECT 'mb','Model B' UNION SELECT 'mc','Model C' UNION SELECT 'md','Model D') m
WHERE d.code = 'SIFAT';

INSERT IGNORE INTO sku_assignments (department_id, model_code, model_label)
SELECT d.id, m.code, m.label FROM departments d
JOIN (SELECT 'mb' code,'Model B' label UNION SELECT 'md','Model D') m
WHERE d.code = 'LAZER';

INSERT IGNORE INTO sku_assignments (department_id, model_code, model_label)
SELECT d.id, m.code, m.label FROM departments d
JOIN (SELECT 'ma' code,'Model A' label UNION SELECT 'mc','Model C') m
WHERE d.code = 'CHAX';

INSERT IGNORE INTO sku_assignments (department_id, model_code, model_label)
SELECT d.id, 'mall', 'Barchasi' FROM departments d WHERE d.code = 'SKLAD';

INSERT IGNORE INTO sku_assignments (department_id, model_code, model_label)
SELECT d.id, m.code, m.label FROM departments d
JOIN (SELECT 'ma' code,'Model A' label UNION SELECT 'mb','Model B') m
WHERE d.code = 'QTEP';
