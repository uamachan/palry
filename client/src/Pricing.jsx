import React from 'react';
import { cx, planLabel } from './constants.jsx';

const fallbackPlansData = {
  plans: {
    FREE: {
      name: 'FREE',
      price: 0,
      features: ['通常LIKE 10回/day', 'SUPER LIKE 1回/day', '両LIKE 5回', 'マッチ後DM']
    },
    PLUS: {
      name: 'PLUS',
      price: 980,
      features: ['通常LIKE 40回/day', 'SUPER LIKE 5回/day', '性別指定フィルター', '足あと詳細']
    },
    VIP: {
      name: 'VIP',
      price: 1980,
      features: ['LIKE無制限', 'SUPER LIKE無制限', '性別指定フィルター', '全制限解除']
    }
  },
  singleItems: []
};

/**
 * 料金セクション。
 * ランディングページ（main.jsx）とアプリ画面（AppDashboard.jsx/PricingPanel）の
 * 両方で使用するため独立ファイルに切り出す。
 */
export default function PublicPricing({ plansData, pricingTab = 'monthly', setPricingTab = () => {}, onSignup, appMode, buyPlan, buyItem }) {
  const safePlansData = plansData && typeof plansData === 'object' ? plansData : fallbackPlansData;
  const plans = safePlansData.plans || fallbackPlansData.plans;
  const singleItems = Array.isArray(safePlansData.singleItems) ? safePlansData.singleItems : [];
  const monthly = Object.values(plans);
  const activePricingTab = pricingTab === 'plans' ? 'monthly' : (pricingTab || 'monthly');

  return (
    <section id="pricing" className={cx('section pricing-section', appMode && 'inside')}>
      <div className="section-head">
        <span>料金</span>
        <h2>料金</h2>
        <p>男女で特典差はありません。VIPは全制限解除です。</p>
      </div>
      <div className="price-tabs">
        <button type="button" className={activePricingTab === 'monthly' ? 'active' : ''} onClick={() => setPricingTab('monthly')}>月額プラン</button>
        <button type="button" className={activePricingTab === 'single' ? 'active' : ''} onClick={() => setPricingTab('single')}>単発課金</button>
        <button type="button" className={activePricingTab === 'compare' ? 'active' : ''} onClick={() => setPricingTab('compare')}>比較表</button>
      </div>

      {activePricingTab === 'monthly' && (
        <div className="price-grid">
          {monthly.map((p) => (
            <article className={cx('price-card', p.name === 'VIP' && 'featured')} key={p.name}>
              <h3>{planLabel(p.name)}</h3>
              <div className="price">¥{Number(p.price || 0).toLocaleString()}<span>/月</span></div>
              <ul>{p.features?.map((f) => <li key={f}>{f}</li>)}</ul>
              <button type="button" className="primary" onClick={buyPlan ? () => buyPlan(p.name) : onSignup}>
                {p.name === 'FREE' ? '無料で始める' : `${planLabel(p.name)}にする`}
              </button>
            </article>
          ))}
        </div>
      )}

      {activePricingTab === 'single' && (
        <div className="single-grid">
          {singleItems.length ? singleItems.map((item) => (
            <article key={item.name} className="single-card">
              <h3>{item.name}</h3>
              <b>¥{item.price}</b>
              <p>{item.detail}</p>
              <button type="button" className="primary" onClick={buyItem ? () => buyItem(item.name) : onSignup}>
                {buyItem ? '購入する（デモ）' : '無料登録して購入'}
              </button>
            </article>
          )) : <p className="empty-text">単発課金メニューを読み込み中です。</p>}
        </div>
      )}

      {activePricingTab === 'compare' && (
        <div className="compare">
          <table>
            <thead>
              <tr><th>機能</th><th>無料</th><th>プラス</th><th>VIP</th></tr>
            </thead>
            <tbody>
              <tr><td>いいね</td><td>10回/日</td><td>40回/日</td><td>無制限</td></tr>
              <tr><td>スーパーいいね</td><td>1回/日</td><td>5回/日</td><td>無制限</td></tr>
              <tr><td>両いいね</td><td>5回</td><td>10回</td><td>無制限</td></tr>
              <tr><td>性別指定</td><td>×</td><td>○</td><td>○</td></tr>
              <tr><td>制限解除</td><td>×</td><td>一部</td><td>全解除</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
