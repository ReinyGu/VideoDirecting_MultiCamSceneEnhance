import React, { useState, useEffect } from 'react';
import LightweightSceneViewer from './LightweightSceneViewer';
import * as THREE from 'three';
import trackingService from '../services/trackingService';

function SceneViewerTest() {
  const [sceneData, setSceneData] = useState(null);
  const [activeCamera, setActiveCamera] = useState('0');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // 人物跟踪数据
  const [personsData, setPersonsData] = useState([]);
  // 相机关系数据
  const [cameraRelations, setCameraRelations] = useState({});
  // 推荐相机
  const [recommendedCamera, setRecommendedCamera] = useState(null);
  // 播放控制
  const [isPlaying, setIsPlaying] = useState(false);
  // 当前时间
  const [currentTime, setCurrentTime] = useState(0);
  // 轨迹历史
  const [trajectoryHistory, setTrajectoryHistory] = useState({});
  // WebSocket连接状态
  const [wsConnected, setWsConnected] = useState(false);
  // 使用实时跟踪
  const [useRealTracking, setUseRealTracking] = useState(false);

  useEffect(() => {
    // 加载点云数据和相机数据
    const loadData = async () => {
      try {
        setLoading(true);
        
        // 1. 加载相机位姿数据
        const cameraResponse = await fetch('/data/truck/cameras.json');
        if (!cameraResponse.ok) {
          throw new Error('加载相机数据失败');
        }
        const cameraData = await cameraResponse.json();
        
        // 2. 直接加载PLY文件数据
        const plyResponse = await fetch('/data/truck/point_cloud.ply');
        if (!plyResponse.ok) {
          throw new Error('加载PLY文件失败');
        }
        const plyText = await plyResponse.text();
        
        // 3. 解析PLY文件
        const { points, colors } = parsePLY(plyText);
        
        // 4. 转换相机数据格式
        const cameras = {};
        if (cameraData.frames) {
          cameraData.frames.forEach((frame, index) => {
            // 从变换矩阵中提取位置和方向
            const c2w = frame.transform_matrix;
            if (c2w && c2w.length === 4 && c2w[0].length === 4) {
              // 提取位置（矩阵最后一列的前三个元素）
              const position = [c2w[0][3], c2w[1][3], c2w[2][3]];
              
              // 提取方向向量（矩阵第三列的前三个元素）
              const direction = [-c2w[0][2], -c2w[1][2], -c2w[2][2]];
              
              cameras[index.toString()] = {
                position,
                direction,
                label: `相机 ${index}`,
                fov: 60, // 默认视场角
                aspectRatio: 16/9, // 默认宽高比
                near: 0.1, // 近裁剪面
                far: 100 // 远裁剪面
              };
            }
          });
        }
        
        // 5. 创建最终场景数据对象
        const finalSceneData = {
          point_cloud: {
            points: points,
            colors: colors
          },
          cameras: cameras,
          // 添加场景边界信息
          bounds: calculateSceneBounds(points)
        };
        
        setSceneData(finalSceneData);
        
        // 6. 如果不使用实时跟踪，加载或模拟人物跟踪数据
        if (!useRealTracking) {
          loadPersonsData();
        }
        
        setLoading(false);
      } catch (err) {
        console.error('加载数据出错:', err);
        setError(err.message);
        setLoading(false);
        
        // 如果加载失败，使用简单的测试数据
        createFallbackData();
      }
    };
    
    // 计算场景边界
    const calculateSceneBounds = (points) => {
      if (!points || points.length === 0) return { min: [-5, -5, -5], max: [5, 5, 5] };
      
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      
      points.forEach(p => {
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], p[i]);
          max[i] = Math.max(max[i], p[i]);
        }
      });
      
      return { min, max };
    };
    
    // 加载人物跟踪数据（模拟数据）
    const loadPersonsData = () => {
      // 这里可以替换为实际的API调用
      const dummyPersonData = generateDummyPersonData();
      setPersonsData(dummyPersonData);
      
      // 初始化轨迹历史
      const history = {};
      dummyPersonData.forEach(person => {
        history[person.id] = [{ time: 0, position: [...person.position] }];
      });
      setTrajectoryHistory(history);
    };
    
    // 生成模拟的人物数据
    const generateDummyPersonData = () => {
      return [
        {
          id: "person_1",
          position: [0, 0, 0],
          direction: [1, 0, 0],
          velocity: [0.1, 0, 0.05],
          activity: "walking",
          pose: "upright",
          size: { height: 1.8, width: 0.5, depth: 0.3 }
        }
      ];
    };
    
    // 解析PLY文件文本内容
    const parsePLY = (plyText) => {
      const lines = plyText.split('\n');
      let headerEnd = 0;
      let vertexCount = 0;
      
      // 解析头部信息以获取顶点数量
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === 'end_header') {
          headerEnd = i + 1;
          break;
        }
        if (line.startsWith('element vertex')) {
          vertexCount = parseInt(line.split(' ')[2]);
        }
      }
      
      console.log(`PLY解析: 头部结束行=${headerEnd}, 顶点数量=${vertexCount}`);
      
      // 提取顶点数据
      const points = [];
      const colors = [];
      
      const maxPoints = Math.min(vertexCount, 100000); // 限制最大点数
      const skipStep = Math.max(1, Math.floor(vertexCount / maxPoints)); // 采样间隔
      
      for (let i = 0; i < vertexCount; i++) {
        if (i % skipStep !== 0) continue; // 采样
        
        const lineIdx = headerEnd + i;
        if (lineIdx < lines.length) {
          const values = lines[lineIdx].trim().split(' ').map(Number);
          if (values.length >= 6) { // x,y,z,r,g,b
            points.push([values[0], values[1], values[2]]);
            colors.push([values[3]/255, values[4]/255, values[5]/255]); // 颜色归一化
          }
        }
      }
      
      console.log(`PLY解析完成: 采样率=${1/skipStep}, 实际点数=${points.length}`);
      return { points, colors };
    };
    
    // 创建后备数据（如果PLY加载失败）
    const createFallbackData = () => {
      const points = [];
      const colors = [];
      
      // 创建一个简单的立方体点云
      const size = 2;
      const step = 0.1;
      
      for (let x = -size; x <= size; x += step) {
        for (let y = -size; y <= size; y += step) {
          for (let z = -size; z <= size; z += step) {
            // 只保留接近表面的点（简化的模型）
            if (Math.abs(Math.abs(x) - size) < step * 2 || 
                Math.abs(Math.abs(y) - size) < step * 2 || 
                Math.abs(Math.abs(z) - size) < step * 2) {
              points.push([x, y, z]);
              
              // 根据位置生成颜色
              const r = (x + size) / (2 * size);
              const g = (y + size) / (2 * size);
              const b = (z + size) / (2 * size);
              colors.push([r, g, b]);
            }
          }
        }
      }
      
      const dummyCameras = {
        '0': {
          position: [5, 2, 5],
          direction: [-0.7, -0.2, -0.7],
          label: '相机 0',
          fov: 60,
          aspectRatio: 16/9,
          near: 0.1,
          far: 100
        },
        '1': {
          position: [-5, 2, 5],
          direction: [0.7, -0.2, -0.7],
          label: '相机 1',
          fov: 60,
          aspectRatio: 16/9,
          near: 0.1,
          far: 100
        }
      };
      
      const fallbackData = {
        point_cloud: {
          points: points,
          colors: colors
        },
        cameras: dummyCameras,
        bounds: { min: [-size, -size, -size], max: [size, size, size] }
      };
      
      setSceneData(fallbackData);
      setError('使用后备数据，原PLY加载失败');
      setLoading(false);
      
      // 加载模拟人物数据
      if (!useRealTracking) {
        loadPersonsData();
      }
    };
    
    loadData();
    
    // 设置WebSocket连接
    if (useRealTracking) {
      // 设置WebSocket事件处理
      const handleConnect = () => {
        console.log('WebSocket已连接');
        setWsConnected(true);
        
        // 启动跟踪
        trackingService.startTracking();
      };
      
      const handleDisconnect = () => {
        console.log('WebSocket已断开');
        setWsConnected(false);
      };
      
      const handleError = (error) => {
        console.error('WebSocket错误:', error);
        setError(`WebSocket错误: ${error.message}`);
      };
      
      const handleCameras = (cameras) => {
        console.log('收到相机数据:', cameras);
        if (cameras && cameras.length > 0) {
          // 更新相机数据
          const camerasObj = {};
          cameras.forEach(cam => {
            camerasObj[cam.id] = {
              position: cam.position,
              direction: cam.direction,
              label: cam.name,
              fov: cam.fov || 60,
              aspectRatio: 16/9,
              near: 0.1,
              far: 100
            };
          });
          
          if (sceneData) {
            setSceneData({
              ...sceneData,
              cameras: camerasObj
            });
          }
          
          // 设置默认活动相机
          const activeCamera = cameras.find(cam => cam.is_active);
          if (activeCamera) {
            setActiveCamera(activeCamera.id);
          } else if (cameras.length > 0) {
            setActiveCamera(cameras[0].id);
          }
        }
      };
      
      const handlePersons = (data) => {
        if (data && data.persons) {
          console.log('收到人物数据:', data);
          
          // 更新人物数据
          setPersonsData(data.persons);
          
          // 更新轨迹历史
          const timestamp = data.timestamp;
          setTrajectoryHistory(prev => {
            const updated = {...prev};
            
            data.persons.forEach(person => {
              if (!updated[person.id]) {
                updated[person.id] = [];
              }
              
              updated[person.id].push({
                time: timestamp,
                position: [...person.position]
              });
              
              // 限制历史长度
              if (updated[person.id].length > 100) {
                updated[person.id] = updated[person.id].slice(-100);
              }
            });
            
            return updated;
          });
          
          // 更新当前时间
          setCurrentTime(prev => prev + 1);
        }
      };
      
      // 注册事件监听
      const unsubscribeConnect = trackingService.on('connect', handleConnect);
      const unsubscribeDisconnect = trackingService.on('disconnect', handleDisconnect);
      const unsubscribeError = trackingService.on('error', handleError);
      const unsubscribeCameras = trackingService.on('cameras', handleCameras);
      const unsubscribePersons = trackingService.on('persons', handlePersons);
      
      // 连接WebSocket
      trackingService.connect();
      
      // 清理函数
      return () => {
        unsubscribeConnect();
        unsubscribeDisconnect();
        unsubscribeError();
        unsubscribeCameras();
        unsubscribePersons();
        trackingService.disconnect();
      };
    }
  }, [useRealTracking]);
  
  // 计算人物与相机的关系
  useEffect(() => {
    if (!sceneData || !personsData.length) return;
    
    const calculateCameraPersonRelations = () => {
      const relations = {};
      const cameras = sceneData.cameras;
      
      personsData.forEach(person => {
        const personRelations = {};
        
        Object.keys(cameras).forEach(cameraId => {
          const camera = cameras[cameraId];
          
          // 创建Three.js相机对象进行计算
          const cam = new THREE.PerspectiveCamera(
            camera.fov,
            camera.aspectRatio,
            camera.near,
            camera.far
          );
          
          cam.position.set(...camera.position);
          cam.lookAt(
            camera.position[0] + camera.direction[0],
            camera.position[1] + camera.direction[1],
            camera.position[2] + camera.direction[2]
          );
          cam.updateMatrixWorld();
          
          // 检查人物是否在视锥体内
          const frustum = new THREE.Frustum();
          const projScreenMatrix = new THREE.Matrix4();
          projScreenMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
          frustum.setFromProjectionMatrix(projScreenMatrix);
          
          const personPosition = new THREE.Vector3(...person.position);
          const isVisible = frustum.containsPoint(personPosition);
          
          // 计算距离
          const distance = new THREE.Vector3(...camera.position).distanceTo(personPosition);
          
          // 计算人物在画面中的位置（中心偏移量）
          const personPosInCamera = personPosition.clone().project(cam);
          const centerOffset = Math.sqrt(Math.pow(personPosInCamera.x, 2) + Math.pow(personPosInCamera.y, 2));
          
          // 计算拍摄角度评分
          const camToPersonDir = personPosition.clone().sub(new THREE.Vector3(...camera.position)).normalize();
          const personDir = new THREE.Vector3(...person.direction);
          const angleScore = personDir.dot(camToPersonDir) * 0.5 + 0.5; // 将[-1,1]映射到[0,1]
          
          // 综合评分 (各权重可调整)
          const optimalDistance = 5; // 假设最佳距离
          const distanceScore = 1.0 - Math.min(1.0, Math.abs(distance - optimalDistance) / optimalDistance);
          const centerScore = 1.0 - Math.min(1.0, centerOffset);
          
          const qualityScore = 
            distanceScore * 0.4 +
            centerScore * 0.3 +
            angleScore * 0.3;
          
          // 确定拍摄类型
          let shotType = "未知";
          if (distance < 3) shotType = "特写";
          else if (distance < 7) shotType = "中景";
          else shotType = "远景";
          
          personRelations[cameraId] = {
            isVisible,
            distance,
            centerOffset,
            angleScore,
            qualityScore,
            shotType
          };
        });
        
        relations[person.id] = personRelations;
      });
      
      setCameraRelations(relations);
      
      // 更新推荐相机
      updateRecommendedCamera(relations);
    };
    
    calculateCameraPersonRelations();
  }, [sceneData, personsData]);
  
  // 更新推荐相机
  const updateRecommendedCamera = (relations) => {
    if (!relations || Object.keys(relations).length === 0) return;
    
    // 简单起见，我们只取第一个人物
    const personId = Object.keys(relations)[0];
    const personRelations = relations[personId];
    
    // 获取可见相机并按质量评分排序
    const visibleCameras = Object.entries(personRelations)
      .filter(([_, data]) => data.isVisible)
      .sort((a, b) => b[1].qualityScore - a[1].qualityScore);
    
    if (visibleCameras.length === 0) return;
    
    // 设置推荐相机
    setRecommendedCamera(visibleCameras[0][0]);
  };
  
  // 模拟人物移动（用于演示）
  useEffect(() => {
    // 如果使用实时跟踪，不需要模拟移动
    if (useRealTracking) return;
    
    if (!isPlaying || !personsData.length || !sceneData) return;
    
    const movementInterval = setInterval(() => {
      // 更新当前时间
      setCurrentTime(prevTime => prevTime + 1);
      
      // 更新人物位置
      setPersonsData(prevPersons => {
        return prevPersons.map(person => {
          // 计算新位置
          const newPosition = [
            person.position[0] + person.velocity[0],
            person.position[1] + person.velocity[1],
            person.position[2] + person.velocity[2]
          ];
          
          // 检查是否到达场景边界，如果是则反弹
          const bounds = sceneData.bounds;
          const newVelocity = [...person.velocity];
          
          for (let i = 0; i < 3; i++) {
            if (newPosition[i] < bounds.min[i] || newPosition[i] > bounds.max[i]) {
              newVelocity[i] = -newVelocity[i];
              newPosition[i] = person.position[i] + newVelocity[i];
            }
          }
          
          // 更新轨迹历史
          setTrajectoryHistory(prev => {
            const updated = {...prev};
            if (!updated[person.id]) updated[person.id] = [];
            updated[person.id].push({
              time: currentTime + 1,
              position: [...newPosition]
            });
            // 限制历史记录长度
            if (updated[person.id].length > 100) {
              updated[person.id] = updated[person.id].slice(-100);
            }
            return updated;
          });
          
          // 返回更新后的人物数据
          return {
            ...person,
            position: newPosition,
            velocity: newVelocity
          };
        });
      });
    }, 500); // 每500毫秒更新一次
    
    return () => clearInterval(movementInterval);
  }, [isPlaying, personsData, sceneData, currentTime, useRealTracking]);
  
  const handleCameraChange = (cameraId) => {
    setActiveCamera(cameraId);
    
    // 如果连接到实时跟踪服务，同步设置活动相机
    if (useRealTracking && wsConnected) {
      trackingService.setActiveCamera(cameraId);
    }
  };
  
  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };
  
  const toggleTracking = () => {
    setUseRealTracking(!useRealTracking);
  };
  
  const resetSimulation = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    
    // 重置人物位置
    if (sceneData) {
      const bounds = sceneData.bounds;
      const center = [
        (bounds.min[0] + bounds.max[0]) / 2,
        (bounds.min[1] + bounds.max[1]) / 2,
        (bounds.min[2] + bounds.max[2]) / 2
      ];
      
      setPersonsData(prevPersons => {
        return prevPersons.map(person => ({
          ...person,
          position: [...center],
          velocity: [0.1, 0, 0.05] // 默认速度
        }));
      });
      
      // 重置轨迹历史
      const history = {};
      personsData.forEach(person => {
        history[person.id] = [{ time: 0, position: [...center] }];
      });
      setTrajectoryHistory(history);
    }
  };
  
  if (loading) {
    return <div>正在加载场景数据，请稍候...</div>;
  }
  
  if (error && !sceneData) {
    return <div>出错了：{error}</div>;
  }
  
  // 获取当前人物与相机的关系信息
  const getCurrentPersonCameraInfo = () => {
    if (!personsData.length || !cameraRelations || Object.keys(cameraRelations).length === 0) {
      return null;
    }
    
    // 简单起见，我们只取第一个人物
    const personId = personsData[0].id;
    const relations = cameraRelations[personId];
    
    if (!relations || Object.keys(relations).length === 0) {
      return null;
    }
    
    // 获取当前相机关系
    const currentCameraRelation = relations[activeCamera];
    if (!currentCameraRelation) return null;
    
    return {
      isVisible: currentCameraRelation.isVisible,
      distance: currentCameraRelation.distance.toFixed(2),
      qualityScore: (currentCameraRelation.qualityScore * 100).toFixed(0),
      shotType: currentCameraRelation.shotType
    };
  };
  
  const personCameraInfo = getCurrentPersonCameraInfo();
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '90vh' }}>
      {/* 控制面板 */}
      <div style={{ padding: '10px', backgroundColor: '#f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h2>多摄像机导播系统</h2>
          <p>当前相机: {activeCamera} {activeCamera === recommendedCamera ? '(推荐)' : ''}</p>
          {error && <p style={{color: 'orange'}}>提示: {error}</p>}
        </div>
        
        <div>
          <button 
            onClick={togglePlayback} 
            style={{ margin: '5px', padding: '5px 10px' }}
            disabled={useRealTracking} // 如果使用实时跟踪，禁用播放控制
          >
            {isPlaying ? '暂停' : '播放'}
          </button>
          <button 
            onClick={resetSimulation} 
            style={{ margin: '5px', padding: '5px 10px' }}
            disabled={useRealTracking} // 如果使用实时跟踪，禁用重置
          >
            重置
          </button>
          <button 
            onClick={toggleTracking} 
            style={{ margin: '5px', padding: '5px 10px' }}
          >
            {useRealTracking ? '使用模拟数据' : '使用实时跟踪'}
          </button>
          <div>
            时间: {currentTime}秒
            {useRealTracking && (
              <span style={{ marginLeft: '10px', color: wsConnected ? 'green' : 'red' }}>
                {wsConnected ? '已连接' : '未连接'}
              </span>
            )}
          </div>
        </div>
        
        <div>
          {personCameraInfo && (
            <div>
              <p>人物可见性: {personCameraInfo.isVisible ? '可见' : '不可见'}</p>
              <p>拍摄距离: {personCameraInfo.distance}米</p>
              <p>拍摄类型: {personCameraInfo.shotType}</p>
              <p>画面质量: {personCameraInfo.qualityScore}%</p>
            </div>
          )}
        </div>
      </div>
      
      {/* 3D场景和摄像机网格 */}
      <div style={{ display: 'flex', flex: 1 }}>
        {/* 主3D场景视图 */}
        <div style={{ flex: 3, border: '1px solid #ccc' }}>
          <LightweightSceneViewer 
            sceneData={sceneData}
            activeCamera={activeCamera}
            onCameraChange={handleCameraChange}
            showStructuralLines={true}
            showPointCloudOutlines={true}
            samplingDensity={0.2}
            maxPoints={100000}
            personsData={personsData}
            trajectoryHistory={trajectoryHistory}
            cameraRelations={cameraRelations}
            recommendedCamera={recommendedCamera}
          />
        </div>
        
        {/* 相机视图网格 */}
        <div style={{ flex: 1, padding: '10px', overflowY: 'auto', backgroundColor: '#e0e0e0' }}>
          <h3>相机视图</h3>
          {sceneData && sceneData.cameras && Object.keys(sceneData.cameras).map(cameraId => {
            const camera = sceneData.cameras[cameraId];
            const isRecommended = cameraId === recommendedCamera;
            
            // 获取该相机对人物的评分
            let qualityScore = 0;
            let isVisible = false;
            let shotType = "未知";
            
            if (personsData.length > 0 && cameraRelations[personsData[0].id]) {
              const relation = cameraRelations[personsData[0].id][cameraId];
              if (relation) {
                qualityScore = relation.qualityScore;
                isVisible = relation.isVisible;
                shotType = relation.shotType;
              }
            }
            
            return (
              <div 
                key={cameraId}
                style={{
                  margin: '5px 0',
                  padding: '10px',
                  backgroundColor: cameraId === activeCamera ? '#b3e0ff' : '#ffffff',
                  border: isRecommended ? '2px solid #ffcc00' : '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                onClick={() => handleCameraChange(cameraId)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: '0 0 5px 0' }}>{camera.label}</h4>
                  {isRecommended && <span style={{ color: '#ff9900', fontWeight: 'bold' }}>推荐</span>}
                </div>
                
                <div>
                  <p style={{ margin: '2px 0' }}>
                    位置: ({camera.position.map(v => v.toFixed(1)).join(', ')})
                  </p>
                  <p style={{ margin: '2px 0' }}>
                    人物: {isVisible ? '可见' : '不可见'}
                  </p>
                  <p style={{ margin: '2px 0' }}>
                    拍摄类型: {shotType}
                  </p>
                  <div style={{ 
                    height: '10px', 
                    backgroundColor: '#e0e0e0',
                    borderRadius: '5px',
                    overflow: 'hidden',
                    margin: '5px 0'
                  }}>
                    <div style={{
                      width: `${qualityScore * 100}%`,
                      height: '100%',
                      backgroundColor: isVisible ? 
                        (qualityScore > 0.7 ? '#4CAF50' : qualityScore > 0.4 ? '#FFC107' : '#F44336') : 
                        '#888888'
                    }}></div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px' }}>
                    质量得分: {(qualityScore * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default SceneViewerTest; 