-- Migration: 003_add_sku_table
-- Description: Add SKU/model assignments per department
-- Date: 2026-05-23

USE rnp_analytics;

CREATE TABLE IF NOT EXISTS sku_assignments (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  department_id INT UNSIGNED NOT NULL,
  model_code    VARCHAR(10)  NOT NULL,
  model_label   VARCHAR(50)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dept_model (department_id, model_code),
  FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

INSERT IGNORE INTO _migrations (version) VALUES ('003_add_sku_table');
