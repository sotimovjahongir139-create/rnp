-- ═══════════════════════════════════════════════════════════════
--  RNP Analytics Database Schema
-- ═══════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS rnp_analytics CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE rnp_analytics;

-- ─── USERS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)     NOT NULL UNIQUE,
  password_hash VARCHAR(255)    NOT NULL,
  full_name     VARCHAR(100)    NOT NULL,
  role          ENUM('admin','manager') NOT NULL DEFAULT 'manager',
  department_id INT UNSIGNED    NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_username (username),
  INDEX idx_role     (role)
) ENGINE=InnoDB;

-- ─── DEPARTMENTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL UNIQUE,
  code       VARCHAR(20)  NOT NULL UNIQUE,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_code (code)
) ENGINE=InnoDB;

-- ─── PRODUCTION ORDERS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_orders (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  department_id    INT UNSIGNED NOT NULL,
  order_date       DATE         NOT NULL,
  status           ENUM('Normal','Kritik','Malumot yoq') NOT NULL DEFAULT 'Normal',
  total_orders     INT UNSIGNED NOT NULL DEFAULT 0,
  completed_orders INT UNSIGNED NOT NULL DEFAULT 0,
  remaining_orders INT UNSIGNED NOT NULL DEFAULT 0,
  active_cards     INT UNSIGNED NOT NULL DEFAULT 0,
  efficiency       DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  avg_cycle_days   DECIMAL(4,1) NULL,
  min_max_days     VARCHAR(20)  NULL,
  incoming_week    INT UNSIGNED NOT NULL DEFAULT 0,
  completed_week   INT UNSIGNED NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dept_date (department_id, order_date),
  INDEX idx_order_date    (order_date),
  INDEX idx_dept_id       (department_id),
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ─── SKU ASSIGNMENTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sku_assignments (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  department_id INT UNSIGNED NOT NULL,
  model_code    VARCHAR(10)  NOT NULL,
  model_label   VARCHAR(50)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dept_model (department_id, model_code),
  FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

-- ─── AMO CALL MONTHLY STATS ──────────────────────────────────────
-- Written by: amocrm_april_report.py (adapted)
CREATE TABLE IF NOT EXISTS amo_call_monthly_stats (
  id                  INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  stat_month          DATE           NOT NULL COMMENT 'First day of month',
  manager_name        VARCHAR(100)   NOT NULL,
  total_calls         INT UNSIGNED   NOT NULL DEFAULT 0,
  incoming_calls      INT UNSIGNED   NOT NULL DEFAULT 0,
  outgoing_calls      INT UNSIGNED   NOT NULL DEFAULT 0,
  missed_calls        INT UNSIGNED   NOT NULL DEFAULT 0,
  recalled_calls      INT UNSIGNED   NOT NULL DEFAULT 0,
  not_recalled        INT UNSIGNED   NOT NULL DEFAULT 0,
  answer_rate         DECIMAL(5,2)   NOT NULL DEFAULT 0.00,
  recall_rate         DECIMAL(5,2)   NOT NULL DEFAULT 0.00,
  avg_recall_minutes  DECIMAL(8,2)   NULL,
  created_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_month_manager (stat_month, manager_name),
  INDEX idx_stat_month (stat_month)
) ENGINE=InnoDB;

-- ─── AMO CALL DAILY STATS ────────────────────────────────────────
-- Written by: amocrm_april_report.py (adapted)
CREATE TABLE IF NOT EXISTS amo_call_daily_stats (
  id                  INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  stat_date           DATE           NOT NULL,
  manager_name        VARCHAR(100)   NOT NULL,
  total_calls         INT UNSIGNED   NOT NULL DEFAULT 0,
  incoming_calls      INT UNSIGNED   NOT NULL DEFAULT 0,
  outgoing_calls      INT UNSIGNED   NOT NULL DEFAULT 0,
  missed_calls        INT UNSIGNED   NOT NULL DEFAULT 0,
  recalled_calls      INT UNSIGNED   NOT NULL DEFAULT 0,
  not_recalled        INT UNSIGNED   NOT NULL DEFAULT 0,
  answer_rate         DECIMAL(5,2)   NOT NULL DEFAULT 0.00,
  recall_rate         DECIMAL(5,2)   NOT NULL DEFAULT 0.00,
  avg_recall_minutes  DECIMAL(8,2)   NULL,
  created_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_date_manager (stat_date, manager_name),
  INDEX idx_stat_date (stat_date)
) ENGINE=InnoDB;

-- ─── CRM HOURLY STATS ────────────────────────────────────────────
-- Written by: amocrm_april_report.py (adapted)
CREATE TABLE IF NOT EXISTS crm_hourly_stats (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  stat_date  DATE         NOT NULL,
  hour_slot  VARCHAR(10)  NOT NULL COMMENT '09-11, 11-13...',
  call_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_date_slot (stat_date, hour_slot),
  INDEX idx_stat_date (stat_date)
) ENGINE=InnoDB;

-- ─── TELEGRAM DAILY STATS ────────────────────────────────────────
-- Written by: amocrm_telegram_response.py (adapted)
CREATE TABLE IF NOT EXISTS telegram_daily_stats (
  id                      INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  stat_date               DATE          NOT NULL UNIQUE,
  total_conversations     INT UNSIGNED  NOT NULL DEFAULT 0,
  answered_turns          INT UNSIGNED  NOT NULL DEFAULT 0,
  waiting_turns           INT UNSIGNED  NOT NULL DEFAULT 0,
  response_rate           DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  avg_response_minutes    DECIMAL(8,2)  NULL,
  median_response_minutes DECIMAL(8,2)  NULL,
  created_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_stat_date (stat_date)
) ENGINE=InnoDB;

-- ─── TELEGRAM RESPONSE DETAILS ───────────────────────────────────
-- Written by: amocrm_telegram_response.py (adapted)
CREATE TABLE IF NOT EXISTS telegram_response_details (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  stat_date             DATE          NOT NULL,
  conversation_id       BIGINT        NOT NULL,
  contact_name          VARCHAR(255)  NULL,
  first_client_msg_at   DATETIME      NULL,
  first_manager_msg_at  DATETIME      NULL,
  response_minutes      DECIMAL(8,2)  NULL,
  is_answered           TINYINT(1)    NOT NULL DEFAULT 0,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_date_conv (stat_date, conversation_id),
  INDEX idx_stat_date (stat_date),
  INDEX idx_is_answered (is_answered)
) ENGINE=InnoDB;

-- ─── KPI RESULTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpi_results (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_type          ENUM('daily','monthly') NOT NULL,
  period_date          DATE         NOT NULL,
  department_id        INT UNSIGNED NULL,
  manager_id           INT UNSIGNED NULL,
  total_calls          INT UNSIGNED NULL,
  missed_calls         INT UNSIGNED NULL,
  missed_pct           DECIMAL(5,2) NULL,
  efficiency_pct       DECIMAL(5,2) NULL,
  avg_cycle_days       DECIMAL(4,1) NULL,
  avg_response_min     DECIMAL(8,2) NULL,
  telegram_resolution  DECIMAL(5,2) NULL,
  trend_score          DECIMAL(5,2) NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_period      (period_type, period_date),
  INDEX idx_dept        (department_id),
  INDEX idx_manager     (manager_id),
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (manager_id)    REFERENCES users(id)       ON DELETE SET NULL
) ENGINE=InnoDB;

-- ─── DAILY REPORTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_reports (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_date   DATE         NOT NULL UNIQUE,
  total_calls   INT UNSIGNED NULL,
  missed_calls  INT UNSIGNED NULL,
  tg_messages   INT UNSIGNED NULL,
  prod_orders   INT UNSIGNED NULL,
  prod_done     INT UNSIGNED NULL,
  notes         TEXT         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_report_date (report_date)
) ENGINE=InnoDB;

-- ─── MONTHLY REPORTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_reports (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_month    DATE         NOT NULL UNIQUE COMMENT 'First day of month',
  total_calls     INT UNSIGNED NULL,
  missed_calls    INT UNSIGNED NULL,
  tg_messages     INT UNSIGNED NULL,
  prod_orders     INT UNSIGNED NULL,
  prod_done       INT UNSIGNED NULL,
  efficiency_pct  DECIMAL(5,2) NULL,
  notes           TEXT         NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_report_month (report_month)
) ENGINE=InnoDB;

-- ─── NOTIFICATIONS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NULL,
  type       VARCHAR(50)  NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       TEXT         NULL,
  is_read    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user_id    (user_id),
  INDEX idx_is_read    (is_read),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
