-- Migration: 001_initial_schema
-- Description: Initial database schema
-- Date: 2026-05-23

USE rnp_analytics;

CREATE TABLE IF NOT EXISTS _migrations (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  version    VARCHAR(50)  NOT NULL UNIQUE,
  applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- Run schema.sql first, then record this migration
INSERT IGNORE INTO _migrations (version) VALUES ('001_initial_schema');
