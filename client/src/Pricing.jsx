import React from 'react';
import { cx, planLabel } from './constants.jsx';

/**
 * 料金セクション。
 * ランディングページ（main.jsx）とアプリ画面（AppDashboard.jsx/PricingPanel）の
 * 両方で使用するため独立ファイルに切り出す。
 * Vite はこのモジュールを main.jsx の静的インポートとして判定し main チャンクに含めるため、
 * AppDashboard チャンクとの重複は発生しない。
 */
export default function PublicPricing({ plansData, pricingTab, setPricingTab, onSignup, appMode, buyPlan }) {
  const plans = plansData.plans || {};
  const monthly = Object.values(plans);

  return (
    <section id="pricing" className={cx('section pricing-section', appMode && 'inside')}>
      <div className="section-head">
        <span>料金</span>
        <h2>料金</h2>
        <p>男女で特典差はありません。VIPは全制限解除です。</p>
      </div>
      <div className="price-tabs">
        <button className={pricingTab === 'monthly' ? 'active' : ''} onClick={() => setPricingTab('monthly')}>月額プラン</button>
        <button className={pricingTab === 'single' ? 'active' : ''} onClick={() => setPricingTab('single')}>単発課金</button>
        <button className={pricingTab === 'compare' ? 'active' : ''} onClick={() => setPricingTab('compare')}>比較表</button>
      </div>

      {pricingTab === 'monthly' && (
        <div className="price-grid">
          {monthly.map((p) => (
            <article className={cx('price-card', p.name === 'VIP' && 'featured')} key={p.name}>
              <h3>{planLabel(p.name)}</h3>
              <div className="price">¥{p.price.toLocaleString()}<span>/月</span></div>
              <ul>{p.features?.map((f) => <li key={f}>{f}</li>)}</ul>
              <button className="primary" onClick={buyPlan ? () => buyPlan(p.name) : onSignup}>
                {p.name === 'FREE' ? '無料で始める' : `${planLabel(p.name)}にする`}
              </button>
            </article>
          ))}
        </div>
      )}

      {pricingTab === 'single' && (
        <div className="single-grid">
          {(plansData.singleItems || []).map((item) => (
            <article key={item.name} className="single-card">
              <h3>{item.name}</h3>
              <b>¥{item.price}</b>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      )}

      {pricingTab === 'compare' && (
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
