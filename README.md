# 多摄像机导播系统

基于3DGS场景重建的多摄像机导播与人物跟踪系统。本系统提供直观的3D可视化界面，帮助导播人员在多相机拍摄场景中选择最佳视角。

## 主要功能

- 3D场景可视化与导航
- 人物跟踪与轨迹显示
- 相机-人物关系实时计算与可视化
- 自动相机推荐机制
- 拍摄质量评分系统
- 支持YOLOv8实时人物跟踪

## 项目结构

```
VideoDirecting_MultiCamSceneEnhance/
├── backend/                        # 后端服务
│   ├── vision_tracking/            # 计算机视觉跟踪模块
│   │   ├── person_tracker.py       # 基于YOLOv8的人物跟踪器
│   │   └── camera_manager.py       # 多相机管理与坐标转换
│   ├── websocket_server/           # WebSocket服务
│   └── server.py                   # 主服务器
├── gaussian-splatting/             # 3DGS场景重建模块
│   └── output/                     # 重建输出结果
├── ui/                             # 前端界面
│   ├── src/
│   │   ├── components/             # React组件
│   │   │   ├── SceneViewerTest.js        # 主界面组件
│   │   │   └── LightweightSceneViewer.js # 3D场景渲染组件
│   │   └── services/
│   │       └── trackingService.js  # WebSocket通信服务
├── start.py                        # 一键启动脚本
├── 导播系统使用指南.md             # 系统使用文档
└── README.md
```

## 系统特点

### 前端
- 3D场景可视化，支持点云和结构线
- 人物轨迹显示和历史回放
- 相机视锥体和视觉关系可视化
- 自动推荐最佳相机视角
- 实时质量评分显示

### 后端
- 基于YOLOv8的实时人物检测与跟踪
- 多相机三角测量计算3D位置
- 自动人物运动状态识别
- WebSocket实时数据推送
- 灵活的相机管理系统

## 安装与运行

### 安装依赖

```bash
# 后端依赖
cd backend
pip install -r requirements.txt

# 前端依赖
cd ui
npm install
```

### 启动系统

最简单的方法是使用启动脚本：

```bash
python start.py
```

这将同时启动后端服务器和前端开发服务器。

或者分别启动：

```bash
# 启动后端
cd backend
python server.py

# 启动前端
cd ui
npm start
```

## 模式切换

系统支持两种运行模式：

1. **模拟模式**：使用程序生成的数据模拟人物移动
2. **实时跟踪模式**：使用YOLOv8进行实时人物检测和跟踪

可以在界面上点击"使用实时跟踪"按钮切换模式。

## 技术栈

- **前端**：React.js、Three.js
- **后端**：Python、FastAPI、WebSocket
- **计算机视觉**：YOLOv8、OpenCV
- **3D重建**：Gaussian Splatting

详细使用说明请参阅[导播系统使用指南](./导播系统使用指南.md)。
