let app = null;
let initError = null;

try {
  app = require('../server/index');
} catch (err) {
  initError = err;
  console.error('API Serverless 初始化錯誤:', err);
}

module.exports = (req, res) => {
  if (initError || !app) {
    return res.status(500).json({
      error: '伺服器端模組載入錯誤',
      message: initError ? initError.message : 'App not initialized',
      stack: initError ? initError.stack : null
    });
  }

  try {
    return app(req, res);
  } catch (runtimeErr) {
    console.error('執行期錯誤:', runtimeErr);
    return res.status(500).json({
      error: '處理請求時發生錯誤',
      message: runtimeErr.message
    });
  }
};
