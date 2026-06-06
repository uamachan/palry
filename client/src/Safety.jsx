import React from 'react';

/** 利用規約・禁止事項などの規約リスト */
export function TermsList() {
  return (
    <div className="terms-list">
      <article>
        <h3>利用開始による同意</h3>
        <p>本サービスを閲覧、登録、ログイン、いいね、マッチング、メッセージ、通報、課金、外部SNS連携などで使用した時点で、利用規約に同意したものとみなします。</p>
      </article>
      <article>
        <h3>免責</h3>
        <p>ユーザー間のメッセージ、ボイスチャット、ゲームプレイ、外部SNS、金銭・人間関係トラブルは原則ユーザー同士で解決するものとします。ただし法令上免責できない場合、運営の故意または重大な過失は除きます。</p>
      </article>
      <article>
        <h3>禁止事項</h3>
        <p>暴言、脅迫、差別、セクハラ、恋愛/性的関係やオフライン接触の強要、年齢詐称、なりすまし、チート、アカウント売買、晒し、詐欺、外部決済誘導を禁止します。</p>
      </article>
      <article>
        <h3>非公式表記</h3>
        <p>PairlyはRiot Games公式サービスではありません。VALORANTおよび関連商標はRiot Games, Inc.に帰属します。</p>
      </article>
    </div>
  );
}

/** アプリ内画面で使用するコンパクトな規約パネル */
export function SafetyCompact() {
  return (
    <div className="list-panel">
      <h3>安全・規約</h3>
      <TermsList />
    </div>
  );
}

/** ランディングページのフル規約セクション（デフォルトエクスポート） */
export default function Safety() {
  return (
    <section id="safety" className="section narrow">
      <div className="section-head">
        <span>安全</span>
        <h2>安全・規約</h2>
      </div>
      <TermsList />
    </section>
  );
}
