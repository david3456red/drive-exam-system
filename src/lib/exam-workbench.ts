export const VEHICLE_LABELS: Record<string, string> = {
  C1: '小车',
  B2: '客车',
  A2: '货车',
  M1: '摩托车',
  C6: 'C6轻挂',
  SL: '三力测试',
};

export const SUBJECT_LABELS: Record<string, string> = {
  K1: '科目一',
  K4: '科目四',
  TS: '脱审',
  MF: '满分学习',
  SL: '三力测试',
};

export const WORKBENCH_VEHICLE_CODES = ['C1', 'B2', 'A2', 'M1', 'C6', 'SL'] as const;
const VEHICLE_ORDER = [...WORKBENCH_VEHICLE_CODES];
const SUBJECT_ORDER = ['K1', 'K4', 'TS', 'MF', 'SL'];

export type WorkbenchBank = {
  id: string;
  code: string;
  name: string;
  vehicleCode: string | null;
  subjectCode: string | null;
  displayOrder: number;
  _count: { questions: number };
};

export type WorkbenchSubject = {
  code: string;
  label: string;
  bank: WorkbenchBank;
};

export type WorkbenchVehicle = {
  code: string;
  label: string;
  subjects: WorkbenchSubject[];
};

export function buildExamWorkbench(banks: WorkbenchBank[]): WorkbenchVehicle[] {
  const byVehicle = new Map<string, WorkbenchSubject[]>();

  for (const bank of [...banks].sort(compareBank)) {
    const vehicleCode = bank.vehicleCode ?? 'OTHER';
    const subjectCode = bank.subjectCode ?? bank.code;
    const subjects = byVehicle.get(vehicleCode) ?? [];
    subjects.push({
      code: subjectCode,
      label: SUBJECT_LABELS[subjectCode] ?? bank.name,
      bank,
    });
    byVehicle.set(vehicleCode, subjects);
  }

  return Array.from(byVehicle.entries())
    .sort(([a], [b]) => orderOf(VEHICLE_ORDER, a) - orderOf(VEHICLE_ORDER, b))
    .map(([code, subjects]) => ({
      code,
      label: VEHICLE_LABELS[code] ?? '其他',
      subjects: subjects.sort((a, b) => orderOf(SUBJECT_ORDER, a.code) - orderOf(SUBJECT_ORDER, b.code)),
    }));
}

export function defaultVehicleCode(workbench: WorkbenchVehicle[]): string {
  return workbench[0]?.code ?? 'C1';
}

export function defaultSubjectCode(vehicle: WorkbenchVehicle | undefined): string {
  return vehicle?.subjects[0]?.code ?? 'K1';
}

function compareBank(a: WorkbenchBank, b: WorkbenchBank): number {
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
  return a.name.localeCompare(b.name, 'zh-Hans-CN');
}

function orderOf(order: string[], code: string): number {
  const index = order.indexOf(code);
  return index >= 0 ? index : order.length;
}
