#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
人物跟踪模块
使用YOLOv8进行人物检测和跟踪
"""

import os
import time
import asyncio
import numpy as np
import cv2
import torch
from ultralytics import YOLO
from typing import List, Dict, Any, Optional, Tuple

class PersonTracker:
    """人物跟踪器，负责检测和跟踪人物"""
    
    def __init__(
        self,
        model_path: str,
        camera_manager,
        track_buffer: int = 30,
        confidence: float = 0.5,
        device: str = None
    ):
        """
        初始化人物跟踪器
        
        参数:
            model_path: YOLOv8模型路径
            camera_manager: 相机管理器实例
            track_buffer: 跟踪缓冲区大小
            confidence: 检测置信度阈值
            device: 运行设备 ('cpu', 'cuda', 'mps')
        """
        self.camera_manager = camera_manager
        self.track_buffer = track_buffer
        self.confidence = confidence
        self.running = False
        self.timestamp = 0
        
        # 自动选择设备
        if device is None:
            self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        else:
            self.device = device
            
        # 加载YOLOv8模型
        self.ensure_model_exists(model_path)
        self.model = YOLO(model_path)
        
        # 人物历史跟踪数据
        self.person_history = {}
        
        # 状态初始化
        self.frame_count = 0
        self.last_positions = {}  # 上一次的位置
        self.world_positions = {}  # 世界坐标系下的位置
        
        print(f"人物跟踪器初始化完成，运行于{self.device}设备")
    
    def ensure_model_exists(self, model_path: str):
        """确保模型文件存在，不存在则下载"""
        if not os.path.exists(model_path):
            # 创建模型目录
            os.makedirs(os.path.dirname(model_path), exist_ok=True)
            
            # 如果是相对路径，转换为绝对路径
            if not os.path.isabs(model_path):
                base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                abs_model_path = os.path.join(base_dir, model_path)
            else:
                abs_model_path = model_path
                
            print(f"模型文件不存在，将自动下载YOLOv8模型到: {abs_model_path}")
            
            # 默认下载YOLOv8n模型
            self.model = YOLO("yolov8n.pt")
            # 保存到指定路径
            self.model.save(abs_model_path)
    
    def start(self):
        """启动跟踪"""
        self.running = True
        print("人物跟踪器已启动")
    
    def stop(self):
        """停止跟踪"""
        self.running = False
        print("人物跟踪器已停止")
    
    def get_timestamp(self):
        """获取当前时间戳"""
        return self.timestamp
    
    async def track(self) -> List[Dict[str, Any]]:
        """
        执行人物跟踪
        
        返回:
            跟踪到的人物列表
        """
        if not self.running:
            return []
            
        self.timestamp = time.time() * 1000  # 毫秒时间戳
        self.frame_count += 1
        
        # 获取所有相机的图像
        camera_frames = await self.camera_manager.get_frames()
        
        # 如果没有获取到图像，返回空
        if not camera_frames:
            return []
        
        detected_persons = {}  # 每个相机检测到的人
        
        # 处理每个相机的图像
        for camera_id, frame in camera_frames.items():
            if frame is None:
                continue
                
            # 使用YOLOv8进行检测
            results = self.model.track(
                frame, 
                classes=0,  # 只检测人类
                conf=self.confidence,
                persist=True,  # 保持跟踪ID
                verbose=False
            )
            
            # 提取人物检测结果
            if results and len(results) > 0:
                for r in results:
                    # 获取跟踪ID和边界框
                    if r.boxes.id is not None:
                        for i, track_id in enumerate(r.boxes.id.int().cpu().tolist()):
                            # 边界框坐标
                            box = r.boxes.xyxy[i].cpu().numpy()
                            
                            # 提取中心点坐标和尺寸
                            x1, y1, x2, y2 = box
                            center_x = (x1 + x2) / 2
                            center_y = (y1 + y2) / 2
                            width = x2 - x1
                            height = y2 - y1
                            
                            # 存储检测结果
                            person_id = f"person_{track_id}"
                            if person_id not in detected_persons:
                                detected_persons[person_id] = []
                                
                            detected_persons[person_id].append({
                                "camera_id": camera_id,
                                "position_2d": (center_x, center_y),
                                "size_2d": (width, height),
                                "confidence": float(r.boxes.conf[i].cpu().numpy())
                            })
        
        # 将2D坐标转换为3D世界坐标
        world_persons = await self._calculate_3d_positions(detected_persons)
        
        # 计算速度和方向
        persons_with_movement = self._calculate_movement(world_persons)
        
        # 更新历史记录
        self._update_history(persons_with_movement)
        
        return list(persons_with_movement.values())
    
    async def _calculate_3d_positions(self, detected_persons: Dict[str, List[Dict]]) -> Dict[str, Dict]:
        """
        将2D检测结果转换为3D世界坐标
        
        参数:
            detected_persons: 检测到的人物数据
            
        返回:
            人物ID到3D位置的映射
        """
        world_persons = {}
        
        for person_id, detections in detected_persons.items():
            # 至少需要两个相机的检测结果进行三角测量
            if len(detections) >= 2:
                # 调用相机管理器的三角测量方法
                position_3d = await self.camera_manager.triangulate_position(
                    [d["camera_id"] for d in detections],
                    [d["position_2d"] for d in detections]
                )
                
                if position_3d is not None:
                    # 获取平均高度作为粗略估计
                    heights = [d["size_2d"][1] for d in detections]
                    avg_height = sum(heights) / len(heights)
                    
                    # 估计人物尺寸
                    # 假设一个人的实际高度平均为1.7米
                    pixel_to_meter_ratio = 1.7 / avg_height
                    
                    world_persons[person_id] = {
                        "id": person_id,
                        "position": position_3d,
                        "size": {
                            "height": 1.7,  # 平均人高
                            "width": 0.5,   # 估计宽度
                            "depth": 0.3    # 估计深度
                        }
                    }
        
        return world_persons
    
    def _calculate_movement(self, world_persons: Dict[str, Dict]) -> Dict[str, Dict]:
        """
        计算人物的移动速度和方向
        
        参数:
            world_persons: 3D世界坐标中的人物
            
        返回:
            添加了速度和方向的人物数据
        """
        result = {}
        
        for person_id, person_data in world_persons.items():
            current_position = np.array(person_data["position"])
            
            # 默认值
            velocity = [0.0, 0.0, 0.0]
            direction = [1.0, 0.0, 0.0]  # 默认朝向X轴正方向
            activity = "standing"  # 默认站立状态
            pose = "upright"  # 默认直立姿态
            
            # 如果有历史位置，计算速度和方向
            if person_id in self.last_positions:
                last_position = np.array(self.last_positions[person_id])
                displacement = current_position - last_position
                
                # 如果位移足够大，认为在移动
                speed = np.linalg.norm(displacement)
                if speed > 0.05:  # 5cm/帧的阈值
                    # 计算速度向量
                    velocity = displacement.tolist()
                    
                    # 计算水平方向（忽略Y轴）
                    horizontal_displacement = np.array([displacement[0], 0, displacement[2]])
                    horizontal_speed = np.linalg.norm(horizontal_displacement)
                    
                    if horizontal_speed > 0.01:
                        # 归一化方向向量
                        direction = (horizontal_displacement / horizontal_speed).tolist()
                        
                        # 根据速度确定活动状态
                        if speed > 0.3:
                            activity = "running"
                        else:
                            activity = "walking"
            
            # 更新最后位置
            self.last_positions[person_id] = current_position.tolist()
            
            # 组合结果
            result[person_id] = {
                **person_data,
                "velocity": velocity,
                "direction": direction,
                "activity": activity,
                "pose": pose
            }
        
        return result
    
    def _update_history(self, persons: Dict[str, Dict]):
        """更新人物历史记录"""
        for person_id, person_data in persons.items():
            if person_id not in self.person_history:
                self.person_history[person_id] = []
            
            # 添加到历史记录
            self.person_history[person_id].append({
                "timestamp": self.timestamp,
                "position": person_data["position"],
                "velocity": person_data["velocity"],
                "activity": person_data["activity"]
            })
            
            # 限制历史记录长度
            if len(self.person_history[person_id]) > self.track_buffer:
                self.person_history[person_id].pop(0) 