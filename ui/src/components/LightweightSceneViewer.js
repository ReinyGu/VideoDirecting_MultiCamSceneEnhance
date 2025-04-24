import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';

// 轻量级场景渲染组件
function LightweightSceneViewer({ 
  sceneData, 
  activeCamera,
  onCameraChange,
  showStructuralLines = true,
  personPosition = null,
  samplingDensity = 0.1, // 采样密度，0.1表示只渲染10%的点
  maxPoints = 10000, // 最大渲染点数
  showPointCloudOutlines = true, // 是否显示点云轮廓线
  personsData = [], // 人物跟踪数据
  trajectoryHistory = {}, // 轨迹历史
  cameraRelations = {}, // 相机与人物关系
  recommendedCamera = null, // 推荐相机
}) {
  return (
    <Canvas>
      <SceneContent 
        sceneData={sceneData} 
        activeCamera={activeCamera} 
        onCameraSelect={onCameraChange}
        showStructuralLines={showStructuralLines}
        personPosition={personPosition}
        samplingDensity={samplingDensity}
        maxPoints={maxPoints}
        showPointCloudOutlines={showPointCloudOutlines}
        personsData={personsData}
        trajectoryHistory={trajectoryHistory}
        cameraRelations={cameraRelations}
        recommendedCamera={recommendedCamera}
      />
      <OrbitControls />
    </Canvas>
  );
}

// 简化的点云渲染组件
const SimplifiedPointCloud = ({ points, colors, density = 0.1, maxPoints = 10000 }) => {
  // 如果没有点数据，返回null
  if (!points || points.length === 0) return null;
  
  // 对点进行采样，仅保留部分点以减轻渲染负担
  const { sampledPoints, sampledColors } = useMemo(() => {
    // 首先确定采样间隔
    const totalPoints = points.length / 3;
    let interval = Math.max(1, Math.floor(1 / density));
    
    // 如果即使用最大间隔仍然超过最大点数，则进一步增加间隔
    if (totalPoints / interval > maxPoints) {
      interval = Math.ceil(totalPoints / maxPoints);
    }
    
    console.log(`点云采样: 总点数=${totalPoints}, 间隔=${interval}, 采样后点数≈${Math.floor(totalPoints/interval)}`);
    
    // 创建采样后的数组
    const sampledPointsArray = [];
    const sampledColorsArray = [];
    
    // 改进采样策略：使用重要性采样
    // 基于点的位置和颜色变化来决定保留哪些点
    // 这样可以保留更多边缘和细节区域的点
    let lastPoint = null;
    let lastColor = null;
    let importanceThreshold = 0.01; // 重要性阈值
    
    for (let i = 0; i < totalPoints; i++) {
      const idx = i * 3;
      if (idx + 2 < points.length) {
        const currentPoint = [points[idx], points[idx+1], points[idx+2]];
        let isImportant = false;
        
        // 计算与上一个点的差异
        if (lastPoint) {
          const dx = currentPoint[0] - lastPoint[0];
          const dy = currentPoint[1] - lastPoint[1];
          const dz = currentPoint[2] - lastPoint[2];
          const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
          
          // 如果距离较大，认为是重要点
          if (distance > importanceThreshold) {
            isImportant = true;
          }
          
          // 如果有颜色且颜色差异大，也认为是重要点
          if (colors && lastColor) {
            const currentColor = [colors[idx], colors[idx+1], colors[idx+2]];
            const dr = currentColor[0] - lastColor[0];
            const dg = currentColor[1] - lastColor[1];
            const db = currentColor[2] - lastColor[2];
            const colorDiff = Math.sqrt(dr*dr + dg*dg + db*db);
            
            if (colorDiff > 0.1) { // 颜色差异阈值
              isImportant = true;
            }
          }
        }
        
        // 如果是满足间隔的点或者是重要点，则保留
        if (i % interval === 0 || isImportant) {
          sampledPointsArray.push(currentPoint[0], currentPoint[1], currentPoint[2]);
          
          // 如果有颜色数据，也进行相应采样
          if (colors && colors.length >= points.length) {
            sampledColorsArray.push(colors[idx], colors[idx+1], colors[idx+2]);
            lastColor = [colors[idx], colors[idx+1], colors[idx+2]];
          }
          
          lastPoint = currentPoint;
        }
      }
    }
    
    // 如果采样后的点数仍然超过了最大点数，再次采样
    if (sampledPointsArray.length / 3 > maxPoints) {
      const resampleInterval = Math.ceil((sampledPointsArray.length / 3) / maxPoints);
      const finalPoints = [];
      const finalColors = sampledColorsArray.length > 0 ? [] : null;
      
      for (let i = 0; i < sampledPointsArray.length / 3; i += resampleInterval) {
        const idx = i * 3;
        if (idx + 2 < sampledPointsArray.length) {
          finalPoints.push(sampledPointsArray[idx], sampledPointsArray[idx+1], sampledPointsArray[idx+2]);
          
          if (finalColors) {
            finalColors.push(sampledColorsArray[idx], sampledColorsArray[idx+1], sampledColorsArray[idx+2]);
          }
        }
      }
      
      return {
        sampledPoints: new Float32Array(finalPoints),
        sampledColors: finalColors ? new Float32Array(finalColors) : null
      };
    }
    
    return {
      sampledPoints: new Float32Array(sampledPointsArray),
      sampledColors: sampledColorsArray.length > 0 ? new Float32Array(sampledColorsArray) : null
    };
  }, [points, colors, density, maxPoints]);
  
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={sampledPoints.length / 3}
          array={sampledPoints}
          itemSize={3}
        />
        {sampledColors && (
          <bufferAttribute
            attach="attributes-color"
            count={sampledColors.length / 3}
            array={sampledColors}
            itemSize={3}
          />
        )}
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        vertexColors={!!sampledColors}
        sizeAttenuation={true}
      />
    </points>
  );
};

// 场景外观模型 - 使用几何体表示主要形状
const SceneVolume = ({ boundingBoxes }) => {
  if (!boundingBoxes || boundingBoxes.length === 0) return null;
  
  return (
    <group>
      {boundingBoxes.map((box, index) => (
        <mesh key={`volume-${index}`} position={box.center}>
          <boxGeometry args={[box.size[0], box.size[1], box.size[2]]} />
          <meshStandardMaterial 
            color={box.color || "#aaaaaa"} 
            transparent={true}
            opacity={0.2}
            wireframe={true}
          />
        </mesh>
      ))}
    </group>
  );
};

// 相机对象渲染组件
function CameraObject({ position, direction, label, isActive, onSelect }) {
  return (
    <group onClick={onSelect}>
      {/* 相机本体 */}
      <mesh position={position}>
        <boxGeometry args={[0.3, 0.3, 0.5]} />
        <meshStandardMaterial color={isActive ? '#ff0000' : '#4285f4'} />
      </mesh>
      
      {/* 相机朝向线 */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([
              ...position,
              position[0] + direction[0] * 0.8,
              position[1] + direction[1] * 0.8,
              position[2] + direction[2] * 0.8
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={isActive ? '#ff0000' : '#4285f4'} />
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
      >
        {label || `相机 ${isActive ? '(激活)' : ''}`}
      </Text>
    </group>
  );
}

// 人物位置渲染
function PersonPosition({ position, direction, size = { height: 1.8, width: 0.5, depth: 0.3 } }) {
  if (!position) return null;
  
  // 根据朝向计算旋转
  const rotationY = Math.atan2(direction[0], direction[2]);
  
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 人物躯干 */}
      <mesh position={[0, size.height/2, 0]}>
        <boxGeometry args={[size.width, size.height, size.depth]} />
        <meshStandardMaterial color="#ff6600" />
      </mesh>
      
      {/* 人物头部 */}
      <mesh position={[0, size.height + 0.1, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color="#ffaa00" />
      </mesh>
      
      <Text
        position={[0, size.height + 0.5, 0]}
        color="#ffffff"
        fontSize={0.2}
      >
        人物
      </Text>
    </group>
  );
}

// 轨迹线渲染
function TrajectoryLine({ points, color = "#ff6600" }) {
  if (!points || points.length < 2) return null;
  
  const linePoints = useMemo(() => {
    return new Float32Array(points.flat());
  }, [points]);
  
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length}
          array={linePoints}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} linewidth={2} />
    </line>
  );
}

// 相机视锥体渲染
function CameraFrustum({ camera, isActive, isRecommended, relation = null }) {
  const { position, direction, fov = 60, aspectRatio = 16/9, near = 0.1, far = 5 } = camera;
  
  // 计算视锥体的8个顶点
  const frustumPoints = useMemo(() => {
    const cam = new THREE.PerspectiveCamera(fov, aspectRatio, near, far);
    cam.position.set(0, 0, 0);
    cam.lookAt(0, 0, -1);
    cam.updateMatrixWorld();
    
    // 创建视锥体
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);
    
    // 计算视锥体的8个顶点
    const halfFovRad = THREE.MathUtils.degToRad(fov / 2);
    const halfWidth = Math.tan(halfFovRad) * far * aspectRatio;
    const halfHeight = Math.tan(halfFovRad) * far;
    
    // 近平面四个点
    const nearTopLeft = new THREE.Vector3(-near * aspectRatio * Math.tan(halfFovRad), near * Math.tan(halfFovRad), -near);
    const nearTopRight = new THREE.Vector3(near * aspectRatio * Math.tan(halfFovRad), near * Math.tan(halfFovRad), -near);
    const nearBottomLeft = new THREE.Vector3(-near * aspectRatio * Math.tan(halfFovRad), -near * Math.tan(halfFovRad), -near);
    const nearBottomRight = new THREE.Vector3(near * aspectRatio * Math.tan(halfFovRad), -near * Math.tan(halfFovRad), -near);
    
    // 远平面四个点
    const farTopLeft = new THREE.Vector3(-halfWidth, halfHeight, -far);
    const farTopRight = new THREE.Vector3(halfWidth, halfHeight, -far);
    const farBottomLeft = new THREE.Vector3(-halfWidth, -halfHeight, -far);
    const farBottomRight = new THREE.Vector3(halfWidth, -halfHeight, -far);
    
    return [
      nearTopLeft, nearTopRight, nearBottomRight, nearBottomLeft,
      farTopLeft, farTopRight, farBottomRight, farBottomLeft
    ];
  }, [fov, aspectRatio, near, far]);
  
  // 计算视锥体的12条边
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0], // 近平面
    [4, 5], [5, 6], [6, 7], [7, 4], // 远平面
    [0, 4], [1, 5], [2, 6], [3, 7]  // 连接边
  ];
  
  // 计算颜色
  let frustumColor = isActive ? '#ff0000' : '#4285f4';
  if (isRecommended) frustumColor = '#ffcc00';
  
  // 根据关系调整透明度
  let opacity = 0.5;
  if (relation && relation.isVisible) {
    opacity = Math.max(0.3, relation.qualityScore);
  } else if (relation && !relation.isVisible) {
    opacity = 0.2;
  }
  
  // 创建旋转矩阵
  const rotationMatrix = useMemo(() => {
    // 从方向向量计算旋转
    const zAxis = new THREE.Vector3(direction[0], direction[1], direction[2]).normalize();
    const xAxis = new THREE.Vector3(1, 0, 0);
    if (Math.abs(zAxis.y) > 0.99) {
      xAxis.set(0, 0, 1);
    }
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
    xAxis.crossVectors(yAxis, zAxis).normalize();
    
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(xAxis, yAxis, zAxis.negate()); // 相机看向-z方向
    
    return rotMatrix;
  }, [direction]);
  
  return (
    <group position={position}>
      {/* 视锥体线框 */}
      {edges.map((edge, index) => {
        const start = frustumPoints[edge[0]].clone().applyMatrix4(rotationMatrix);
        const end = frustumPoints[edge[1]].clone().applyMatrix4(rotationMatrix);
        
        return (
          <line key={`edge-${index}`}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array([
                  start.x, start.y, start.z,
                  end.x, end.y, end.z
                ])}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color={frustumColor} transparent opacity={opacity} />
          </line>
        );
      })}
      
      {/* 远平面 */}
      <mesh>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={4}
            array={new Float32Array([
              ...frustumPoints[4].clone().applyMatrix4(rotationMatrix).toArray(),
              ...frustumPoints[5].clone().applyMatrix4(rotationMatrix).toArray(),
              ...frustumPoints[6].clone().applyMatrix4(rotationMatrix).toArray(),
              ...frustumPoints[7].clone().applyMatrix4(rotationMatrix).toArray()
            ])}
            itemSize={3}
          />
          <bufferAttribute
            attach="index"
            array={new Uint16Array([0, 1, 2, 0, 2, 3])}
            count={6}
            itemSize={1}
          />
        </bufferGeometry>
        <meshBasicMaterial color={frustumColor} transparent opacity={opacity * 0.3} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// 人物与相机关系线
function PersonCameraRelationLine({ personPosition, cameraPosition, isVisible, qualityScore = 0.5 }) {
  if (!personPosition || !cameraPosition) return null;
  
  // 根据可见性和质量调整颜色和透明度
  const color = isVisible ? 
    (qualityScore > 0.7 ? '#4CAF50' : qualityScore > 0.4 ? '#FFC107' : '#F44336') : 
    '#888888';
  
  const opacity = isVisible ? Math.max(0.3, qualityScore) : 0.2;
  
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={2}
          array={new Float32Array([
            ...personPosition,
            ...cameraPosition
          ])}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={opacity} linewidth={2} />
    </line>
  );
}

// 点云轮廓线提取和渲染组件
const PointCloudOutlines = ({ points, density = 0.2, lineWidth = 1, color = "#00ff00" }) => {
  if (!points || points.length === 0) return null;
  
  const outlineGeometry = useMemo(() => {
    // 首先对点进行网格化处理，以便识别轮廓
    const voxelSize = 0.1; // 体素大小
    const voxelGrid = {}; // 使用哈希表存储体素
    const edges = []; // 存储检测到的边缘
    
    // 将点云放入体素网格
    for (let i = 0; i < points.length; i += 3) {
      if (i + 2 < points.length) {
        // 计算体素坐标
        const vx = Math.floor(points[i] / voxelSize);
        const vy = Math.floor(points[i+1] / voxelSize);
        const vz = Math.floor(points[i+2] / voxelSize);
        const voxelKey = `${vx},${vy},${vz}`;
        
        // 在体素中放入点
        if (!voxelGrid[voxelKey]) {
          voxelGrid[voxelKey] = {
            count: 0,
            x: points[i],
            y: points[i+1],
            z: points[i+2]
          };
        }
        voxelGrid[voxelKey].count++;
      }
    }
    
    // 检测边缘体素（周围有空体素的体素）
    const directions = [
      [1,0,0], [-1,0,0],
      [0,1,0], [0,-1,0],
      [0,0,1], [0,0,-1]
    ];
    
    const edgeVoxels = [];
    
    // 找出边缘体素
    Object.keys(voxelGrid).forEach(key => {
      const [vx, vy, vz] = key.split(',').map(Number);
      let emptyNeighbors = 0;
      
      // 检查六个方向的邻居
      for (const [dx, dy, dz] of directions) {
        const neighborKey = `${vx+dx},${vy+dy},${vz+dz}`;
        if (!voxelGrid[neighborKey]) {
          emptyNeighbors++;
        }
      }
      
      // 如果至少有一个方向是空的，认为这是边缘
      if (emptyNeighbors > 0) {
        edgeVoxels.push(voxelGrid[key]);
      }
    });
    
    // 创建边缘线
    // 我们将相邻的边缘体素连接起来
    const vertices = [];
    const processed = {};
    
    // 为简单起见，我们使用随机方式连接一些边缘点
    // 在实际应用中，可以使用更复杂的算法，如RANSAC或最小生成树
    const edgeSampleCount = Math.min(edgeVoxels.length, 5000); // 限制边缘采样数量
    const samplingStep = Math.max(1, Math.floor(edgeVoxels.length / edgeSampleCount));
    
    const sampledEdges = [];
    for (let i = 0; i < edgeVoxels.length; i += samplingStep) {
      if (i < edgeVoxels.length) {
        sampledEdges.push(edgeVoxels[i]);
      }
    }
    
    // 使用最近邻连接形成线条
    for (let i = 0; i < sampledEdges.length; i++) {
      const current = sampledEdges[i];
      const key = `${current.x.toFixed(3)},${current.y.toFixed(3)},${current.z.toFixed(3)}`;
      
      if (processed[key]) continue;
      processed[key] = true;
      
      // 找到最近的未处理点
      let nearestIdx = -1;
      let minDist = Infinity;
      
      for (let j = 0; j < sampledEdges.length; j++) {
        if (i === j) continue;
        
        const other = sampledEdges[j];
        const otherKey = `${other.x.toFixed(3)},${other.y.toFixed(3)},${other.z.toFixed(3)}`;
        
        if (processed[otherKey]) continue;
        
        const dx = current.x - other.x;
        const dy = current.y - other.y;
        const dz = current.z - other.z;
        const dist = dx*dx + dy*dy + dz*dz;
        
        if (dist < minDist && dist < voxelSize * voxelSize * 4) { // 距离阈值
          minDist = dist;
          nearestIdx = j;
        }
      }
      
      // 如果找到最近点，添加一条边
      if (nearestIdx >= 0) {
        const nearest = sampledEdges[nearestIdx];
        vertices.push(current.x, current.y, current.z);
        vertices.push(nearest.x, nearest.y, nearest.z);
        
        // 标记为已处理
        const nearestKey = `${nearest.x.toFixed(3)},${nearest.y.toFixed(3)},${nearest.z.toFixed(3)}`;
        processed[nearestKey] = true;
      }
    }
    
    // 创建最终的几何体
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geometry;
  }, [points]);
  
  return (
    <lineSegments geometry={outlineGeometry}>
      <lineBasicMaterial color={color} linewidth={lineWidth} />
    </lineSegments>
  );
};

// 场景内容组件
function SceneContent({ 
  sceneData, 
  activeCamera, 
  onCameraSelect,
  showStructuralLines = true,
  personPosition = null,
  samplingDensity = 0.1,
  maxPoints = 10000,
  showPointCloudOutlines = true,
  personsData = [],
  trajectoryHistory = {},
  cameraRelations = {},
  recommendedCamera = null
}) {
  const { scene } = useThree();
  
  // 设置场景灯光
  useEffect(() => {
    // 添加环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    // 添加方向光
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);
    
    return () => {
      scene.remove(ambientLight);
      scene.remove(dirLight);
    };
  }, [scene]);
  
  // 如果没有场景数据，显示占位符
  if (!sceneData) {
    return (
      <Text position={[0, 0, 0]} color="#ffffff" fontSize={0.5}>
        无场景数据
        </Text>
    );
  }
  
  // 从点云数据中提取点和颜色
  const { points, colors } = extractPointCloudData();
    
  // 创建场景体积模型
  const sceneBoundingBoxes = createSceneBoundingBoxes();
            
  // 从sceneData提取相机数据
  const cameras = sceneData.cameras || {};
          
  // 提取点云数据
  function extractPointCloudData() {
    if (!sceneData.point_cloud || !sceneData.point_cloud.points) {
      return { points: null, colors: null };
    }
    
    return {
      points: sceneData.point_cloud.points.flat(),
      colors: sceneData.point_cloud.colors ? sceneData.point_cloud.colors.flat() : null
    };
  }
  
  // 创建场景边界框
  function createSceneBoundingBoxes() {
    if (!sceneData.bounds) return [];
    
    const { min, max } = sceneData.bounds;
    const center = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2
    ];
    
    const size = [
      max[0] - min[0],
      max[1] - min[1],
      max[2] - min[2]
    ];
    
    return [
      {
        center,
        size,
        color: "#aaaaaa"
      }
    ];
  }
  
  // 准备轨迹数据
  const trajectoryPoints = useMemo(() => {
    const result = {};
    
    Object.keys(trajectoryHistory).forEach(personId => {
      const history = trajectoryHistory[personId] || [];
      const points = history.map(item => item.position);
      if (points.length >= 2) {
        result[personId] = points;
      }
    });
    
    return result;
  }, [trajectoryHistory]);
  
  return (
    <group>
      {/* 点云渲染 */}
        <SimplifiedPointCloud
          points={points}
          colors={colors}
          density={samplingDensity}
          maxPoints={maxPoints}
        />
      
      {/* 点云轮廓线 */}
      {showPointCloudOutlines && points && (
        <PointCloudOutlines
          points={points}
          density={samplingDensity / 5}
          color="#00ffff"
        />
      )}
      
      {/* 场景体积模型 */}
      <SceneVolume boundingBoxes={sceneBoundingBoxes} />
      
      {/* 相机对象 */}
      {Object.keys(cameras).map(cameraId => {
        const camera = cameras[cameraId];
        return (
          <group key={`camera-group-${cameraId}`}>
        <CameraObject 
              position={camera.position}
              direction={camera.direction}
              label={camera.label}
              isActive={cameraId === activeCamera}
              onSelect={() => onCameraSelect(cameraId)}
        />
            <CameraFrustum
              camera={camera}
              isActive={cameraId === activeCamera}
              isRecommended={cameraId === recommendedCamera}
              relation={
                personsData.length > 0 && 
                cameraRelations[personsData[0].id] ? 
                cameraRelations[personsData[0].id][cameraId] : null
              }
            />
          </group>
        );
      })}
      
      {/* 人物对象 */}
      {personsData.map(person => (
        <group key={`person-group-${person.id}`}>
          <PersonPosition 
            position={person.position} 
            direction={person.direction}
            size={person.size}
          />
          
          {/* 人物轨迹 */}
          {trajectoryPoints[person.id] && (
            <TrajectoryLine 
              points={trajectoryPoints[person.id]} 
              color="#ff6600"
            />
          )}
          
          {/* 人物与相机关系线 */}
          {Object.keys(cameras).map(cameraId => {
            const camera = cameras[cameraId];
            const relation = cameraRelations[person.id] ? 
                           cameraRelations[person.id][cameraId] : null;
            
            if (!relation) return null;
            
            return (
              <PersonCameraRelationLine
                key={`relation-${person.id}-${cameraId}`}
                personPosition={person.position}
                cameraPosition={camera.position}
                isVisible={relation.isVisible}
                qualityScore={relation.qualityScore}
              />
            );
          })}
        </group>
      ))}
      
      {/* 如果没有人物数据但有人物位置，显示简单的人物标记 */}
      {personPosition && personsData.length === 0 && (
        <PersonPosition position={personPosition} direction={[1, 0, 0]} />
      )}
    </group>
  );
}

export default LightweightSceneViewer; 