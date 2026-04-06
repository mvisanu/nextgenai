# Clinical Equipment NCR: Anaesthesia Workstation Vaporiser Calibration Drift

**Case ID:** MED-NCR-2024-0441  
**Date:** 2024-09-30  
**Unit:** Operating Theatre 3 (General Anaesthesia)  
**Device:** Anaesthesia Workstation AW-9600, Sevoflurane Vaporiser SV-300  
**Manufacturer:** AnaesthTech International  
**Serial Number:** SV-300-SN-20220567  
**Severity:** Major  
**Reported By:** Dr. Hiroshi Tanaka, Anaesthesiology  

## Defect Description
During routine pre-operative checkout, the anaesthesia team noted that sevoflurane 
agent concentration displayed on the workstation gas monitor (4.0% set point) 
was inconsistent with expired gas analyser (EtAA) measurements: EtAA recorded 
2.6% sevoflurane during steady-state delivery. The discrepancy of 1.4% (35% 
under-delivery relative to set point) was identified before patient administration 
began. No patient harm occurred. Vaporiser SV-300-SN-20220567 was removed from 
service and replaced prior to the surgical list commencing.

## Root Cause
AnaesthTech International calibration analysis found the vaporiser's bimetallic 
temperature-compensating element (TCE-SV-55, lot TC-2022-03) had experienced 
stress relaxation, reducing the thermostatic response by 22% at 21°C ambient. 
The TCE controls the dilution ratio of carrier gas to vapour at the variable 
bypass valve — a weaker thermostatic response caused the bypass valve to under-open, 
reducing agent delivery. Lot TC-2022-03 was manufactured using a bimetallic strip 
from a new supplier (MetalAlloy Co) whose pre-delivery heat treatment specification 
differed from the original supplier: anneal time was reduced from 4 hours to 90 minutes, 
leaving residual stress that relaxed in service.

## Corrective Action
1. Remove SV-300-SN-20220567 from service — return to AnaesthTech for TCE replacement
2. Inspect all SV-300 vaporisers with TCE lot TC-2022-03 — 11 units across hospital group
3. Implement daily vaporiser output verification against calibrated agent analyser before first case
4. AnaesthTech International to requalify MetalAlloy Co heat treatment specification before resuming supply
5. Update PM schedule: annual vaporiser agent delivery accuracy test added as mandatory task

## Related Devices and Systems
- Anaesthesia Workstation AW-9600 (SN AT-9600-20191234)
- Expired Agent Analyser EAA-700 (audit trail of detected discrepancy)
- Ventilator Module VM-600 (gas delivery integration)
