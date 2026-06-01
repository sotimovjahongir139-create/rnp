-- Migration: 002_add_hourly_stats
-- Description: Add crm_hourly_stats table for time-slot analysis
-- Date: 2026-05-23

USE rnp_analytics;

CREATE TABLE IF NOT EXISTS crm_hourly_stats (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  stat_date  DATE         NOT NULL,
  hour_slot  VARCHAR(10)  NOT NULL COMMENT '09-11, 11-13, ...',
  call_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_date_slot (stat_date, hour_slot),
  INDEX idx_stat_date (stat_date)
) ENGINE=InnoDB;

INSERT IGNORE INTO _migrations (version) VALUES ('002_add_hourly_stats');
