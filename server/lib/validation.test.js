// Node 組み込みテストランナーで実行: `node --test`（依存追加なし）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, cleanAge, sanitizeMedia, emailKey } from './validation.js';

test('cleanText: 山括弧除去・トリム・最大長', () => {
  assert.equal(cleanText('  hello  '), 'hello');
  assert.equal(cleanText('<script>x'), 'scriptx');
  assert.equal(cleanText('abcdef', 3), 'abc');
  assert.equal(cleanText(null), '');
  assert.equal(cleanText(undefined), '');
});

test('cleanAge: 13〜80のみ許可、異常値は空', () => {
  assert.equal(cleanAge('25'), '25');
  assert.equal(cleanAge(25), '25');
  assert.equal(cleanAge('13'), '13');
  assert.equal(cleanAge('80'), '80');
  assert.equal(cleanAge('12'), '');   // 下限未満
  assert.equal(cleanAge('81'), '');   // 上限超過
  assert.equal(cleanAge('21213'), ''); // 桁あふれ（slice バグ回帰防止）
  assert.equal(cleanAge('abc'), '');
  assert.equal(cleanAge(''), '');
});

test('sanitizeMedia: data URL のみ許可', () => {
  const img = 'data:image/png;base64,iVBORw0KGgoAAAANS';
  const audio = 'data:audio/webm;base64,AAAA';
  assert.equal(sanitizeMedia(img, 'image', 1000), img);
  assert.equal(sanitizeMedia(audio, 'audio', 1000), audio);
  // https は弾く
  assert.equal(sanitizeMedia('https://example.com/a.png', 'image', 1000), '');
  // スキーム混入は弾く
  assert.equal(sanitizeMedia('data:text/html;base64,PHNjcmlwdD4=', 'image', 1000), '');
  assert.equal(sanitizeMedia('javascript:alert(1)', 'image', 1000), '');
  // 最大長超過は弾く
  assert.equal(sanitizeMedia(img, 'image', 5), '');
});

test('emailKey: 整形 + 小文字化', () => {
  assert.equal(emailKey('  Foo@Bar.COM '), 'foo@bar.com');
  assert.equal(emailKey('<a>@b.com'), 'a@b.com');
});
