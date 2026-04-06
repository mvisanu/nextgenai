# Clinical Equipment NCR: MRI Coil RF Heating Event — Radiology Department

**Case ID:** MED-NCR-2024-0278  
**Date:** 2024-06-19  
**Unit:** MRI Suite 2 (Radiology)  
**Device:** 3T MRI System MR-3000, Knee Coil KC-32  
**Manufacturer:** MagnetIQ Corp  
**Serial Number:** KC-32-SN-20231204  
**Severity:** Critical  
**Reported By:** Dr. Alan Okonkwo, Radiology  

## Defect Description
Patient reported burning sensation on the lateral aspect of the right knee 
approximately 8 minutes into a standard knee protocol scan (TR/TE 3500/35ms, 
SAR 2.8 W/kg). Scan was immediately terminated by the radiographer. Post-scan 
assessment revealed a 3cm x 2cm superficial contact burn (Grade I–II) on the 
lateral knee, consistent with localised RF heating. No metallic implants or 
contraindications were identified in pre-scan safety screening.

## Root Cause
MagnetIQ Corp engineering investigation found that KC-32 knee coil (lot KC-2023-11) 
had a hairline fracture in the shield conductor at the coil loop junction. 
The fracture created a high-impedance gap, resulting in current concentration 
and localised E-field enhancement directly at the patient contact surface. 
SAR monitoring reported global average SAR within limits; the local 10g-averaged 
SAR was not independently monitored by the scanner's safety system. The fracture 
originated during coil assembly — improper torque applied to the RF shield 
crimp connector (applied 1.8 Nm vs specified 0.8 Nm maximum).

## Corrective Action
1. Remove KC-32-SN-20231204 from service — quarantine all KC-32 coils from lot KC-2023-11
2. NDT inspection (micro-CT) of all KC-32 coils from lot KC-2023-11 for conductor fractures
3. Patient treated for contact burn; dermatology referral initiated; incident reported to MHRA
4. MagnetIQ Corp to retrain assembly technicians on coil connector torque procedures
5. Revise coil QC protocol: add electrical continuity test with milli-ohm measurement before shipment

## Related Devices and Systems
- MRI System MR-3000 (SN MQ-3000-20211088)
- SAR Monitoring Module SAR-MM v2.1
- MRI Safety Screening Protocol (pre-scan questionnaire)
