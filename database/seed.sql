delete from alerts;
delete from oee_trend;
delete from downtime_events;
delete from presses;
delete from dashboard_snapshots;

insert into dashboard_snapshots (
  shift_name,
  plant_name,
  last_updated,
  overall_oee,
  total_output,
  good_parts,
  downtime_label,
  downtime_minutes,
  active_alerts,
  critical_alerts,
  warning_alerts,
  quality_rate
) values
('Shift A', 'Plant 1', '2026-05-28 09:41:30+05:30', 78.6, 18542, 17230, '2h 46m', 166, 4, 2, 2, 93.0),
('Shift B', 'Plant 1', '2026-05-28 21:41:30+05:30', 74.2, 17210, 15988, '3h 18m', 198, 3, 1, 2, 92.9);

insert into presses (
  shift_name, press_name, status, oee, output_count, downtime_minutes, current_job, sort_order
) values
('Shift A', 'Press 01', 'Running', 85, 3246, 18, 'Auto Door Panels', 1),
('Shift A', 'Press 02', 'Running', 82, 3012, 22, 'Side Frame Batch', 2),
('Shift A', 'Press 03', 'Running', 75, 2789, 35, 'Hinge Mount Kits', 3),
('Shift A', 'Press 04', 'Minor Stop', 60, 2105, 62, 'Reinforcement Brackets', 4),
('Shift A', 'Press 05', 'Down', 0, 0, 72, 'Tool Change Queue', 5),
('Shift A', 'Press 06', 'Running', 88, 3890, 12, 'Latch Assembly', 6),
('Shift B', 'Press 01', 'Running', 81, 2988, 19, 'Auto Door Panels', 1),
('Shift B', 'Press 02', 'Running', 79, 2840, 23, 'Side Frame Batch', 2),
('Shift B', 'Press 03', 'Minor Stop', 68, 2514, 41, 'Hinge Mount Kits', 3),
('Shift B', 'Press 04', 'Running', 72, 2652, 29, 'Reinforcement Brackets', 4),
('Shift B', 'Press 05', 'Down', 0, 0, 88, 'Maintenance Hold', 5),
('Shift B', 'Press 06', 'Running', 86, 3421, 15, 'Latch Assembly', 6);

insert into downtime_events (
  shift_name, reason, minutes, percent, sort_order
) values
('Shift A', 'Tool Change', 135, 37.7, 1),
('Shift A', 'Material Shortage', 70, 19.6, 2),
('Shift A', 'Setup', 45, 12.6, 3),
('Shift A', 'Breakdown', 30, 8.4, 4),
('Shift A', 'Quality Hold', 22, 6.1, 5),
('Shift A', 'Operator Delay', 18, 5.0, 6),
('Shift A', 'Other', 16, 4.5, 7),
('Shift B', 'Tool Change', 148, 35.5, 1),
('Shift B', 'Material Shortage', 76, 18.2, 2),
('Shift B', 'Setup', 52, 12.5, 3),
('Shift B', 'Breakdown', 34, 8.2, 4),
('Shift B', 'Quality Hold', 24, 5.8, 5),
('Shift B', 'Operator Delay', 20, 4.8, 6),
('Shift B', 'Other', 18, 4.3, 7);

insert into oee_trend (
  shift_name, day_label, value, sort_order
) values
('Shift A', 'Sun', 68.1, 1),
('Shift A', 'Mon', 71.2, 2),
('Shift A', 'Tue', 74.8, 3),
('Shift A', 'Wed', 72.3, 4),
('Shift A', 'Thu', 76.1, 5),
('Shift A', 'Fri', 77.9, 6),
('Shift A', 'Today', 78.6, 7),
('Shift B', 'Sun', 66.9, 1),
('Shift B', 'Mon', 69.4, 2),
('Shift B', 'Tue', 70.8, 3),
('Shift B', 'Wed', 71.1, 4),
('Shift B', 'Thu', 73.2, 5),
('Shift B', 'Fri', 73.9, 6),
('Shift B', 'Today', 74.2, 7);

insert into alerts (
  shift_name, severity, title, message, created_at, is_active
) values
('Shift A', 'critical', 'Press 05 is down', 'Hydraulic pressure dropped below threshold. Maintenance team notified.', '2026-05-28 09:17:00+05:30', true),
('Shift A', 'critical', 'Quality hold on Press 04', 'Three consecutive defects flagged during inspection. Hold released after recalibration.', '2026-05-28 08:58:00+05:30', true),
('Shift A', 'warning', 'Material shortage risk', 'Inbound coil stock will cover the next 2.5 hours at current rate.', '2026-05-28 08:32:00+05:30', true),
('Shift A', 'warning', 'Operator delay elevated', 'Handover delay was 9 minutes above target during shift transition.', '2026-05-28 08:06:00+05:30', true),
('Shift B', 'critical', 'Press 05 maintenance hold', 'Safety lockout is active. Awaiting maintenance clearance.', '2026-05-27 21:14:00+05:30', true),
('Shift B', 'warning', 'Setup variance detected', 'Press 03 setup time exceeded standard by 11 minutes.', '2026-05-27 20:44:00+05:30', true),
('Shift B', 'warning', 'Material staging late', 'Feed material arrived after planned window.', '2026-05-27 19:58:00+05:30', true);
