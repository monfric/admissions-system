-- SAMPLE DATA FOR TESTING ONLY. Do not import on the live server.
-- Import after schema.sql to get a faculty, department, training levels,
-- programmes and an open intake with fees, so the portal's Apply page has
-- something to offer before the staff app is ready.

INSERT INTO faculties (name, code, is_active) VALUES ('Clinical Sciences', 'CLIN', 1);
INSERT INTO departments (faculty_id, name, code, is_active)
  SELECT id, 'Nursing', 'NUR', 1 FROM faculties WHERE code = 'CLIN';

INSERT INTO training_levels (name, code, `order`, is_active) VALUES
  ('Certificate', 'CERT', 1, 1),
  ('Diploma', 'DIP', 2, 1);

INSERT INTO programmes (department_id, training_level_id, name, code, duration_years, is_active)
  SELECT d.id, tl.id, 'Diploma in Kenya Registered Community Health Nursing', 'KRCHN', 3, 1
    FROM departments d, training_levels tl WHERE d.code = 'NUR' AND tl.code = 'DIP';
INSERT INTO programmes (department_id, training_level_id, name, code, duration_years, is_active)
  SELECT d.id, tl.id, 'Diploma in Perioperative Theatre Technology', 'DPTT', 3, 1
    FROM departments d, training_levels tl WHERE d.code = 'NUR' AND tl.code = 'DIP';
INSERT INTO programmes (department_id, training_level_id, name, code, duration_years, is_active)
  SELECT d.id, tl.id, 'Certificate in Health Records and Information', 'CHRI', 2, 1
    FROM departments d, training_levels tl WHERE d.code = 'NUR' AND tl.code = 'CERT';

INSERT INTO intakes (intake_month, intake_year, is_active) VALUES ('September', 2027, 1);

INSERT INTO intake_programmes (intake_id, programme_id, is_active)
  SELECT i.id, p.id, 1 FROM intakes i, programmes p WHERE i.intake_month = 'September' AND i.intake_year = 2027;

INSERT INTO intake_training_levels (intake_id, training_level_id, application_fee, is_active)
  SELECT i.id, tl.id, IF(tl.code = 'DIP', 1500, 1000), 1
    FROM intakes i, training_levels tl WHERE i.intake_month = 'September' AND i.intake_year = 2027;
