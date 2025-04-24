#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
相机管理器模块
管理多个相机并提供坐标变换功能
"""

import os
import cv2
import numpy as np
import asyncio
from typing import Dict, List, Tuple, Optional, Any

class CameraManager:
    """管理多个相机并提供坐标转换功能"""
    
    def __init__(self, cameras_config: List[Dict[str, Any]]):
        """
        初始化相机管理器
        
        参数:
            cameras_config: 相机配置列表
        """
        self.cameras = {}
        self.active_camera_id = None
        self.frame_buffers = {}
        
        # 加载相机配置
        for camera_config in cameras_config:
            camera_id = camera_config.get("id")
            if not camera_id:
                continue
                
            self.cameras[camera_id] = {
                "id": camera_id,
                "name": camera_config.get("name", f"相机 {camera_id}"),
                "url": camera_config.get("url", ""),
                "position": camera_config.get("position", [0, 0, 0]),
                "direction": camera_config.get("direction", [0, 0, 1]),
                "fov": camera_config.get("fov", 60.0),
                "aspect_ratio": camera_config.get("aspect_ratio", 16/9),
                "camera_matrix": None,
                "dist_coeffs": None,
                "extrinsic_matrix": None
            }
            
            # 设置相机内参矩阵（如果有提供）
            if "camera_matrix" in camera_config:
                self.cameras[camera_id]["camera_matrix"] = np.array(camera_config["camera_matrix"])
            
            # 设置畸变系数（如果有提供）
            if "dist_coeffs" in camera_config:
                self.cameras[camera_id]["dist_coeffs"] = np.array(camera_config["dist_coeffs"])
            
            # 计算外参矩阵（从位置和方向）
            if "position" in camera_config and "direction" in camera_config:
                self.cameras[camera_id]["extrinsic_matrix"] = self._calculate_extrinsic_matrix(
                    camera_config["position"],
                    camera_config["direction"]
                )
            
            # 初始化帧缓冲区
            self.frame_buffers[camera_id] = None
            
        # 如果有相机，设置第一个为活动相机
        if self.cameras:
            self.active_camera_id = list(self.cameras.keys())[0]
            
        # 创建视频捕获对象
        self.captures = {}
        for camera_id, camera in self.cameras.items():
            if camera["url"]:
                self._init_video_capture(camera_id, camera["url"])
                
        print(f"相机管理器初始化完成，共{len(self.cameras)}个相机")
        
    def _init_video_capture(self, camera_id: str, url: str):
        """初始化视频捕获对象"""
        # 根据URL类型选择适当的处理方式
        if url.startswith("rtsp://") or url.startswith("http://") or url.startswith("https://"):
            # 外部流
            self.captures[camera_id] = cv2.VideoCapture(url)
        elif url.isdigit():
            # 本地相机
            self.captures[camera_id] = cv2.VideoCapture(int(url))
        elif os.path.exists(url):
            # 视频文件
            self.captures[camera_id] = cv2.VideoCapture(url)
        else:
            print(f"无法识别的相机URL格式: {url}")
            return
            
        # 检查是否成功打开
        if not self.captures[camera_id].isOpened():
            print(f"无法打开相机: {camera_id} - {url}")
            del self.captures[camera_id]
        else:
            print(f"相机连接成功: {camera_id} - {url}")
    
    def _calculate_extrinsic_matrix(self, position: List[float], direction: List[float]) -> np.ndarray:
        """
        从位置和方向计算相机外参矩阵
        
        参数:
            position: 相机位置 [x, y, z]
            direction: 相机朝向 [dx, dy, dz]
            
        返回:
            4x4外参矩阵
        """
        # 创建旋转矩阵
        # 假设相机的正视方向是z轴负方向
        forward = np.array(direction, dtype=np.float32)
        forward = forward / np.linalg.norm(forward)  # 归一化
        
        # 找一个不与forward平行的向量作为辅助向量
        if abs(forward[1]) < 0.9:
            up = np.array([0.0, 1.0, 0.0])  # 全局Y轴通常是向上的
        else:
            up = np.array([0.0, 0.0, 1.0])  # 如果相机朝上或朝下，选择Z轴
        
        # 计算相机坐标系的三个轴
        z_axis = -forward  # 相机看向的是Z轴负方向
        x_axis = np.cross(up, z_axis)
        x_axis = x_axis / np.linalg.norm(x_axis)
        y_axis = np.cross(z_axis, x_axis)
        
        # 创建旋转矩阵（3x3）
        rotation = np.stack([x_axis, y_axis, z_axis], axis=1)
        
        # 创建完整的4x4变换矩阵
        transform = np.eye(4, dtype=np.float32)
        transform[:3, :3] = rotation
        transform[:3, 3] = np.array(position, dtype=np.float32)
        
        return transform
    
    def set_active_camera(self, camera_id: str) -> bool:
        """设置活动相机"""
        if camera_id in self.cameras:
            self.active_camera_id = camera_id
            return True
        return False
    
    def get_cameras_info(self) -> List[Dict[str, Any]]:
        """获取所有相机信息"""
        return [
            {
                "id": cam_id,
                "name": cam["name"],
                "position": cam["position"],
                "direction": cam["direction"],
                "fov": cam["fov"],
                "is_active": cam_id == self.active_camera_id
            }
            for cam_id, cam in self.cameras.items()
        ]
    
    async def get_frames(self) -> Dict[str, np.ndarray]:
        """
        获取所有相机的当前帧
        
        返回:
            相机ID到帧的映射
        """
        frames = {}
        
        # 对每个相机创建任务
        tasks = []
        for camera_id in self.captures:
            tasks.append(self._capture_frame(camera_id))
        
        # 并行执行所有捕获任务
        if tasks:
            results = await asyncio.gather(*tasks)
            
            # 处理结果
            for camera_id, frame in results:
                frames[camera_id] = frame
        
        return frames
    
    async def _capture_frame(self, camera_id: str) -> Tuple[str, Optional[np.ndarray]]:
        """
        捕获单个相机的帧
        
        参数:
            camera_id: 相机ID
            
        返回:
            相机ID和捕获的帧
        """
        # 检查捕获对象是否存在
        if camera_id not in self.captures:
            return camera_id, None
            
        # 读取帧
        ret, frame = self.captures[camera_id].read()
        
        if not ret:
            # 捕获失败，尝试重新初始化
            if camera_id in self.cameras and "url" in self.cameras[camera_id]:
                print(f"相机 {camera_id} 捕获失败，尝试重新连接...")
                self._init_video_capture(camera_id, self.cameras[camera_id]["url"])
            return camera_id, None
            
        # 更新帧缓冲区
        self.frame_buffers[camera_id] = frame
        
        return camera_id, frame
    
    async def triangulate_position(
        self, 
        camera_ids: List[str], 
        points_2d: List[Tuple[float, float]]
    ) -> Optional[List[float]]:
        """
        三角测量计算3D位置
        
        参数:
            camera_ids: 相机ID列表
            points_2d: 对应的2D点列表
            
        返回:
            3D点坐标 [x, y, z] 或 None
        """
        if len(camera_ids) < 2 or len(camera_ids) != len(points_2d):
            return None
            
        # 收集摄像机投影矩阵
        projection_matrices = []
        for camera_id in camera_ids:
            if camera_id not in self.cameras:
                continue
                
            camera = self.cameras[camera_id]
            
            # 检查是否有相机矩阵和外参矩阵
            if camera["camera_matrix"] is None:
                # 创建默认相机矩阵（根据FOV和宽高比）
                fov_rad = np.deg2rad(camera["fov"])
                focal_length = 1.0 / np.tan(fov_rad / 2)
                aspect_ratio = camera["aspect_ratio"]
                
                # 假设图像大小为1000x1000像素
                camera_matrix = np.array([
                    [focal_length * 1000, 0, 500],
                    [0, focal_length * 1000 / aspect_ratio, 500],
                    [0, 0, 1]
                ])
                camera["camera_matrix"] = camera_matrix
            
            if camera["extrinsic_matrix"] is None:
                # 使用位置和方向计算外参矩阵
                camera["extrinsic_matrix"] = self._calculate_extrinsic_matrix(
                    camera["position"], 
                    camera["direction"]
                )
            
            # 计算投影矩阵 P = K * [R|t]
            K = camera["camera_matrix"]
            RT = camera["extrinsic_matrix"][:3, :]  # 取外参矩阵的前3行
            P = np.dot(K, RT)
            
            projection_matrices.append(P)
        
        # 需要至少两个投影矩阵
        if len(projection_matrices) < 2:
            return None
            
        # 创建DLT矩阵用于三角测量
        A = np.zeros((len(points_2d) * 2, 4))
        
        for i, ((x, y), P) in enumerate(zip(points_2d, projection_matrices)):
            A[i*2] = x * P[2] - P[0]
            A[i*2+1] = y * P[2] - P[1]
        
        # 使用SVD求解最小二乘解
        _, _, Vt = np.linalg.svd(A)
        X = Vt[-1]
        
        # 齐次坐标转换为3D坐标
        X = X / X[3]
        position_3d = X[:3].tolist()
        
        return position_3d
    
    async def get_camera_view(self, camera_id: str, person_position: List[float]) -> Dict[str, Any]:
        """
        计算人物在相机视图中的位置和可见性
        
        参数:
            camera_id: 相机ID
            person_position: 人物3D位置
            
        返回:
            相机视图信息
        """
        if camera_id not in self.cameras:
            return {"visible": False}
            
        camera = self.cameras[camera_id]
        
        # 检查相机矩阵和外参矩阵
        if camera["camera_matrix"] is None or camera["extrinsic_matrix"] is None:
            return {"visible": False}
            
        # 创建人物位置的4D齐次坐标
        person_position_homogeneous = np.array([*person_position, 1.0])
        
        # 计算相机坐标系下的位置
        camera_extrinsic_inverse = np.linalg.inv(camera["extrinsic_matrix"])
        position_camera = np.dot(camera_extrinsic_inverse, person_position_homogeneous)
        
        # 检查是否在相机前方
        if position_camera[2] <= 0:
            return {"visible": False}
            
        # 使用相机矩阵投影到图像平面
        position_image = np.dot(camera["camera_matrix"], position_camera[:3] / position_camera[2])
        
        # 获取图像坐标
        x, y = position_image[0] / position_image[2], position_image[1] / position_image[2]
        
        # 获取当前帧的大小（如果有）
        frame = self.frame_buffers.get(camera_id)
        if frame is not None:
            height, width = frame.shape[:2]
            
            # 检查是否在图像范围内
            in_frame = 0 <= x < width and 0 <= y < height
        else:
            # 使用一个默认值
            width, height = 1000, 1000
            in_frame = 0 <= x < width and 0 <= y < height
        
        # 计算距离
        distance = np.linalg.norm(np.array(person_position) - np.array(camera["position"]))
        
        # 计算人物大致尺寸
        # 假设人物高度是1.7米
        person_height_world = 1.7
        # 粗略估计图像中的高度
        f = camera["camera_matrix"][0, 0]  # 焦距
        person_height_pixels = (f * person_height_world) / position_camera[2]
        
        # 计算人物在画面中的相对位置 (0,0)是中心点
        center_x = x - width / 2
        center_y = y - height / 2
        
        # 归一化到[-1,1]范围
        normalized_x = center_x / (width / 2)
        normalized_y = center_y / (height / 2)
        
        # 计算中心偏移量 (0表示在中心，1表示在边缘)
        center_offset = np.sqrt(normalized_x**2 + normalized_y**2)
        
        return {
            "visible": in_frame,
            "position_2d": [x, y],
            "normalized_position": [normalized_x, normalized_y],
            "distance": distance,
            "center_offset": center_offset,
            "size": person_height_pixels
        }
    
    def release(self):
        """释放所有相机资源"""
        for capture in self.captures.values():
            capture.release()
        self.captures.clear()
        print("已释放所有相机资源") 