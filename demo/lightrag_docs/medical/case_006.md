# Clinical Equipment NCR: Infusion Pump Occlusion Alarm Failure — Oncology Unit

**Case ID:** MED-NCR-2024-0211  
**Date:** 2024-05-08  
**Unit:** Oncology Day Unit (ODU-2)  
**Device:** Volumetric Infusion Pump VP-8800  
**Manufacturer:** InfuMed Ltd  
**Serial Number:** VP-8800-SN-20220891  
**Severity:** Critical  
**Reported By:** Dr. Priya Sharma, Oncology Nursing  

## Defect Description
Volumetric infusion pump VP-8800 failed to alarm on downstream occlusion during 
chemotherapy administration (paclitaxel infusion at 125ml/hr). Nursing staff 
discovered the infusion cannula had tissued (extravasated) after approximately 
40 minutes of undetected occlusion. Alarm threshold was set at 300 mmHg pressure 
per protocol. Post-event testing confirmed the device did not alarm until pressure 
reached 520 mmHg — a 73% deviation above threshold.

## Root Cause
InfuMed Ltd technical investigation identified a faulty pressure transducer 
(component PT-VP-220, lot P2022-04) where the silicon strain gauge had developed 
micro-cracking, causing a baseline offset of +220 mmHg. As a result, the effective 
alarm trigger threshold was elevated to 520 mmHg (set point 300 + offset 220). 
The micro-cracking was traced to thermal stress during sterilization; the 
autoclave cycle parameters applied to lot P2022-04 exceeded specification by 
18°C for 4 minutes.

## Corrective Action
1. Remove VP-8800-SN-20220891 from service immediately
2. Inspect and pressure-calibrate all VP-8800 units with transducer lot P2022-04 (18 devices)
3. Patient reviewed by oncology team — tissue injury assessed, wound care protocol initiated
4. InfuMed Ltd to replace all lot P2022-04 transducers and revalidate autoclaving parameters
5. Mandatory 6-monthly pressure calibration verification added to VP-8800 maintenance schedule

## Related Devices and Systems
- Oncology Drug Library ONC-DL v3.2 (dose limit settings)
- Central Pharmacy Preparation Unit (paclitaxel batch traceability)
- Incident Reporting System IRS-ODU (adverse event documented)
