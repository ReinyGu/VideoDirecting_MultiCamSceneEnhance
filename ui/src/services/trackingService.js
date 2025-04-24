/**
 * 跟踪服务
 * 负责与后端WebSocket服务器通信，获取实时人物跟踪数据
 */

class TrackingService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.eventListeners = {
      'persons': [],
      'cameras': [],
      'connect': [],
      'disconnect': [],
      'error': []
    };
    this.retryCount = 0;
    this.maxRetries = 5;
    this.retryDelay = 2000; // 重连延迟，单位毫秒
    this.serverUrl = process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:8000/ws';
  }

  /**
   * 连接到WebSocket服务器
   */
  connect() {
    if (this.socket && this.connected) {
      console.log('WebSocket已连接，无需重复连接');
      return;
    }

    console.log(`正在连接到WebSocket服务器: ${this.serverUrl}`);

    try {
      this.socket = new WebSocket(this.serverUrl);

      // 连接建立时
      this.socket.onopen = () => {
        console.log('WebSocket连接成功');
        this.connected = true;
        this.retryCount = 0;
        this._triggerEvent('connect');
      };

      // 收到消息时
      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this._handleMessage(data);
        } catch (error) {
          console.error('解析WebSocket消息失败:', error);
          this._triggerEvent('error', { error, message: '解析消息失败' });
        }
      };

      // 连接关闭时
      this.socket.onclose = () => {
        console.log('WebSocket连接已关闭');
        this.connected = false;
        this._triggerEvent('disconnect');
        this._attemptReconnect();
      };

      // 连接出错时
      this.socket.onerror = (error) => {
        console.error('WebSocket连接错误:', error);
        this._triggerEvent('error', { error, message: '连接错误' });
      };

    } catch (error) {
      console.error('创建WebSocket连接失败:', error);
      this._triggerEvent('error', { error, message: '创建连接失败' });
      this._attemptReconnect();
    }
  }

  /**
   * 尝试重新连接
   * @private
   */
  _attemptReconnect() {
    if (this.retryCount >= this.maxRetries) {
      console.error(`WebSocket连接重试次数已达上限(${this.maxRetries}次)，停止重试`);
      return;
    }

    this.retryCount++;
    const delay = this.retryDelay * Math.pow(1.5, this.retryCount - 1); // 指数退避

    console.log(`${delay / 1000}秒后尝试重新连接(第${this.retryCount}次)...`);
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * 断开WebSocket连接
   */
  disconnect() {
    if (this.socket && this.connected) {
      console.log('正在断开WebSocket连接...');
      this.socket.close();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * 发送命令到服务器
   * @param {string} command 命令名称
   * @param {Object} params 命令参数
   */
  sendCommand(command, params = {}) {
    if (!this.socket || !this.connected) {
      console.error('WebSocket未连接，无法发送命令');
      return false;
    }

    try {
      const message = {
        type: 'command',
        command,
        ...params
      };

      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('发送命令失败:', error);
      return false;
    }
  }

  /**
   * 启动跟踪
   */
  startTracking() {
    return this.sendCommand('start_tracking');
  }

  /**
   * 停止跟踪
   */
  stopTracking() {
    return this.sendCommand('stop_tracking');
  }

  /**
   * 设置活动相机
   * @param {string} cameraId 相机ID
   */
  setActiveCamera(cameraId) {
    return this.sendCommand('set_active_camera', { camera_id: cameraId });
  }

  /**
   * 处理接收到的消息
   * @param {Object} data 消息数据
   * @private
   */
  _handleMessage(data) {
    // 根据消息类型分发事件
    if (data.type === 'cameras_info') {
      this._triggerEvent('cameras', data.cameras);
    } else if (data.timestamp && data.persons) {
      // 人物跟踪数据
      this._triggerEvent('persons', {
        timestamp: data.timestamp,
        persons: data.persons
      });
    }
  }

  /**
   * 注册事件监听器
   * @param {string} event 事件名称
   * @param {Function} callback 回调函数
   */
  on(event, callback) {
    if (event in this.eventListeners) {
      this.eventListeners[event].push(callback);
    } else {
      console.warn(`未知的事件类型: ${event}`);
    }

    // 返回取消订阅函数
    return () => this.off(event, callback);
  }

  /**
   * 移除事件监听器
   * @param {string} event 事件名称
   * @param {Function} callback 回调函数
   */
  off(event, callback) {
    if (event in this.eventListeners) {
      this.eventListeners[event] = this.eventListeners[event]
        .filter(cb => cb !== callback);
    }
  }

  /**
   * 触发事件
   * @param {string} event 事件名称
   * @param {*} data 事件数据
   * @private
   */
  _triggerEvent(event, data) {
    if (event in this.eventListeners) {
      this.eventListeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`执行${event}事件监听器时出错:`, error);
        }
      });
    }
  }
}

// 创建单例实例
const trackingService = new TrackingService();

export default trackingService; 