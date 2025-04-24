import React, { useState, useEffect } from 'react';
import SceneViewer from './components/SceneViewer';
import LightweightSceneViewer from './components/LightweightSceneViewer';
import ControlPanel from './components/ControlPanel';
import CameraPreviewBar from './components/CameraPreviewBar';
import { SceneService } from './services/SceneService';
import './styles.css';
import SceneViewerTest from './components/SceneViewerTest';

function App() {
  const [activeCamera, setActiveCamera] = useState(0);
  const [sceneData, setSceneData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sceneList, setSceneList] = useState([]);
  const [personPosition, setPersonPosition] = useState(null);
  const [personAnalysis, setPersonAnalysis] = useState(null);
  const [showStructuralLines, setShowStructuralLines] = useState(true);
  
  // 检测到的人物
  const [detectedPersons, setDetectedPersons] = useState([]);
  
  // 多结构跟踪 - 新状态
  const [trackedStructureIds, setTrackedStructureIds] = useState([]); // 跟踪的结构ID数组
  const [structurePositions, setStructurePositions] = useState({}); // 各结构位置 {id: [x,y,z]}
  const [structureTrails, setStructureTrails] = useState({}); // 各结构轨迹 {id: [[x,y,z], ...]}
  const [trackingEnabled, setTrackingEnabled] = useState(false); // 是否启用跟踪
  
  // 结构颜色映射
  const defaultColors = [
    "#ff6600", "#3366cc", "#dc3912", "#109618", "#990099",
    "#0099c6", "#dd4477", "#66aa00", "#b82e2e", "#316395"
  ];
  const [structureColorMap, setStructureColorMap] = useState({});
  
  // 新状态 - 轻量级渲染模式
  const [useLightweightRenderer, setUseLightweightRenderer] = useState(false);
  // 点云渲染设置
  const [pointCloudDensity, setPointCloudDensity] = useState(0.1); // 10%的点
  const [maxPoints, setMaxPoints] = useState(10000);
  
  // 初始化时获取场景列表
  useEffect(() => {
    const fetchScenes = async () => {
      try {
        // 先获取场景列表
        const scenes = await SceneService.getScenes();
        if (scenes && scenes.length > 0) {
          setSceneList(scenes);
        } else {
          // 如果没有场景数据，使用模拟数据
          console.log('使用模拟场景数据');
        }
      } catch (err) {
        console.error('获取场景列表失败:', err);
      }
    };
    
    fetchScenes();
  }, []);
  
  // 为跟踪的结构分配颜色
  useEffect(() => {
    const newColorMap = {...structureColorMap};
    
    trackedStructureIds.forEach((id, index) => {
      if (!newColorMap[id]) {
        newColorMap[id] = defaultColors[index % defaultColors.length];
      }
    });
    
    setStructureColorMap(newColorMap);
  }, [trackedStructureIds]);
  
  // 实时跟踪更新
  useEffect(() => {
    if (!trackingEnabled || trackedStructureIds.length === 0 || !sceneData) return;
    
    const trackingInterval = setInterval(async () => {
      try {
        if (trackedStructureIds.length > 1) {
          // 使用批量API获取多个结构的位置
          const positions = await SceneService.getMultipleStructurePositions(
            null, // 实际实现时传入plyFile
            null, // 实际实现时传入cameraJson
            trackedStructureIds
          );
          
          // 更新所有结构位置
          setStructurePositions(prev => ({
            ...prev,
            ...positions
          }));
          
          // 更新轨迹
          for (const [id, position] of Object.entries(positions)) {
            updateTrailForStructure(parseInt(id), position);
          }
          
          // 更新关注人物位置（第一个结构）
          if (trackedStructureIds.length > 0) {
            const firstId = trackedStructureIds[0];
            const position = positions[firstId];
            if (position) {
              setPersonPosition(position);
              analyzePersonPosition(position);
            }
          }
        } else {
          // 单结构更新
          trackedStructureIds.forEach(async structureId => {
            const position = await SceneService.getStructurePosition(
              null, // 实际实现时传入plyFile
              null, // 实际实现时传入cameraJson
              structureId
            );
            updateStructureWithPosition(structureId, position);
          });
        }
      } catch (error) {
        console.error('跟踪更新失败:', error);
        // 出错时使用模拟数据
        trackedStructureIds.forEach(structureId => {
          const currentPosition = structurePositions[structureId] || null;
          const newPosition = SceneService.getMockStructureMovement(
            structureId, 
            currentPosition
          );
          updateStructureWithPosition(structureId, newPosition);
        });
      }
    }, 200); // 5Hz更新率
    
    return () => clearInterval(trackingInterval);
  }, [trackingEnabled, trackedStructureIds, structurePositions, sceneData]);
  
  // 更新单个结构的轨迹
  const updateTrailForStructure = (structureId, newPosition) => {
    setStructureTrails(prev => {
      const currentTrail = prev[structureId] || [];
      // 限制轨迹长度，避免内存过度使用
      const maxTrailLength = 100;
      const updatedTrail = [...currentTrail, newPosition];
      if (updatedTrail.length > maxTrailLength) {
        return {
          ...prev,
          [structureId]: updatedTrail.slice(-maxTrailLength)
        };
      } else {
        return {
          ...prev,
          [structureId]: updatedTrail
        };
      }
    });
  };
  
  // 更新结构位置和轨迹
  const updateStructureWithPosition = (structureId, newPosition) => {
    if (!newPosition) return;
    
    // 更新位置
    setStructurePositions(prev => ({
      ...prev,
      [structureId]: newPosition
    }));
    
    // 更新轨迹
    updateTrailForStructure(structureId, newPosition);
    
    // 如果是当前关注的结构，更新人物位置分析
    if (trackedStructureIds.length > 0 && trackedStructureIds[0] === structureId) {
      setPersonPosition(newPosition);
      analyzePersonPosition(newPosition);
    }
  };
  
  // 加载模拟场景数据
  const loadMockSceneData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('加载模拟场景数据...');
      const mockData = await SceneService.getMockScene();
      setSceneData(mockData);
      // 设置默认活动相机
      setActiveCamera(Object.keys(mockData.cameras)[0]);
      // 重置人物分析数据
      setPersonPosition(null);
      setPersonAnalysis(null);
      // 检测人物
      detectPersons();
      // 重置跟踪状态
      resetTrackingData();
    } catch (err) {
      console.error('加载模拟数据失败:', err);
      setError('加载模拟数据失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // 重置跟踪数据
  const resetTrackingData = () => {
    setTrackingEnabled(false);
    setTrackedStructureIds([]);
    setStructurePositions({});
    setStructureTrails({});
    setStructureColorMap({});
  };
  
  // 分析真实场景数据
  const analyzeRealScene = async (plyFile, cameraJson) => {
    try {
      setLoading(true);
      setError(null);
      console.log(`分析场景数据... ply: ${plyFile}, camera: ${cameraJson}`);
      const analysisResult = await SceneService.analyzeScene(plyFile, cameraJson);
      setSceneData(analysisResult);
      // 设置默认活动相机
      setActiveCamera(Object.keys(analysisResult.cameras)[0]);
      // 重置人物分析数据
      setPersonPosition(null);
      setPersonAnalysis(null);
      // 检测人物
      detectPersons(plyFile, cameraJson);
      // 重置跟踪状态
      resetTrackingData();
    } catch (err) {
      console.error('场景分析失败:', err);
      setError('场景分析失败: ' + err.message);
      // 加载失败时使用模拟数据
      loadMockSceneData();
    } finally {
      setLoading(false);
    }
  };
  
  // 检测场景中的所有人物
  const detectPersons = async (plyFile, cameraJson) => {
    try {
      setLoading(true);
      console.log('检测场景中的人物...');
      
      // 如果没有传入plyFile和cameraJson，使用模拟数据
      const personsData = await SceneService.detectAllPersons(plyFile, cameraJson);
      
      if (personsData && personsData.persons) {
        setDetectedPersons(personsData.persons);
        console.log('检测到', personsData.persons.length, '个人物');
      } else {
        setDetectedPersons([]);
      }
    } catch (err) {
      console.error('人物检测失败:', err);
      setDetectedPersons([]);
    } finally {
      setLoading(false);
    }
  };
  
  // 处理结构选择(切换选择状态)
  const handleStructureSelect = (structureId) => {
    if (trackingEnabled) {
      console.log('跟踪进行中，无法修改选择');
      return;
    }
    
    // 检查结构是否已被选中
    if (trackedStructureIds.includes(structureId)) {
      // 如果已选中，则移除
      setTrackedStructureIds(prev => prev.filter(id => id !== structureId));
      
      // 清除该结构的位置和轨迹数据
      setStructurePositions(prev => {
        const newPositions = {...prev};
        delete newPositions[structureId];
        return newPositions;
      });
      
      setStructureTrails(prev => {
        const newTrails = {...prev};
        delete newTrails[structureId];
        return newTrails;
      });
    } else {
      // 如果未选中，则添加
      setTrackedStructureIds(prev => [...prev, structureId]);
      
      // 找到选中的结构，初始化其位置
      if (sceneData && sceneData.structures) {
        const selectedStructure = sceneData.structures.find(s => s.id === structureId);
        if (selectedStructure) {
          const position = selectedStructure.center;
          
          // 更新该结构的位置
          setStructurePositions(prev => ({
            ...prev,
            [structureId]: position
          }));
          
          // 初始化轨迹
          setStructureTrails(prev => ({
            ...prev,
            [structureId]: [position]
          }));
        }
      }
    }
    
    // 调整当前关注的人物位置(选择第一个跟踪结构的位置)
    updateFocusedStructure();
  };
  
  // 更新当前关注的结构
  const updateFocusedStructure = () => {
    if (trackedStructureIds.length > 0) {
      const firstId = trackedStructureIds[0];
      const position = structurePositions[firstId];
      
      if (position) {
        setPersonPosition(position);
        analyzePersonPosition(position);
      }
    } else {
      setPersonPosition(null);
      setPersonAnalysis(null);
    }
  };
  
  // 选择人物
  const handlePersonSelect = (personId) => {
    // 找到选中的人物
    const selectedPerson = detectedPersons.find(p => p.id === personId);
    if (selectedPerson) {
      // 设置位置并分析
      setPersonPosition(selectedPerson.position);
      analyzePersonPosition(selectedPerson.position);
      console.log('选择跟踪人物ID:', personId, '位置:', selectedPerson.position);
    }
  };
  
  // 分析指定位置的人物
  const analyzePersonPosition = async (position) => {
    try {
      if (!position) return;
      
      setLoading(true);
      // 使用模拟数据
      const analysisData = await SceneService.getMockPersonAnalysis(position);
      setPersonAnalysis(analysisData);
    } catch (err) {
      console.error('人物位置分析失败:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // 相机切换处理函数
  const handleCameraChange = (cameraId) => {
    setActiveCamera(cameraId);
    console.log(`切换到相机 ${cameraId}`);
  };
  
  // 处理人物位置分析结果
  const handlePersonDataLoaded = (position, analysisData) => {
    setPersonPosition(position);
    setPersonAnalysis(analysisData);
    console.log('人物位置分析完成', position, analysisData);
    
    // 如果有可见相机且不是当前相机，可以提示或自动切换
    if (analysisData && analysisData.visible_cameras && Object.keys(analysisData.visible_cameras).length > 0) {
      const bestCameras = Object.keys(analysisData.visible_cameras);
      
      // 如果当前相机不在可见列表中，可以建议切换
      if (!bestCameras.includes(activeCamera) && bestCameras.length > 0) {
        console.log(`当前相机不可见人物，建议切换到相机: ${bestCameras[0]}`);
      }
    }
  };
  
  // 处理结构线显示切换
  const handleToggleStructuralLines = (show) => {
    setShowStructuralLines(show);
  };
  
  // 启动跟踪
  const startTracking = () => {
    if (trackedStructureIds.length === 0) {
      alert('请先选择至少一个结构进行跟踪');
      return;
    }
    
    setTrackingEnabled(true);
    console.log(`开始跟踪 ${trackedStructureIds.length} 个结构`);
  };
  
  // 停止跟踪
  const stopTracking = () => {
    setTrackingEnabled(false);
    console.log('停止跟踪');
  };
  
  // 移除单个跟踪结构
  const removeTrackedStructure = (structureId) => {
    if (trackingEnabled) {
      alert('请先停止跟踪，再修改跟踪结构');
      return;
    }
    
    setTrackedStructureIds(prev => prev.filter(id => id !== structureId));
    
    // 清除该结构的位置和轨迹数据
    setStructurePositions(prev => {
      const newPositions = {...prev};
      delete newPositions[structureId];
      return newPositions;
    });
    
    setStructureTrails(prev => {
      const newTrails = {...prev};
      delete newTrails[structureId];
      return newTrails;
    });
    
    // 更新关注的结构
    updateFocusedStructure();
  };
  
  // 清除所有跟踪数据
  const clearAllTrackedStructures = () => {
    if (trackingEnabled) {
      alert('请先停止跟踪，再清除跟踪结构');
      return;
    }
    
    resetTrackingData();
  };
  
  // 加载指定的本地测试文件
  const loadLocalTestFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const plyFilePath = "C:\\Users\\Reiny Gu\\Desktop\\VideoDirecting_MultiCamSceneEnhance\\gaussian-splatting\\output\\truck\\point_cloud\\iteration_7000\\point_cloud.ply";
      const cameraJsonPath = "C:\\Users\\Reiny Gu\\Desktop\\VideoDirecting_MultiCamSceneEnhance\\gaussian-splatting\\output\\truck\\cameras.json";
      
      console.log('加载本地测试文件...');
      const sceneData = await SceneService.loadLocalTestData(plyFilePath, cameraJsonPath);
      
      setSceneData(sceneData);
      
      // 设置默认活动相机
      if (sceneData && sceneData.cameras) {
        setActiveCamera(Object.keys(sceneData.cameras)[0]);
      }
      
      // 重置人物分析数据
      setPersonPosition(null);
      setPersonAnalysis(null);
      // 重置跟踪状态
      resetTrackingData();
      
      console.log('本地测试文件加载成功:', sceneData);
    } catch (err) {
      console.error('加载本地测试文件失败:', err);
      setError('加载本地测试文件失败: ' + err.message);
      // 失败时使用模拟数据
      loadMockSceneData();
    } finally {
      setLoading(false);
    }
  };
  
  // 加载预定义测试数据并设置人物位置
  const loadPredefinedTestDataWithPerson = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('加载预定义测试数据...');
      const result = await SceneService.loadPredefinedTestData();
      
      if (result.success) {
        setSceneData({
          cameras: result.cameras,
          structural_lines: result.structuralLines,
          structures: result.structures || [], // 确保有结构数组，即使为空
          point_cloud: result.point_cloud // 添加点云数据
        });
        
        // 设置默认活动相机
        setActiveCamera(Object.keys(result.cameras)[0]);
        
        // 设置默认人物位置在场景中心附近
        const defaultPersonPosition = [0, 0, 0];
        setPersonPosition(defaultPersonPosition);
        
        // 分析人物位置
        analyzePersonPosition(defaultPersonPosition);
        
        console.log('预定义测试数据加载成功', result);
      } else {
        throw new Error(result.error || '加载失败');
      }
    } catch (err) {
      console.error('加载预定义测试数据失败:', err);
      setError('加载预定义测试数据失败: ' + err.message);
      // 失败时使用模拟数据
      loadMockSceneData();
    } finally {
      setLoading(false);
    }
  };
  
  // 切换渲染模式
  const toggleRendererMode = () => {
    setUseLightweightRenderer(prev => !prev);
  };
  
  // 修改点云密度
  const handleDensityChange = (newDensity) => {
    setPointCloudDensity(newDensity);
  };
  
  // 修改最大点数
  const handleMaxPointsChange = (newMaxPoints) => {
    setMaxPoints(newMaxPoints);
  };
  
  return (
    <div className="app-container">
      {/* 添加相机预览条 */}
      {personPosition && (
        <CameraPreviewBar
          sceneData={sceneData}
          personPosition={personPosition}
          activeCamera={activeCamera}
          onCameraChange={handleCameraChange}
        />
      )}
      
      <div className="scene-container">
        {/* 根据渲染模式选择渲染组件 */}
        {useLightweightRenderer ? (
          <LightweightSceneViewer 
            sceneData={sceneData} 
            activeCamera={activeCamera}
            onCameraChange={handleCameraChange}
            showStructuralLines={showStructuralLines}
            personPosition={personPosition}
            samplingDensity={pointCloudDensity}
            maxPoints={maxPoints}
          />
        ) : (
          <SceneViewer 
            sceneData={sceneData} 
            activeCamera={activeCamera}
            onCameraChange={handleCameraChange}
            showStructuralLines={showStructuralLines}
            personPosition={personPosition}
            personAnalysis={personAnalysis}
            detectedPersons={detectedPersons}
            trackedStructureIds={trackedStructureIds}
            onPersonSelect={handlePersonSelect}
            onStructureSelect={handleStructureSelect}
            structurePositions={structurePositions}
            structureTrails={structureTrails}
            structureColorMap={structureColorMap}
            isTracking={trackingEnabled}
          />
        )}
        
        {loading && (
          <div className="loading-overlay">
            <span>加载中...</span>
          </div>
        )}
        {error && (
          <div className="error-overlay">
            <span>{error}</span>
          </div>
        )}
      </div>
      
      <ControlPanel 
        activeCamera={activeCamera}
        onCameraChange={handleCameraChange}
        onSceneDataLoaded={setSceneData}
        onPersonDataLoaded={handlePersonDataLoaded}
        onToggleStructuralLines={handleToggleStructuralLines}
        showStructuralLines={showStructuralLines}
        onDetectPersons={detectPersons}
        detectedPersons={detectedPersons}
        trackedStructureIds={trackedStructureIds}
        onPersonSelect={handlePersonSelect}
        selectedStructureId={trackedStructureIds[0] || null}
        structurePositions={structurePositions}
        structureColorMap={structureColorMap}
        isTracking={trackingEnabled}
        onStartTracking={startTracking}
        onStopTracking={stopTracking}
        onRemoveStructure={removeTrackedStructure}
        onClearAllStructures={clearAllTrackedStructures}
      />
      
      {/* 测试工具按钮区域 */}
      <div className="test-tools">
        <button 
          onClick={loadLocalTestFiles} 
          disabled={loading}
          className="test-btn"
        >
          {loading ? '加载中...' : '加载测试文件 (卡车场景)'}
        </button>
        
        <button 
          onClick={loadPredefinedTestDataWithPerson} 
          disabled={loading}
          className="test-btn preview-test-btn"
        >
          {loading ? '加载中...' : '快速加载预览测试'}
        </button>
        
        {/* 渲染模式切换按钮 */}
        <button 
          onClick={toggleRendererMode}
          className={`test-btn renderer-toggle-btn ${useLightweightRenderer ? 'active' : ''}`}
        >
          {useLightweightRenderer ? '使用标准渲染' : '使用轻量级渲染'}
        </button>
        
        {/* 点云设置 - 仅在轻量级模式下显示 */}
        {useLightweightRenderer && (
          <div className="point-cloud-settings">
            <div className="settings-row">
              <label>点云密度:</label>
              <select 
                value={pointCloudDensity} 
                onChange={(e) => handleDensityChange(parseFloat(e.target.value))}
              >
                <option value="0.01">1% (极低)</option>
                <option value="0.05">5% (低)</option>
                <option value="0.1">10% (中)</option>
                <option value="0.25">25% (高)</option>
                <option value="0.5">50% (极高)</option>
              </select>
            </div>
            <div className="settings-row">
              <label>最大点数:</label>
              <select 
                value={maxPoints} 
                onChange={(e) => handleMaxPointsChange(parseInt(e.target.value))}
              >
                <option value="5000">5,000</option>
                <option value="10000">10,000</option>
                <option value="25000">25,000</option>
                <option value="50000">50,000</option>
                <option value="100000">100,000</option>
              </select>
            </div>
          </div>
        )}
      </div>
      
      <SceneViewerTest />
    </div>
  );
}

export default App;