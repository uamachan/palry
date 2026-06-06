process.env.NODE_ENV = 'production';
// index-runtime.js は index.js への単純パッススルーになったため直接読み込む。
// 重要ロジックはすべて index.js 本体にあり、runtime 専用ロジックは存在しない。
await import('./index.js');
