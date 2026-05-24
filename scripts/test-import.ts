/* Standalone smoke-test for the import parser + Zod validator. Not part of the build. */
import {
  parseJsonImport,
  parseExcelImport,
  buildExcelTemplate,
} from '../src/lib/import-parser';
import { QuestionImportSchema } from '../src/lib/question-types';

const sampleJson = JSON.stringify([
  { type: 'SINGLE', content: '黄灯亮时表示什么?', options: [{ key: 'A', text: '禁止通行' }, { key: 'B', text: '警示' }], answer: 'B', categories: ['交通信号'] },
  { type: 'MULTI', content: '哪些违法', options: [{ key: 'A', text: '酒驾' }, { key: 'B', text: '系带' }, { key: 'C', text: '闯红灯' }], answer: 'AC' },
  { type: 'JUDGE', content: '红灯停车', answer: 'T' },
  { type: 'SINGLE', content: '坏题', options: [{ key: 'A', text: '一' }, { key: 'B', text: '二' }], answer: 'X' },
  { type: 'JUDGE', content: '坏判断', answer: 'B' },
]);

console.log('--- parseJsonImport ---');
const r = parseJsonImport(sampleJson);
console.log('ok:', r.ok);
if (!r.ok) process.exit(1);
console.log('count:', r.items.length);

console.log('\n--- validate ---');
let valid = 0;
let invalid = 0;
r.items.forEach((it, i) => {
  const v = QuestionImportSchema.safeParse(it);
  if (v.success) {
    valid++;
    console.log(`  ✓ row ${i + 1}: ${it.type} "${it.content.slice(0, 20)}..."`);
  } else {
    invalid++;
    console.log(`  ✗ row ${i + 1}: ${v.error.issues.map((x) => x.message).join('; ')}`);
  }
});
console.log(`\nresult: ${valid} valid, ${invalid} invalid (expected: 3 valid, 2 invalid)`);

console.log('\n--- buildExcelTemplate round-trip ---');
const buf = buildExcelTemplate();
console.log('template bytes:', buf.byteLength);
const xls = parseExcelImport(buf);
if (!xls.ok) {
  console.log('FAIL:', xls.error);
  process.exit(1);
}
console.log('parsed rows:', xls.items.length);
let xValid = 0;
xls.items.forEach((it, i) => {
  const v = QuestionImportSchema.safeParse(it);
  if (v.success) {
    xValid++;
    console.log(`  ✓ row ${i + 1}: ${it.type} "${it.content.slice(0, 30)}..."`);
  } else {
    console.log(`  ✗ row ${i + 1}: ${v.error.issues.map((x) => x.message).join('; ')}`);
  }
});
console.log(`\ntemplate -> parse -> validate: ${xValid}/${xls.items.length} valid`);

if (valid === 3 && invalid === 2 && xValid === xls.items.length) {
  console.log('\n✅ ALL CHECKS PASSED');
} else {
  console.log('\n❌ FAILURES');
  process.exit(1);
}
