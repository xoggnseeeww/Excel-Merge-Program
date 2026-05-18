/**
 * __tests__/store.test.ts
 * 상태 머신 전이 + re_validating 트리거 (#7,#8)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { createXlsxFile, toManagedFile } from '@/__fixtures__/createMockFile';

function getStore() {
  return useAppStore.getState();
}

function resetStore() {
  useAppStore.getState().reset();
}

describe('상태 머신 전이', () => {
  beforeEach(resetStore);

  it('idle → validating → parsing → preview_ready (정상 흐름)', () => {
    const s = getStore();
    s.transitionTo('validating');
    expect(useAppStore.getState().status).toBe('validating');
    s.transitionTo('parsing');
    expect(useAppStore.getState().status).toBe('parsing');
    s.transitionTo('preview_ready');
    expect(useAppStore.getState().status).toBe('preview_ready');
  });

  it('금지된 전이 → 무시 (idle → merging)', () => {
    getStore().transitionTo('merging');
    expect(useAppStore.getState().status).toBe('idle'); // 변경 없음
  });

  it('merging → idle (Abort 흐름)', () => {
    const s = getStore();
    s.transitionTo('validating');
    s.transitionTo('parsing');
    s.transitionTo('preview_ready');
    s.transitionTo('merging');
    s.transitionTo('idle');
    expect(useAppStore.getState().status).toBe('idle');
  });

  it('failed → idle (에러 후 복구)', () => {
    const s = getStore();
    s.transitionTo('validating');
    s.transitionTo('parsing');
    s.transitionTo('failed');
    s.transitionTo('idle');
    expect(useAppStore.getState().status).toBe('idle');
  });
});

describe('#7: preview_ready 상태에서 모드 변경 → re_validating', () => {
  beforeEach(resetStore);

  it('setMergeMode → re_validating 전이 + trigger=mode_changed', () => {
    const s = getStore();
    s.transitionTo('validating');
    s.transitionTo('parsing');
    s.transitionTo('preview_ready');
    s.setMergeMode('B');
    const state = useAppStore.getState();
    expect(state.status).toBe('re_validating');
    expect(state.reValidatingTrigger).toBe('mode_changed');
    expect(state.mergeMode).toBe('B');
  });

  it('idle 상태에서 모드 변경 → re_validating 미전이', () => {
    getStore().setMergeMode('C');
    expect(useAppStore.getState().status).toBe('idle');
  });
});

describe('#8: dnd-kit 재정렬 → re_validating', () => {
  beforeEach(resetStore);

  it('reorderFiles → preview_ready일 때 re_validating 전이', () => {
    const s = getStore();
    const f1 = toManagedFile(createXlsxFile('a.xlsx', [{ v: 1 }]));
    const f2 = toManagedFile(createXlsxFile('b.xlsx', [{ v: 2 }]));
    s.addFiles([f1, f2]);
    s.transitionTo('validating');
    s.transitionTo('parsing');
    s.transitionTo('preview_ready');
    s.reorderFiles(0, 1);
    const state = useAppStore.getState();
    expect(state.status).toBe('re_validating');
    expect(state.reValidatingTrigger).toBe('file_reordered');
  });

  it('reorderFiles → 실제 순서 변경 확인', () => {
    const s = getStore();
    const f1 = toManagedFile(createXlsxFile('first.xlsx', [{ v: 1 }]));
    const f2 = toManagedFile(createXlsxFile('second.xlsx', [{ v: 2 }]));
    s.addFiles([f1, f2]);
    s.reorderFiles(0, 1);
    const files = useAppStore.getState().files;
    expect(files[0]!.file.name).toBe('second.xlsx');
    expect(files[1]!.file.name).toBe('first.xlsx');
  });
});

describe('Partial Failure — warnings[]', () => {
  beforeEach(resetStore);

  it('pushWarning → warnings 배열 누적', () => {
    const s = getStore();
    s.pushWarning({ fileId: 'f1', fileName: 'bad.xlsx', errorCode: 'E002', message: '손상됨' });
    s.pushWarning({ fileId: 'f2', fileName: 'pw.xlsx', errorCode: 'E001', message: '암호화됨' });
    expect(useAppStore.getState().warnings).toHaveLength(2);
  });

  it('completed + warnings → #12 Gate 기준: 성공(경고 있음)', () => {
    const s = getStore();
    s.transitionTo('validating');
    s.transitionTo('parsing');
    s.transitionTo('preview_ready');
    s.transitionTo('merging');
    s.pushWarning({ fileId: 'f1', fileName: 'bad.xlsx', errorCode: 'E005', message: '빈 시트' });
    s.transitionTo('completed');
    const state = useAppStore.getState();
    expect(state.status).toBe('completed');     // #12: completed 유지
    expect(state.warnings.length).toBeGreaterThan(0); // 경고 있음
  });
});
