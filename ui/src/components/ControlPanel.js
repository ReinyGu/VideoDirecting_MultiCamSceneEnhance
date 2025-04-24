import React, { useState, useEffect } from 'react';
import { SceneService } from '../services/SceneService';
import './ControlPanel.css'; // 恢复CSS引用

function ControlPanel({ 
  onSceneDataLoaded, 
  onCameraChange, 
  activeCamera, 
  onPersonDataLoaded,
  onToggleStructuralLines,
  showStructuralLines: propShowStructuralLines,
  onDetectPersons,
  detectedPersons = [],
  trackedStructureIds = [],
  onPersonSelect,
  selectedStructureId = null,
  structurePositions = {},
  structureColorMap = {},
  isTracking = false,
  onStartTracking,
  onStopTracking,
  onRemoveStructure,
  onClearAllStructures
}) {
  const [scenes, setScenes] = useState([]);
  const [selectedScene, setSelectedScene] = useState(null);
  const [plys, setPlys] = useState([]);
  const [selectedPly, setSelectedPly] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [analyzingScene, setAnalyzingScene] = useState(false);
  const [analyzingPerson, setAnalyzingPerson] = useState(false);
  const [personPosition, setPersonPosition] = useState({ x: 0, y: 0, z: 0 });
  const [showStructuralLines, setShowStructuralLines] = useState(propShowStructuralLines !== undefined ? propShowStructuralLines : true);
  const [detectingPersons, setDetectingPersons] = useState(false);
  
  // 当props变化时同步更新本地state
  useEffect(() => {
    if (propShowStructuralLines !== undefined) {
      setShowStructuralLines(propShowStructuralLines);
    }
  }, [propShowStructuralLines]);
  
  // 获取场景列表
  useEffect(() => {
    SceneService.getScenes()
      .then(sceneList => {
        setScenes(sceneList);
        // 如果有场景，默认选择第一个
        if (sceneList.length > 0) {
          setSelectedScene(sceneList[0]);
        }
      })
      .catch(error => {
        console.error('获取场景列表失败:', error);
      });
  }, []);
  
  // 当选择场景变化时，获取该场景下的PLY文件和相机文件列表
  useEffect(() => {
    if (selectedScene) {
      setPlys(selectedScene.ply_files || []);
      setCameras(selectedScene.camera_files || []);
      
      // 默认选择第一个ply文件和相机文件
      if (selectedScene.ply_files && selectedScene.ply_files.length > 0) {
        setSelectedPly(selectedScene.ply_files[0]);
      }
      
      if (selectedScene.camera_files && selectedScene.camera_files.length > 0) {
        setSelectedCamera(selectedScene.camera_files[0]);
      }
    }
  }, [selectedScene]);
  
  // 处理场景选择变化
  const handleSceneChange = (event) => {
    const sceneId = event.target.value;
    const scene = scenes.find(s => s.id === sceneId);
    setSelectedScene(scene);
  };
  
  // 处理PLY文件选择变化
  const handlePlyChange = (event) => {
    setSelectedPly(event.target.value);
  };
  
  // 处理相机文件选择变化
  const handleCameraChange = (event) => {
    setSelectedCamera(event.target.value);
  };
  
  // 分析场景
  const handleAnalyzeScene = () => {
    if (!selectedScene || !selectedPly || !selectedCamera) {
      console.error('请选择场景、PLY文件和相机文件');
      return;
    }
    
    setAnalyzingScene(true);
    
    const plyPath = `${selectedScene.path}/${selectedPly}`;
    const jsonDir = selectedScene.json_dir || selectedScene.path;
    const cameraPath = `${jsonDir}/${selectedCamera}`;
    
    console.log('分析场景:', plyPath, cameraPath);
    
    SceneService.analyzeScene(plyPath, cameraPath)
      .then(sceneData => {
        onSceneDataLoaded(sceneData);
        
        // 如果返回的数据中有相机，默认选择第一个相机
        if (sceneData && sceneData.cameras) {
          const firstCameraId = Object.keys(sceneData.cameras)[0];
          if (firstCameraId) {
            onCameraChange(firstCameraId);
          }
        }
      })
      .catch(error => {
        console.error('分析场景失败:', error);
        
        // 如果API调用失败，使用模拟数据以便继续测试
        SceneService.getMockScene()
          .then(mockData => {
            console.log('使用模拟数据:', mockData);
            onSceneDataLoaded(mockData);
            
            const firstCameraId = Object.keys(mockData.cameras)[0];
            if (firstCameraId) {
              onCameraChange(firstCameraId);
            }
          });
      })
      .finally(() => {
        setAnalyzingScene(false);
      });
  };
  
  // 处理人物坐标变化
  const handlePersonPositionChange = (coord, value) => {
    setPersonPosition(prev => ({
      ...prev,
      [coord]: parseFloat(value)
    }));
  };
  
  // 分析人物位置
  const handleAnalyzePerson = () => {
    if (!selectedScene || !selectedPly || !selectedCamera) {
      console.error('请选择场景、PLY文件和相机文件');
      return;
    }
    
    setAnalyzingPerson(true);
    
    const plyPath = `${selectedScene.path}/${selectedPly}`;
    const jsonDir = selectedScene.json_dir || selectedScene.path;
    const cameraPath = `${jsonDir}/${selectedCamera}`;
    const position = [personPosition.x, personPosition.y, personPosition.z];
    
    console.log('分析人物位置:', plyPath, cameraPath, position);
    
    SceneService.analyzePersonPosition(plyPath, cameraPath, position)
      .then(personData => {
        if (onPersonDataLoaded) {
          onPersonDataLoaded(position, personData);
        }
      })
      .catch(error => {
        console.error('分析人物位置失败:', error);
        
        // 如果API调用失败，使用模拟数据
        SceneService.getMockPersonAnalysis(position)
          .then(mockData => {
            console.log('使用人物模拟数据:', mockData);
            if (onPersonDataLoaded) {
              onPersonDataLoaded(position, mockData);
            }
          });
      })
      .finally(() => {
        setAnalyzingPerson(false);
      });
  };
  
  // 切换结构线显示状态
  const toggleStructuralLines = () => {
    const newValue = !showStructuralLines;
    setShowStructuralLines(newValue);
    
    // 如果提供了回调函数，则调用它
    if (onToggleStructuralLines) {
      onToggleStructuralLines(newValue);
    }
  };
  
  // 检测场景中的人物
  const handleDetectPersons = () => {
    if (!selectedScene || !selectedPly || !selectedCamera) {
      console.error('请选择场景、PLY文件和相机文件');
      return;
    }
    
    setDetectingPersons(true);
    
    const plyPath = `${selectedScene.path}/${selectedPly}`;
    const jsonDir = selectedScene.json_dir || selectedScene.path;
    const cameraPath = `${jsonDir}/${selectedCamera}`;
    
    console.log('检测场景中的人物:', plyPath, cameraPath);
    
    if (onDetectPersons) {
      onDetectPersons(plyPath, cameraPath);
    }
    
    setDetectingPersons(false);
  };
  
  // 格式化位置数据用于显示
  const formatPosition = (position) => {
    if (!position || !Array.isArray(position)) return "未知";
    return position.map(v => parseFloat(v).toFixed(2)).join(', ');
  };
  
  return (
    <div className="control-panel">
      <h2>场景控制面板</h2>
      
      <div className="control-section">
        <h3>场景选择</h3>
        <div className="form-group">
          <label>场景：</label>
          <select 
            value={selectedScene?.id || ''} 
            onChange={handleSceneChange}
            disabled={analyzingScene}
          >
            <option value="">-- 请选择场景 --</option>
            {scenes.map(scene => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
        </div>
        
        <div className="form-group">
          <label>点云文件：</label>
          <select 
            value={selectedPly || ''} 
            onChange={handlePlyChange}
            disabled={analyzingScene || !selectedScene}
          >
            <option value="">-- 请选择PLY文件 --</option>
            {plys.map(ply => (
              <option key={ply} value={ply}>
                {ply}
              </option>
            ))}
          </select>
        </div>
        
        <div className="form-group">
          <label>相机数据：</label>
          <select 
            value={selectedCamera || ''} 
            onChange={handleCameraChange}
            disabled={analyzingScene || !selectedScene}
          >
            <option value="">-- 请选择相机文件 --</option>
            {cameras.map(camera => (
              <option key={camera} value={camera}>
                {camera}
              </option>
            ))}
          </select>
        </div>
        
        <button 
          onClick={handleAnalyzeScene} 
          disabled={analyzingScene || !selectedScene || !selectedPly || !selectedCamera}
          className={analyzingScene ? 'loading' : ''}
        >
          {analyzingScene ? '分析中...' : '分析场景'}
        </button>
      </div>
      
      <div className="control-section">
        <h3>显示控制</h3>
        <div className="form-group">
          <input
            type="checkbox"
            id="show-structural-lines"
            checked={showStructuralLines}
            onChange={toggleStructuralLines}
          />
          <label htmlFor="show-structural-lines">显示结构线</label>
        </div>
      </div>
      
      <div className="control-section">
        <h3>多结构跟踪</h3>
        <p>点击场景中的任意结构将其添加到跟踪列表</p>
        
        <div className="tracking-controls">
          {!isTracking ? (
            <button 
              onClick={onStartTracking}
              disabled={trackedStructureIds.length === 0}
              className="tracking-button start"
            >
              开始跟踪 ({trackedStructureIds.length}个结构)
            </button>
          ) : (
            <button 
              onClick={onStopTracking}
              className="tracking-button stop"
            >
              停止跟踪
            </button>
          )}
          
          <button 
            onClick={onClearAllStructures}
            disabled={isTracking || trackedStructureIds.length === 0}
            className="tracking-button clear"
          >
            清除所有
          </button>
        </div>
        
        {trackedStructureIds.length > 0 && (
          <div className="tracked-structures">
            <h4>已选择结构 ({trackedStructureIds.length})</h4>
            <ul className="structure-list">
              {trackedStructureIds.map(id => (
                <li 
                  key={id}
                  className="structure-item"
                  style={{
                    borderLeftColor: structureColorMap[id] || "#ff6600"
                  }}
                >
                  <div className="structure-info">
                    <span className="structure-name">结构 {id}</span>
                    {structurePositions[id] && (
                      <span className="structure-position">
                        位置: ({formatPosition(structurePositions[id])})
                      </span>
                    )}
                  </div>
                  {!isTracking && (
                    <button 
                      className="remove-btn"
                      onClick={() => onRemoveStructure(id)}
                      title="移除"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      <div className="control-section">
        <h3>人物检测与跟踪</h3>
        <button
          onClick={handleDetectPersons}
          disabled={detectingPersons || !selectedScene || !selectedPly || !selectedCamera}
          className={detectingPersons ? 'loading' : ''}
        >
          {detectingPersons ? '检测中...' : '检测场景中的人物'}
        </button>
        
        {detectedPersons && detectedPersons.length > 0 && (
          <div className="detected-persons">
            <p>检测到 {detectedPersons.length} 个人物：</p>
            <ul className="person-list">
              {detectedPersons.map(person => (
                <li 
                  key={person.id}
                  className={trackedStructureIds.includes(person.id) ? 'selected' : ''}
                  onClick={() => onPersonSelect(person.id)}
                >
                  {person.label || `人物 ${person.id}`} 
                  {trackedStructureIds.includes(person.id) && ' (已选择)'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      <div className="control-section">
        <h3>手动设置人物位置</h3>
        <div className="position-controls">
          <div className="form-group">
            <label>X 坐标:</label>
            <input
              type="number"
              value={personPosition.x}
              onChange={(e) => handlePersonPositionChange('x', e.target.value)}
              disabled={analyzingPerson}
              step="0.5"
            />
          </div>
          
          <div className="form-group">
            <label>Y 坐标:</label>
            <input
              type="number"
              value={personPosition.y}
              onChange={(e) => handlePersonPositionChange('y', e.target.value)}
              disabled={analyzingPerson}
              step="0.5"
            />
          </div>
          
          <div className="form-group">
            <label>Z 坐标:</label>
            <input
              type="number"
              value={personPosition.z}
              onChange={(e) => handlePersonPositionChange('z', e.target.value)}
              disabled={analyzingPerson}
              step="0.5"
            />
          </div>
        </div>
        
        <button
          onClick={handleAnalyzePerson}
          disabled={analyzingPerson || !selectedScene || !selectedPly || !selectedCamera}
          className={analyzingPerson ? 'loading' : ''}
        >
          {analyzingPerson ? '分析中...' : '分析人物位置'}
        </button>
      </div>
    </div>
  );
}

export default ControlPanel;