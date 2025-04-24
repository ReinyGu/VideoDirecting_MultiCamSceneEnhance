#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
WebSocket处理器
提供实时数据推送功能
"""

import json
import asyncio
import logging
from typing import List, Dict, Any, Optional, Set

logger = logging.getLogger(__name__)

class WebSocketHandler:
    """WebSocket连接处理器"""
    
    def __init__(self):
        """初始化处理器"""
        self.connections: Set = set()
        self.broadcast_lock = asyncio.Lock()
        
    async def register(self, websocket):
        """注册新的WebSocket连接"""
        self.connections.add(websocket)
        logger.info(f"新的WebSocket连接注册，当前连接数: {len(self.connections)}")
        
    async def unregister(self, websocket):
        """注销WebSocket连接"""
        self.connections.remove(websocket)
        logger.info(f"WebSocket连接断开，当前连接数: {len(self.connections)}")
        
    async def broadcast(self, message: Dict[str, Any]):
        """
        向所有连接的客户端广播消息
        
        参数:
            message: 要广播的消息
        """
        if not self.connections:
            return
            
        async with self.broadcast_lock:
            # 将字典转换为JSON字符串
            data = json.dumps(message)
            
            # 广播到所有连接
            send_tasks = []
            for websocket in self.connections:
                send_tasks.append(self._safe_send(websocket, data))
                
            if send_tasks:
                # 等待所有发送任务完成
                await asyncio.gather(*send_tasks, return_exceptions=True)
                
    async def _safe_send(self, websocket, data: str):
        """
        安全地发送消息，处理可能的异常
        
        参数:
            websocket: WebSocket连接
            data: 要发送的数据
        """
        try:
            await websocket.send(data)
        except Exception as e:
            logger.error(f"发送消息时出错: {str(e)}")
            # 从连接列表中移除失败的连接
            self.connections.discard(websocket) 