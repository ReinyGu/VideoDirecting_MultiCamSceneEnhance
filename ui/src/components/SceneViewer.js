import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';

// 场景中的相机对象组件
function CameraObject({ position, direction, label, isActive, onSelect }) {
  // 创建相机视锥体表示
  const cameraLength = 0.8;
  const cameraWidth = 0.5;
  
  return (
    <group onClick={onSelect}>
      {/* 相机本体 */}
      <mesh position={position}>
        <boxGeometry args={[0.3, 0.3, 0.5]} />
        <meshStandardMaterial color={isActive ? '#ff0000' : '#4285f4'} />
      </mesh>
      
      {/* 相机朝向线 */}
      <line>
        <bufferGeometry attach="geometry">
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([
              ...position,
              ...(new THREE.Vector3(
                position[0] + direction[0] * cameraLength,
                position[1] + direction[1] * cameraLength,
                position[2] + direction[2] * cameraLength
              ).toArray())
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial attach="material" color={isActive ? '#ff0000' : '#4285f4'} />
      </line>
      
      {/* 相机标签 */}
      <Text
        position={[
          position[0] + 0.3,
          position[1] + 0.3,
          position[2] + 0.3
        ]}
        color="#ffffff"
        fontSize={0.15}
        anchorX="left"
        anchorY="middle"
      >
        {label || `相机 ${isActive ? '(激活)' : ''}`}
      </Text>
    </group>
  );
}

// 结构线组件
function StructuralLine({ lineData, length = 10.0, color = "#ffff00" }) {
  const { point, direction } = lineData;
  
  // 创建线的两个端点
  const p1 = new THREE.Vector3(
    point[0] - direction[0] * length/2,
    point[1] - direction[1] * length/2,
    point[2] - direction[2] * length/2
  );
  
  const p2 = new THREE.Vector3(
    point[0] + direction[0] * length/2,
    point[1] + direction[1] * length/2,
    point[2] + direction[2] * length/2
  );
  
  return (
    <line>
      <bufferGeometry attach="geometry">
        <bufferAttribute
          attach="attributes-position"
          count={2}
          array={new Float32Array([
            p1.x, p1.y, p1.z,
            p2.x, p2.y, p2.z
          ])}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial attach="material" color={color} linewidth={2} />
    </line>
  );
}

// 人物位置组件
function PersonPosition({ position, visibleCameras = {} }) {
  if (!position) return null;
  
  return (
    <group>
      {/* 人物标记 */}
      <mesh position={position}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color="#ff6600" />
      </mesh>
      
      {/* 人物标签 */}
      <Text
        position={[position[0], position[1] + 0.5, position[2]]}
        color="#ffffff"
        fontSize={0.2}
      >
        人物位置
      </Text>
      
      {/* 与可见相机的连线 */}
      {Object.entries(visibleCameras).map(([camId, camData]) => (
        <line key={`person-to-camera-${camId}`}>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([
                ...position,
                ...camData.position
              ])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial 
            attach="material" 
            color="#ff6600" 
            opacity={0.5} 
            transparent={true}
            linewidth={1}
            dashed={true}
          />
        </line>
      ))}
    </group>
  );
}

// 场景中的结构对象组件
function StructureObject({ structure, isVisible, onSelect, isTracked, trackingColor }) {
  const { center, sample_points, sample_colors, id, point_count } = structure;
  
  // 使用点云表示结构
  const pointsArray = [];
  const colorsArray = [];
  
  // 填充点数据
  if (sample_points) {
    sample_points.forEach((point, index) => {
      pointsArray.push(point[0], point[1], point[2]);
      
      // 如果有对应的颜色，使用它；否则使用默认颜色
      if (sample_colors && sample_colors[index]) {
        colorsArray.push(sample_colors[index][0], sample_colors[index][1], sample_colors[index][2]);
      } else {
        // 根据结构ID生成颜色
        const color = new THREE.Color().setHSL(id * 0.1 % 1, 0.8, 0.5);
        colorsArray.push(color.r, color.g, color.b);
      }
    });
  }
  
  return (
    <group onClick={() => onSelect && onSelect(id)}>
      {/* 结构中心 */}
      <mesh position={center}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={isTracked ? trackingColor : (isVisible ? "#ffff00" : "#666666")} />
      </mesh>
      
      {/* 点云 */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={pointsArray.length / 3}
            array={new Float32Array(pointsArray)}
            itemSize={3}
            normalized={false}
          />
          <bufferAttribute
            attach="attributes-color"
            count={colorsArray.length / 3}
            array={new Float32Array(colorsArray)}
            itemSize={3}
            normalized={false}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.05}
          vertexColors
          opacity={isVisible ? 1.0 : 0.3}
          transparent={!isVisible}
        />
      </points>
      
      {/* 结构标签 */}
      <Text
        position={[center[0], center[1] + 0.2, center[2]]}
        color={isVisible ? "#ffffff" : "#aaaaaa"}
        fontSize={0.15}
      >
        {`${isTracked ? "👤 " : ""}结构 ${id} (${point_count}点)`}
      </Text>
    </group>
  );
}

// 主场景查看器组件
function SceneViewer({ 
  sceneData, 
  activeCamera, 
  onCameraChange,
  showStructuralLines = true,
  personPosition = null,
  personAnalysis = null,
  detectedPersons = [],
  trackedStructureIds = [],
  onPersonSelect,
  onStructureSelect,
  structurePositions = {},
  structureTrails = {},
  structureColorMap = {},
  isTracking = false
}) {
  return (
    <Canvas>
      <SceneContent 
        sceneData={sceneData} 
        activeCamera={activeCamera} 
        onCameraSelect={onCameraChange}
        showStructuralLines={showStructuralLines}
        personPosition={personPosition}
        personVisibleCameras={personAnalysis?.visible_cameras || {}}
        detectedPersons={detectedPersons}
        trackedStructureIds={trackedStructureIds}
        onPersonSelect={onPersonSelect}
        onStructureSelect={onStructureSelect}
        structurePositions={structurePositions}
        structureTrails={structureTrails}
        structureColorMap={structureColorMap}
        isTracking={isTracking}
      />
      <OrbitControls />
    </Canvas>
  );
}

// 场景内容组件
function SceneContent({ 
  sceneData, 
  activeCamera, 
  onCameraSelect,
  showStructuralLines = true,
  personPosition = null,
  personVisibleCameras = {},
  detectedPersons = [],
  trackedStructureIds = [],
  onPersonSelect,
  onStructureSelect = null,
  structurePositions = {},
  structureTrails = {},
  structureColorMap = {},
  isTracking = false
}) {
  const { camera } = useThree();
  
  useEffect(() => {
    if (sceneData && sceneData.cameras && sceneData.cameras[activeCamera]) {
      // 获取当前活动相机
      const cam = sceneData.cameras[activeCamera];
      const pos = cam.position;
      const dir = cam.direction;
      
      // 设置渲染相机的位置
      // 在相机背后稍微上方一点的位置，以便看到相机模型
      camera.position.set(
        pos[0] - dir[0] * 3 + 0,
        pos[1] - dir[1] * 3 + 2,
        pos[2] - dir[2] * 3 + 0
      );
      
      // 让渲染相机看向场景中心
      camera.lookAt(new THREE.Vector3(0, 0, 0));
    }
  }, [activeCamera, sceneData, camera]);
  
  // 处理结构选择，向上传递或替代为人物选择
  const handleStructureSelect = (structureId) => {
    if (onStructureSelect) {
      onStructureSelect(structureId);
    } else if (onPersonSelect) {
      // 如果没有提供结构选择处理，则使用人物选择处理
      onPersonSelect(structureId);
    }
  };
  
  // 如果还没有场景数据，渲染一个简单的占位符
  if (!sceneData) {
    return (
      <>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={'#777777'} />
        </mesh>
        <gridHelper args={[10, 10]} />
        
        {/* 加载提示 */}
        <Text position={[0, 2, 0]} color="#ffffff" fontSize={0.5}>
          等待场景数据加载...
        </Text>
      </>
    );
  }
  
  // 获取当前相机可见的结构ID列表
  const visibleStructures = 
    sceneData.cameras[activeCamera]?.visible_structures || [];
  
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      
      {/* 渲染所有相机对象 */}
      {Object.entries(sceneData.cameras).map(([id, cam]) => (
        <CameraObject 
          key={id}
          position={cam.position}
          direction={cam.direction}
          label={cam.label || `相机 ${id}`}
          isActive={id === activeCamera}
          onSelect={() => onCameraSelect(id)}
        />
      ))}
      
      {/* 渲染结构线 */}
      {showStructuralLines && sceneData.structural_lines && 
        sceneData.structural_lines.map((line) => (
          <StructuralLine key={`line-${line.id}`} lineData={line} />
        ))
      }
      
      {/* 渲染检测到的所有人物 */}
      {detectedPersons && detectedPersons.length > 0 && 
        detectedPersons.map((person) => (
          <group 
            key={`person-${person.id}`}
            onClick={() => onPersonSelect(person.id)}
          >
            {/* 人物标记 */}
            <mesh position={person.position}>
              <sphereGeometry args={[0.25, 16, 16]} />
              <meshStandardMaterial 
                color={trackedStructureIds.includes(person.id) ? "#ff0000" : "#00aaff"} 
              />
            </mesh>
            
            {/* 人物标签 */}
            <Text
              position={[
                person.position[0], 
                person.position[1] + 0.4, 
                person.position[2]
              ]}
              color="#ffffff"
              fontSize={0.15}
            >
              {person.label || `人物 ${person.id}`}
            </Text>
          </group>
        ))
      }
      
      {/* 渲染被跟踪的结构位置和轨迹 */}
      {trackedStructureIds.map(structureId => {
        const position = structurePositions[structureId];
        const trail = structureTrails[structureId];
        const color = structureColorMap[structureId] || "#ff6600";
        
        if (!position) return null;
        
        return (
          <group key={`tracked-${structureId}`}>
            {/* 结构当前位置 */}
            <mesh position={position}>
              <sphereGeometry args={[0.25, 16, 16]} />
              <meshStandardMaterial color={color} />
            </mesh>
            
            {/* 结构标签 */}
            <Text
              position={[
                position[0], 
                position[1] + 0.4, 
                position[2]
              ]}
              color="#ffffff"
              fontSize={0.15}
            >
              {`结构 ${structureId}`}
            </Text>
            
            {/* 结构轨迹 */}
            {isTracking && trail && trail.length > 1 && (
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    count={trail.length}
                    array={new Float32Array(trail.flat())}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={color} linewidth={2} />
              </line>
            )}
          </group>
        );
      })}
      
      {/* 渲染被跟踪的人物位置 */}
      {personPosition && (
        <PersonPosition 
          position={personPosition} 
          visibleCameras={personVisibleCameras} 
        />
      )}
      
      {/* 渲染所有结构对象 */}
      {sceneData.structures && sceneData.structures.map((structure) => (
        <StructureObject
          key={structure.id}
          structure={structure}
          isVisible={visibleStructures.includes(structure.id)}
          onSelect={handleStructureSelect}
          isTracked={trackedStructureIds.includes(structure.id)}
          trackingColor={structureColorMap[structure.id] || "#ff6600"}
        />
      ))}
      
      {/* 场景地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#303030" />
      </mesh>
      
      {/* 辅助网格 */}
      <gridHelper args={[20, 20]} />
    </>
  );
}

export default SceneViewer;