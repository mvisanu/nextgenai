# Clinical Equipment NCR: Ventilator Pressure Sensor Defect

**Case ID:** MED-NCR-2024-0134  
**Date:** 2024-03-28  
**Unit:** Respiratory ICU (RICU)  
**Device:** Mechanical Ventilator MV-2200  
**Manufacturer:** MedTech Corp  
**Serial Number:** MV-2200-SN-20220344  
**Severity:** Critical  
**Reported By:** Dr. Robert Kim, Respiratory Medicine  

## Defect Description
Ventilator MV-2200 reported incorrect peak inspiratory pressure (PIP) readings 
during routine calibration check. Device displayed PIP of 18 cmH₂O against 
test lung calibrated to 24 cmH₂O — 25% under-read. Patient alarm thresholds 
set based on displayed pressure may have been inappropriate for 3 patients 
treated with this unit over the preceding 2 weeks.

## Root Cause
Differential pressure sensor (component DPS-MV-440, lot P2022-11) manufactured 
by SensorCo exhibited drift exceeding specification after 14 months of continuous 
operation. Sensor datasheet specifies ±2% accuracy over 18-month service life; 
actual drift measured at -25% at 14 months. SensorCo lot P2022-11 identified 
as containing non-conforming piezoelectric elements from a secondary supplier.

## Corrective Action
1. Remove MV-2200-SN-20220344 from service — replace pressure sensor
2. Recall and inspect all MV-2200 units with sensor lot P2022-11
3. Issue patient safety advisory — review ventilator settings for 3 prior patients
4. Mandatory annual pressure calibration verification added to PM schedule
5. SensorCo removed from approved vendor list pending quality audit
