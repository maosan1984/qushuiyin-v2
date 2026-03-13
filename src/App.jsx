import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRemoveWatermark = async () => {
    if (!url) {
      setError('请输入视频链接');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      // 调用后端API
      const response = await axios.post('http://localhost:3001/api/remove-watermark', {
        url: url
      });
      
      if (response.data.success) {
        setResult({
          originalUrl: response.data.data.originalUrl,
          noWatermarkUrl: response.data.data.noWatermarkUrl,
          platform: response.data.data.platform,
          title: response.data.data.title
        });
      } else {
        setError(response.data.message || '去水印失败');
      }
    } catch (err) {
      setError('去水印失败，请稍后重试');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="container">
        <h1 className="title">视频去水印工具</h1>
        <p className="description">支持抖音、快手、小红书等平台视频去水印</p>
        
        <div className="input-section">
          <input
            type="text"
            className="url-input"
            placeholder="请输入视频链接"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button 
            className="remove-btn" 
            onClick={handleRemoveWatermark}
            disabled={loading}
          >
            {loading ? '处理中...' : '去除水印'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {result && (
          <div className="result-section">
            <h2 className="result-title">去水印结果</h2>
            <div className="result-info">
              <p><strong>平台：</strong>{result.platform}</p>
              <p><strong>标题：</strong>{result.title}</p>
              <p><strong>原始链接：</strong><a href={result.originalUrl} target="_blank" rel="noopener noreferrer">{result.originalUrl}</a></p>
              <p><strong>去水印链接：</strong><a href={result.noWatermarkUrl} target="_blank" rel="noopener noreferrer">{result.noWatermarkUrl}</a></p>
            </div>
            <div className="video-player">
              <video controls width="100%" height="auto">
                <source src={result.noWatermarkUrl} type="video/mp4" />
                您的浏览器不支持视频播放
              </video>
            </div>
            <div className="download-section">
              <a href={result.noWatermarkUrl} className="download-btn" download>下载视频</a>
            </div>
          </div>
        )}

        <div className="supported-platforms">
          <h3>支持的平台</h3>
          <div className="platforms-list">
            <span className="platform">抖音</span>
            <span className="platform">快手</span>
            <span className="platform">小红书</span>
            <span className="platform">B站</span>
            <span className="platform">微博</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;