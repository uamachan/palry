import React from 'react';

/**
 * アプリ全体の描画クラッシュを受け止め、白画面ではなく復旧導線を出す。
 * React の Error Boundary はクラスでしか実装できない。
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // 計測基盤があれば送る（未設定なら no-op）。コンソールには常に残す。
    console.error('[ErrorBoundary]', error, info?.componentStack);
    try {
      window.__pairlyTrack?.('app_error', { message: String(error?.message || error) });
    } catch { /* ignore */ }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="ui-error-boundary">
        <div className="ui-error-card">
          <h2>問題が発生しました</h2>
          <p>画面の表示中にエラーが発生しました。ページを再読み込みしてください。</p>
          <button className="primary" type="button" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </div>
      </div>
    );
  }
}
