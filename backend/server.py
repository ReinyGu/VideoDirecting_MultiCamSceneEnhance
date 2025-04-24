#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
多摄像机导播系统后端服务器
负责协调WebSocket通信和计算机视觉处理
"""

import os
import json
import asyncio
import logging
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# 导入跟踪模块
from vision_tracking.person_tracker import PersonTracker
from vision_tracking.camera_manager import CameraManager

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 创建FastAPI应用
app = FastAPI(title="多摄像机导播系统后端")

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源，生产环境应限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 数据模型
class CameraInfo(BaseModel):
    id: str
    name: str
    url: str
    position: List[float]
    direction: List[float]
    fov: float = 60.0
    
class PersonData(BaseModel):
    id: str
    position: List[float]
    direction: List[float]
    velocity: List[float]
    activity: str
    pose: str
    size: Dict[str, float]

# 全局状态
active_connections: List[WebSocket] = []
camera_manager = None
person_tracker = None

# WebSocket连接管理
async def broadcast_person_data(data: Dict[str, Any]):
    """广播人物跟踪数据到所有连接的客户端"""
    if active_connections:
        message = json.dumps(data)
        await asyncio.gather(*[connection.send_text(message) for connection in active_connections])

@app.on_event("startup")
async def startup_event():
    """服务器启动时初始化跟踪系统"""
    global camera_manager, person_tracker
    
    # 加载配置
    config_path = os.path.join(os.path.dirname(__file__), 'config.json')
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
            
        # 初始化相机管理器
        camera_manager = CameraManager(config.get('cameras', []))
        
        # 初始化人物跟踪器
        model_path = config.get('yolo_model_path', 'vision_tracking/models/yolov8n.pt')
        person_tracker = PersonTracker(
            model_path=model_path,
            camera_manager=camera_manager,
            track_buffer=config.get('track_buffer', 30),
            confidence=config.get('detection_confidence', 0.5)
        )
        
        # 启动跟踪循环
        asyncio.create_task(tracking_loop())
        
        logger.info("跟踪系统初始化完成")
    except Exception as e:
        logger.error(f"初始化错误: {str(e)}")

async def tracking_loop():
    """人物跟踪主循环"""
    global person_tracker
    
    if not person_tracker:
        logger.error("人物跟踪器未初始化")
        return
    
    while True:
        try:
            # 执行跟踪并获取结果
            persons_data = await person_tracker.track()
            
            # 广播结果
            if persons_data:
                await broadcast_person_data({
                    "timestamp": person_tracker.get_timestamp(),
                    "persons": persons_data
                })
                
            # 控制帧率
            await asyncio.sleep(0.033)  # 约30FPS
            
        except Exception as e:
            logger.error(f"跟踪循环错误: {str(e)}")
            await asyncio.sleep(1)  # 出错时暂停一秒

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket连接端点"""
    await websocket.accept()
    active_connections.append(websocket)
    
    try:
        # 发送初始相机信息
        if camera_manager:
            await websocket.send_text(json.dumps({
                "type": "cameras_info",
                "cameras": camera_manager.get_cameras_info()
            }))
        
        # 处理来自客户端的消息
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # 处理客户端命令
            if message.get("type") == "command":
                cmd = message.get("command")
                
                if cmd == "start_tracking":
                    if person_tracker:
                        person_tracker.start()
                        
                elif cmd == "stop_tracking":
                    if person_tracker:
                        person_tracker.stop()
                        
                elif cmd == "set_active_camera":
                    camera_id = message.get("camera_id")
                    if camera_manager and camera_id:
                        camera_manager.set_active_camera(camera_id)
    
    except WebSocketDisconnect:
        active_connections.remove(websocket)
    except Exception as e:
        logger.error(f"WebSocket错误: {str(e)}")
        if websocket in active_connections:
            active_connections.remove(websocket)

@app.get("/")
async def root():
    """健康检查端点"""
    return {"status": "running", "service": "多摄像机导播系统后端"}

@app.get("/cameras")
async def get_cameras():
    """获取所有相机信息"""
    if camera_manager:
        return {"cameras": camera_manager.get_cameras_info()}
    return {"cameras": []}

if __name__ == "__main__":
    # 运行服务器
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True) 