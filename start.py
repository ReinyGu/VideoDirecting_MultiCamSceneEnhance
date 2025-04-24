#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
多摄像机导播系统启动脚本
同时启动后端服务和前端开发服务器
"""

import os
import time
import subprocess
import platform
import argparse
import signal

# 设置路径
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(PROJECT_DIR, 'backend')
UI_DIR = os.path.join(PROJECT_DIR, 'ui')

# 创建目录
def ensure_dirs():
    """确保必要的目录存在"""
    os.makedirs(os.path.join(BACKEND_DIR, 'vision_tracking', 'models'), exist_ok=True)
    os.makedirs(os.path.join(BACKEND_DIR, 'test_videos'), exist_ok=True)

# 检查Python环境
def check_python_env():
    """检查Python环境是否正确"""
    try:
        import numpy
        import torch
        import cv2
        import fastapi
        print("Python环境检查通过。")
        return True
    except ImportError as e:
        print(f"Python环境检查失败: {e}")
        print("请先安装所需依赖: pip install -r backend/requirements.txt")
        return False

# 检查Node.js环境
def check_node_env():
    """检查Node.js环境是否正确"""
    try:
        result = subprocess.run(
            ['node', '--version'], 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True
        )
        if result.returncode != 0:
            print(f"Node.js检查失败: {result.stderr}")
            return False
            
        print(f"Node.js版本: {result.stdout.strip()}")
        
        # 检查npm
        result = subprocess.run(
            ['npm', '--version'], 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True
        )
        if result.returncode != 0:
            print(f"npm检查失败: {result.stderr}")
            return False
            
        print(f"npm版本: {result.stdout.strip()}")
        return True
    except Exception as e:
        print(f"Node.js环境检查失败: {e}")
        print("请安装Node.js和npm。")
        return False

# 启动后端服务
def start_backend():
    """启动后端服务"""
    print("启动后端服务...")
    os.chdir(BACKEND_DIR)
    
    # 在Windows上使用start命令启动新窗口
    if platform.system() == 'Windows':
        return subprocess.Popen(
            ['start', 'cmd', '/k', 'python', 'server.py'],
            shell=True
        )
    # 在类Unix系统上直接启动
    else:
        return subprocess.Popen(
            ['python', 'server.py'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

# 启动前端开发服务器
def start_frontend():
    """启动前端开发服务器"""
    print("启动前端开发服务器...")
    os.chdir(UI_DIR)
    
    # 在Windows上使用start命令启动新窗口
    if platform.system() == 'Windows':
        return subprocess.Popen(
            ['start', 'cmd', '/k', 'npm', 'start'],
            shell=True
        )
    # 在类Unix系统上直接启动
    else:
        return subprocess.Popen(
            ['npm', 'start'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

# 处理信号
def signal_handler(sig, frame):
    """处理Ctrl+C信号"""
    print("\n正在关闭服务...")
    
    # 停止所有子进程
    if 'backend_process' in globals() and backend_process:
        backend_process.terminate()
        
    if 'frontend_process' in globals() and frontend_process:
        frontend_process.terminate()
        
    print("服务已关闭。")
    exit(0)

if __name__ == "__main__":
    # 解析命令行参数
    parser = argparse.ArgumentParser(description='启动多摄像机导播系统')
    parser.add_argument('--backend-only', action='store_true', help='仅启动后端服务')
    parser.add_argument('--frontend-only', action='store_true', help='仅启动前端服务')
    args = parser.parse_args()
    
    # 注册信号处理
    signal.signal(signal.SIGINT, signal_handler)
    
    # 检查环境
    if not args.frontend_only and not check_python_env():
        exit(1)
        
    if not args.backend_only and not check_node_env():
        exit(1)
    
    # 确保目录存在
    ensure_dirs()
    
    # 启动服务
    backend_process = None
    frontend_process = None
    
    try:
        if not args.frontend_only:
            backend_process = start_backend()
            # 等待后端启动
            time.sleep(2)
            
        if not args.backend_only:
            frontend_process = start_frontend()
            
        print("\n系统已启动:")
        if not args.frontend_only:
            print("后端服务运行在 http://localhost:8000")
        if not args.backend_only:
            print("前端服务运行在 http://localhost:3000")
            
        print("\n按Ctrl+C停止服务")
        
        # 保持脚本运行
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        signal_handler(signal.SIGINT, None) 