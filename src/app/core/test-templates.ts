import { TestItem, TestParam } from './models';

/**
 * Standard parameters for common Indian lab tests, with typical adult reference ranges.
 * Labs must check every range against their own analyzer / kit inserts before use.
 */
interface Template {
  match: string[];
  sample: string;
  department: string;
  params: TestParam[];
}

const n = (key: string, name: string, unit: string, low: number | null, high: number | null, extra: Partial<TestParam> = {}): TestParam => ({
  key, name, unit, type: 'number', low, high, decimals: 2, ...extra,
});
const opt = (key: string, name: string, options: string[]): TestParam => ({ key, name, type: 'option', options });
const txt = (key: string, name: string, unit = ''): TestParam => ({ key, name, unit, type: 'text' });
const NIL = ['Nil', 'Trace', '+', '++', '+++', '++++'];

export const TEMPLATES: Template[] = [
  {
    match: ['CBP', 'CBC', 'HEMOGRAM', 'HAEMOGRAM', 'COMPLETE BLOOD'],
    sample: 'EDTA (purple)', department: 'Haematology',
    params: [
      n('HB', 'Haemoglobin', 'g/dL', 13, 17, { low_f: 12, high_f: 15, decimals: 1 }),
      n('RBC', 'RBC count', 'mill/cumm', 4.5, 5.5, { low_f: 3.8, high_f: 4.8 }),
      n('PCV', 'Packed cell volume (PCV)', '%', 40, 50, { low_f: 36, high_f: 46, decimals: 1 }),
      n('MCV', 'MCV', 'fL', 83, 101, { decimals: 1 }),
      n('MCH', 'MCH', 'pg', 27, 32, { decimals: 1 }),
      n('MCHC', 'MCHC', 'g/dL', 31.5, 34.5, { decimals: 1 }),
      n('RDW', 'RDW-CV', '%', 11.6, 14, { decimals: 1 }),
      n('WBC', 'Total WBC count', '/cumm', 4000, 11000, { decimals: 0 }),
      n('NEUT', 'Neutrophils', '%', 40, 80, { decimals: 0, section: 'Differential count' }),
      n('LYMPH', 'Lymphocytes', '%', 20, 40, { decimals: 0, section: 'Differential count' }),
      n('MONO', 'Monocytes', '%', 2, 10, { decimals: 0, section: 'Differential count' }),
      n('EOS', 'Eosinophils', '%', 1, 6, { decimals: 0, section: 'Differential count' }),
      n('BASO', 'Basophils', '%', 0, 2, { decimals: 0, section: 'Differential count' }),
      n('PLT', 'Platelet count', 'lakh/cumm', 1.5, 4.1),
    ],
  },
  { match: ['FBS', 'FASTING'], sample: 'Fluoride (grey)', department: 'Biochemistry', params: [n('GLU_F', 'Glucose, fasting', 'mg/dL', 70, 100, { decimals: 0 })] },
  { match: ['PPBS', 'POST PRANDIAL', 'PP SUGAR'], sample: 'Fluoride (grey)', department: 'Biochemistry', params: [n('GLU_PP', 'Glucose, post prandial (2 hr)', 'mg/dL', null, 140, { decimals: 0 })] },
  { match: ['RBS', 'RANDOM'], sample: 'Fluoride (grey)', department: 'Biochemistry', params: [n('GLU_R', 'Glucose, random', 'mg/dL', 70, 140, { decimals: 0 })] },
  {
    match: ['HBA1C', 'GLYCATED', 'GLYCOSYLATED'], sample: 'EDTA (purple)', department: 'Biochemistry',
    params: [n('HBA1C', 'HbA1c', '%', 4, 5.6, { decimals: 1 }), n('EAG', 'Estimated average glucose', 'mg/dL', null, null, { decimals: 0, formula: '28.7 * HBA1C - 46.7' })],
  },
  {
    match: ['LIPID'], sample: 'Serum (red/yellow)', department: 'Biochemistry',
    params: [
      n('CHOL', 'Total cholesterol', 'mg/dL', null, 200, { decimals: 0 }),
      n('TG', 'Triglycerides', 'mg/dL', null, 150, { decimals: 0 }),
      n('HDL', 'HDL cholesterol', 'mg/dL', 40, null, { decimals: 0 }),
      n('LDL', 'LDL cholesterol (calculated)', 'mg/dL', null, 100, { decimals: 0, formula: 'CHOL - HDL - TG / 5' }),
      n('VLDL', 'VLDL cholesterol (calculated)', 'mg/dL', 5, 40, { decimals: 0, formula: 'TG / 5' }),
      n('CHOL_HDL', 'Total cholesterol / HDL ratio', '', null, 4.5, { decimals: 1, formula: 'CHOL / HDL' }),
    ],
  },
  {
    match: ['LFT', 'LIVER'], sample: 'Serum (red/yellow)', department: 'Biochemistry',
    params: [
      n('TBIL', 'Bilirubin, total', 'mg/dL', 0.3, 1.2),
      n('DBIL', 'Bilirubin, direct', 'mg/dL', 0, 0.3),
      n('IBIL', 'Bilirubin, indirect (calculated)', 'mg/dL', 0.2, 0.9, { formula: 'TBIL - DBIL' }),
      n('AST', 'SGOT (AST)', 'U/L', 0, 40, { decimals: 0 }),
      n('ALT', 'SGPT (ALT)', 'U/L', 0, 41, { decimals: 0 }),
      n('ALP', 'Alkaline phosphatase', 'U/L', 40, 129, { decimals: 0 }),
      n('TP', 'Total protein', 'g/dL', 6.4, 8.3, { decimals: 1 }),
      n('ALB', 'Albumin', 'g/dL', 3.5, 5.2, { decimals: 1 }),
      n('GLOB', 'Globulin (calculated)', 'g/dL', 2, 3.5, { decimals: 1, formula: 'TP - ALB' }),
      n('AG', 'A/G ratio (calculated)', '', 1, 2.1, { decimals: 1, formula: 'ALB / (TP - ALB)' }),
    ],
  },
  {
    match: ['RFT', 'KFT', 'RENAL', 'KIDNEY'], sample: 'Serum (red/yellow)', department: 'Biochemistry',
    params: [
      n('UREA', 'Blood urea', 'mg/dL', 17, 43, { decimals: 0 }),
      n('BUN', 'BUN (calculated)', 'mg/dL', 7, 20, { decimals: 1, formula: 'UREA / 2.14' }),
      n('CREAT', 'Creatinine', 'mg/dL', 0.7, 1.3, { low_f: 0.6, high_f: 1.1 }),
      n('URIC', 'Uric acid', 'mg/dL', 3.5, 7.2, { low_f: 2.6, high_f: 6, decimals: 1 }),
      n('NA', 'Sodium', 'mmol/L', 136, 145, { decimals: 0 }),
      n('K', 'Potassium', 'mmol/L', 3.5, 5.1, { decimals: 1 }),
      n('CL', 'Chloride', 'mmol/L', 98, 107, { decimals: 0 }),
    ],
  },
  {
    match: ['ELECTROLYTE', 'SERUM ELECTROLYTES'], sample: 'Serum (red/yellow)', department: 'Biochemistry',
    params: [n('NA', 'Sodium', 'mmol/L', 136, 145, { decimals: 0 }), n('K', 'Potassium', 'mmol/L', 3.5, 5.1, { decimals: 1 }), n('CL', 'Chloride', 'mmol/L', 98, 107, { decimals: 0 })],
  },
  {
    match: ['TSH', 'THYROID', 'TFT', 'T3'], sample: 'Serum (red/yellow)', department: 'Immunoassay',
    params: [n('T3', 'Total T3', 'ng/dL', 80, 200, { decimals: 0 }), n('T4', 'Total T4', 'µg/dL', 5.1, 14.1, { decimals: 1 }), n('TSH', 'TSH', 'µIU/mL', 0.27, 4.2)],
  },
  { match: ['VITD', 'VITAMIN D', 'VIT D'], sample: 'Serum (red/yellow)', department: 'Immunoassay', params: [n('VITD', 'Vitamin D (25-OH)', 'ng/mL', 30, 100, { decimals: 1 })] },
  { match: ['B12', 'VITAMIN B12'], sample: 'Serum (red/yellow)', department: 'Immunoassay', params: [n('B12', 'Vitamin B12', 'pg/mL', 197, 771, { decimals: 0 })] },
  { match: ['CRP'], sample: 'Serum (red/yellow)', department: 'Biochemistry', params: [n('CRP', 'C-reactive protein', 'mg/L', null, 6, { decimals: 1 })] },
  { match: ['ESR'], sample: 'EDTA (purple)', department: 'Haematology', params: [n('ESR', 'ESR (1st hour)', 'mm/hr', 0, 15, { low_f: 0, high_f: 20, decimals: 0 })] },
  {
    match: ['URINE', 'CUE', 'UR'], sample: 'Urine', department: 'Clinical pathology',
    params: [
      opt('COLOR', 'Colour', ['Pale yellow', 'Yellow', 'Dark yellow', 'Red', 'Other']),
      opt('APPEAR', 'Appearance', ['Clear', 'Slightly turbid', 'Turbid']),
      n('PH', 'pH', '', 5, 8, { decimals: 1 }),
      n('SG', 'Specific gravity', '', 1.005, 1.03, { decimals: 3 }),
      opt('PROT', 'Protein', NIL),
      opt('GLUC', 'Glucose', NIL),
      opt('KET', 'Ketones', ['Negative', 'Positive']),
      txt('PUS', 'Pus cells', '/hpf'),
      txt('URBC', 'RBCs', '/hpf'),
      txt('EPI', 'Epithelial cells', '/hpf'),
      txt('CAST', 'Casts'),
      txt('CRYS', 'Crystals'),
    ],
  },
];

/** Standard template for a test by its code or name, if we have one. */
export function templateFor(t: Pick<TestItem, 'code' | 'name'>): Template | null {
  const code = t.code.toUpperCase().trim();
  const name = t.name.toUpperCase();
  return (
    TEMPLATES.find((x) => x.match.includes(code)) ??
    TEMPLATES.find((x) => x.match.some((m) => m.length > 3 && name.includes(m))) ??
    null
  );
}
