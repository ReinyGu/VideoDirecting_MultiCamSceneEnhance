import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

// 相机质量评分系统
const calculateCameraScore = (camera, personPosition, cameraData) => {
  if (!camera || !personPosition || !cameraData) return 0;
  
  // 提取相机数据
  const cameraPosition = camera.position;
  const cameraDirection = camera.direction || [0, 0, -1];
  
  // 1. 距离评分 (0-40分)
  const distance = Math.sqrt(
    Math.pow(cameraPosition[0] - personPosition[0], 2) +
    Math.pow(cameraPosition[1] - personPosition[1], 2) +
    Math.pow(cameraPosition[2] - personPosition[2], 2)
  );
  
  let distanceScore = 0;
  if (distance < 3) {
    // 特写
    distanceScore = 40 - (distance / 3) * 10;
  } else if (distance < 10) {
    // 中景
    distanceScore = 30 - ((distance - 3) / 7) * 10;
  } else {
    // 远景
    distanceScore = 20 - Math.min(10, (distance - 10) / 20) * 10;
  }
  
  // 2. 角度评分 (0-30分)
  // 计算相机到人物的方向向量
  const toPerson = [
    personPosition[0] - cameraPosition[0],
    personPosition[1] - cameraPosition[1],
    personPosition[2] - cameraPosition[2]
  ];
  
  // 归一化
  const toPersonLength = Math.sqrt(
    toPerson[0] * toPerson[0] + 
    toPerson[1] * toPerson[1] + 
    toPerson[2] * toPerson[2]
  );
  
  const toPersonNorm = [
    toPerson[0] / toPersonLength,
    toPerson[1] / toPersonLength,
    toPerson[2] / toPersonLength
  ];
  
  // 计算点积 (相机方向与人物方向的夹角余弦)
  const dotProduct = 
    cameraDirection[0] * toPersonNorm[0] +
    cameraDirection[1] * toPersonNorm[1] +
    cameraDirection[2] * toPersonNorm[2];
  
  // 点积范围从-1到1，1表示完全相同方向
  const angleScore = 30 * (dotProduct * 0.5 + 0.5);
  
  // 3. 构图评分 (0-30分)
  // 这需要实际渲染结果分析，简化为固定值
  const compositionScore = 25;
  
  // 计算总分 (0-100)
  const totalScore = Math.min(100, distanceScore + angleScore + compositionScore);
  
  return Math.round(totalScore);
};

// 单个相机预览
const CameraPreview = ({ 
  cameraId, 
  cameraData, 
  personPosition, 
  isActive, 
  score,
  onClick 
}) => {
  if (!cameraData) return null;
  
  const camera = cameraData[cameraId];
  if (!camera) return null;
  
  // 根据评分确定边框颜色
  let borderColor = "#333";
  if (score > 80) {
    borderColor = "#4CAF50"; // 绿色 - 优
  } else if (score > 60) {
    borderColor = "#FFC107"; // 黄色 - 良
  } else {
    borderColor = "#F44336"; // 红色 - 差
  }
  
  // 如果是激活的相机，使用蓝色高亮
  if (isActive) {
    borderColor = "#2196F3";
  }
  
  return (
    <div 
      className="camera-preview"
      style={{
        border: `2px solid ${borderColor}`,
        boxShadow: isActive ? "0 0 10px rgba(33, 150, 243, 0.8)" : "none"
      }}
      onClick={onClick}
    >
      <div className="preview-canvas">
        <Canvas>
          {/* 简单渲染相机视角的场景 */}
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          
          {/* 人物位置指示器 */}
          {personPosition && (
            <mesh position={[personPosition[0], personPosition[1], personPosition[2]]}>
              <sphereGeometry args={[0.2, 16, 16]} />
              <meshStandardMaterial color="red" />
            </mesh>
          )}
          
          {/* 地面网格 */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
            <planeGeometry args={[10, 10]} />
            <meshStandardMaterial color="#555" wireframe />
          </mesh>
          
          {/* 设置与实际相机相同的视角 */}
          <OrbitControls 
            enableZoom={false} 
            enablePan={false} 
            enableRotate={false}
            target={[personPosition ? personPosition[0] : 0, personPosition ? personPosition[1] : 0, personPosition ? personPosition[2] : 0]}
          />
          
          <PerspectiveCamera 
            position={[camera.position[0], camera.position[1], camera.position[2]]}
            fov={60}
            aspect={1}
            makeDefault
          />
        </Canvas>
      </div>
      
      <div className="preview-info">
        <div className="camera-name">相机 {cameraId}</div>
        <div className="camera-score">评分: {score}</div>
        {camera.label && <div className="camera-label">{camera.label}</div>}
      </div>
    </div>
  );
};

// 特殊组件: PerspectiveCamera - 模拟普通相机视角
const PerspectiveCamera = ({ position, fov, aspect, children }) => {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
  camera.position.set(position[0], position[1], position[2]);
  
  return <primitive object={camera} />;
};

// 主相机预览条组件
const CameraPreviewBar = ({ 
  sceneData,
  personPosition,
  activeCamera,
  onCameraChange
}) => {
  const [camerasWithScores, setCamerasWithScores] = useState([]);
  
  useEffect(() => {
    if (!sceneData || !sceneData.cameras || !personPosition) return;
    
    // 计算每个相机的评分
    const newCamerasWithScores = Object.keys(sceneData.cameras).map(cameraId => {
      const score = calculateCameraScore(
        sceneData.cameras[cameraId], 
        personPosition,
        sceneData.cameras
      );
      
      return {
        id: cameraId,
        score: score
      };
    });
    
    // 按评分排序 (高分优先)
    newCamerasWithScores.sort((a, b) => b.score - a.score);
    
    setCamerasWithScores(newCamerasWithScores);
  }, [sceneData, personPosition]);
  
  // 如果没有相机数据或人物位置，则不显示
  if (!sceneData || !sceneData.cameras || !personPosition) {
    return <div className="empty-preview-bar">未加载场景或未选择人物位置</div>;
  }
  
  return (
    <div className="camera-preview-bar">
      {camerasWithScores.map(camera => (
        <CameraPreview
          key={camera.id}
          cameraId={camera.id}
          cameraData={sceneData.cameras}
          personPosition={personPosition}
          isActive={activeCamera === camera.id}
          score={camera.score}
          onClick={() => onCameraChange(camera.id)}
        />
      ))}
    </div>
  );
};

export default CameraPreviewBar; 