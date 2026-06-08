// `node --test` で実行。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plans, singleItems, singleItemConfig, quotaFor, isDemoPaymentAllowed } from './catalog.js';

test('quotaFor: プラン・種別ごとの上限', () => {
  assert.equal(quotaFor('FREE', 'like'), 10);
  assert.equal(quotaFor('FREE', 'super'), 1);
  assert.equal(quotaFor('FREE', 'dual'), 5);
  assert.equal(quotaFor('PLUS', 'like'), 40);
  assert.equal(quotaFor('VIP', 'like'), Infinity); // unlimited
  assert.equal(quotaFor('VIP', 'super'), Infinity);
  assert.equal(quotaFor('不明', 'like'), 10); // 不明プランは FREE 扱い
});

test('isDemoPaymentAllowed: 非本番は許可 / 本番はフラグ必須', () => {
  // テスト実行時は NODE_ENV=production ではないので true
  assert.equal(isDemoPaymentAllowed(), true);
});

test('singleItemConfig: 各商品が perk/kind を持つ', () => {
  for (const item of singleItems) {
    const cfg = singleItemConfig[item.name];
    assert.ok(cfg, `config 不足: ${item.name}`);
    assert.ok(cfg.perk && cfg.kind);
    if (cfg.kind === 'timed') assert.ok(cfg.durationMs > 0);
    if (cfg.kind === 'consumable') assert.ok(cfg.count > 0);
  }
});

test('plans: 主要プランが定義されている', () => {
  for (const name of ['FREE', 'PLUS', 'VIP']) {
    assert.equal(plans[name].name, name);
  }
  assert.equal(plans.VIP.unlimited, true);
});
