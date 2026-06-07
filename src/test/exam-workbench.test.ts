import { describe, expect, it } from 'vitest';

import { WORKBENCH_VEHICLE_CODES, buildExamWorkbench } from '@/lib/exam-workbench';
import { getMockConfig } from '@/lib/exam-engine/mock-config';

describe('exam workbench grouping', () => {
  it('does not expose C6 as a static vehicle entry', () => {
    expect(WORKBENCH_VEHICLE_CODES).toEqual(['C1', 'B2', 'A2', 'M1', 'SL']);
    expect(WORKBENCH_VEHICLE_CODES).not.toContain('C6');
  });

  it('groups banks by vehicle first and subject second with stable ordering', () => {
    const workbench = buildExamWorkbench([
      {
        id: 'b2',
        code: 'C1_K4',
        name: '小车科目四',
        vehicleCode: 'C1',
        subjectCode: 'K4',
        displayOrder: 20,
        _count: { questions: 50 },
      },
      {
        id: 'b1',
        code: 'C1_K1',
        name: '小车科目一',
        vehicleCode: 'C1',
        subjectCode: 'K1',
        displayOrder: 10,
        _count: { questions: 100 },
      },
      {
        id: 'b3',
        code: 'A2_K1',
        name: '货车科目一',
        vehicleCode: 'A2',
        subjectCode: 'K1',
        displayOrder: 30,
        _count: { questions: 103 },
      },
    ]);

    expect(workbench.map((vehicle) => vehicle.code)).toEqual(['C1', 'A2']);
    expect(workbench[0]!.subjects.map((subject) => subject.code)).toEqual(['K1', 'K4']);
    expect(workbench[0]!.subjects[0]!.bank.name).toBe('小车科目一');
  });

  it('uses bank-level mock settings before subject defaults', () => {
    expect(
      getMockConfig('C1_TS', {
        subjectCode: 'TS',
        mockQuestionCount: 100,
        mockDurationMs: 30 * 60 * 1000,
        mockPassScore: 90,
      }),
    ).toEqual({
      count: 100,
      durationMs: 30 * 60 * 1000,
      passScore: 90,
    });

    expect(getMockConfig('C1_K4', { subjectCode: 'K4' })).toEqual({
      count: 50,
      durationMs: 30 * 60 * 1000,
      passScore: 90,
    });
  });
});
