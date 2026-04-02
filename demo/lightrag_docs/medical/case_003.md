# Clinical Equipment NCR: Infusion Pump Occlusion Alarm Failure

**Case ID:** MED-NCR-2024-0198  
**Date:** 2024-04-15  
**Unit:** Oncology Ward, Floor 4  
**Device:** Infusion Pump IP-900  
**Manufacturer:** InfuTech Systems  
**Serial Number:** IP-900-SN-20231562  
**Severity:** Major  
**Reported By:** Nursing Supervisor Claire Adams  

## Defect Description
Infusion pump IP-900 failed to alarm on downstream occlusion during vasopressor 
infusion. IV line became kinked for approximately 22 minutes before nursing staff 
noticed cessation of drip. Occlusion detection pressure threshold set correctly 
at 200 mmHg; pump log shows pressure reached 310 mmHg without triggering alarm.

## Root Cause
Occlusion detection circuit utilises pressure transducer shared with the same 
SensorCo component family as the MedTech Corp ventilator incident (see MED-NCR-2024-0134). 
Transducer lot P2022-09 in the InfuTech IP-900 exhibits voltage offset drift 
causing the ADC reading to report false-low pressure values. The alarm comparator 
never receives a signal exceeding threshold despite actual over-pressure conditions.

## Corrective Action
1. Remove all IP-900 units with SensorCo transducer lot P2022-09 from service
2. Cross-reference SensorCo lot P2022-09 against all device types in biomedical inventory
3. Notify clinical risk management — document near-miss event MED-NCR-2024-0198
4. Expedite SensorCo vendor quality audit (combined with MED-NCR-2024-0134 findings)
