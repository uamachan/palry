// `node --test` で実行（依存追加なし）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enumValue, normalizeGender, normalizeRank, normalizeRole, normalizeRegion,
  cleanAgeField, sanitizeMapsField, validateProfileEnums
} from './profile.js';

test('enumValue: 許可値のみ通し、外れは fallback', () => {
  assert.equal(enumValue('男性', ['男性', '女性']), '男性');
  assert.equal(enumValue('火星人', ['男性', '女性'], 'その他'), 'その他');
  assert.equal(enumValue('  男性  ', ['男性']), '男性'); // トリムされる
  assert.equal(enumValue(undefined, ['男性']), '');
});

test('normalizeGender: 不正値は その他/未設定 に丸める', () => {
  assert.equal(normalizeGender('女性'), '女性');
  assert.equal(normalizeGender('xxx'), 'その他/未設定');
  assert.equal(normalizeGender(''), 'その他/未設定');
});

test('normalizeRank: 別名展開と既定値', () => {
  assert.equal(normalizeRank('Gold 2'), 'Gold 2');
  assert.equal(normalizeRank('Gold'), 'Gold 1'); // 別名 → 具体ランク
  assert.equal(normalizeRank('Iron'), 'Iron 1');
  assert.equal(normalizeRank('存在しない'), 'Gold 1'); // 既定
});

test('normalizeRole / normalizeRegion', () => {
  assert.equal(normalizeRole('センチネル'), 'センチネル');
  assert.equal(normalizeRole('xxx'), 'デュエリスト');
  assert.equal(normalizeRegion('関東'), '関東');
  assert.equal(normalizeRegion('火星'), '');
});

test('cleanAgeField: 新形式と旧数値の後方互換', () => {
  assert.equal(cleanAgeField('20代前半'), '20代前半');
  assert.equal(cleanAgeField('40代以上'), '40代以上');
  assert.equal(cleanAgeField('20代'), '20代');   // 旧形式は cleanAge 側で許可
  assert.equal(cleanAgeField('火星'), '');
});

test('sanitizeMapsField: 許可マップのみ・最大5件・配列以外は空', () => {
  assert.deepEqual(sanitizeMapsField(['アセント', 'バインド', '存在しない']), ['アセント', 'バインド']);
  assert.deepEqual(sanitizeMapsField('not-array'), []);
  const many = ['アセント', 'スプリット', 'ヘイヴン', 'バインド', 'アイスボックス', 'ブリーズ'];
  assert.equal(sanitizeMapsField(many).length, 5);
});

test('validateProfileEnums: 必須項目の検証', () => {
  const ok = validateProfileEnums({ gender: '男性', region: '関東', rank: 'Gold 1', role: 'デュエリスト' });
  assert.deepEqual(ok, { gender: '男性', region: '関東', rank: 'Gold 1', role: 'デュエリスト' });
  assert.equal(validateProfileEnums({ gender: 'x', region: '関東' }).status, 400);
  assert.equal(validateProfileEnums({ gender: '男性', region: 'x' }).status, 400);
  // rank/role は既存値や既定で補完される
  const filled = validateProfileEnums({ gender: '男性', region: '関東' }, { rank: 'Diamond 2', role: 'センチネル' });
  assert.equal(filled.rank, 'Diamond 2');
  assert.equal(filled.role, 'センチネル');
});
