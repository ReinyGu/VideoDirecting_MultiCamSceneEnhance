/**
 * 场景服务 - 用于与后端API交互
 */

const API_BASE_URL = 'http://localhost:5000/api';

export const SceneService = {
  /**
   * 获取健康状态
   */
  async checkHealth() {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      return await response.json();
    } catch (error) {
      console.error('健康检查失败:', error);
      return { status: 'error', message: error.message };
    }
  },

  /**
   * 获取场景列表
   */
  async getScenes() {
    try {
      const response = await fetch(`${API_BASE_URL}/scenes`);
      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('获取场景列表失败:', error);
      return [];
    }
  },

  /**
   * 分析场景
   * @param {string} plyFile - 点云文件路径
   * @param {string} cameraJson - 相机数据文件路径
   */
  async analyzeScene(plyFile, cameraJson) {
    try {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ply_file: plyFile,
          camera_json: cameraJson,
        }),
      });
      
      const result = await response.json();
      if (result.status === 'success') {
        return result.data;
      } else {
        throw new Error(result.error || '分析失败');
      }
    } catch (error) {
      console.error('场景分析失败:', error);
      throw error;
    }
  },

  /**
   * 分析人物位置
   * @param {string} plyFile - 点云文件路径
   * @param {string} cameraJson - 相机数据文件路径
   * @param {Array<number>} position - 人物位置 [x, y, z]
   */
  async analyzePersonPosition(plyFile, cameraJson, position) {
    try {
      const response = await fetch(`${API_BASE_URL}/analyze_person`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ply_file: plyFile,
          camera_json: cameraJson,
          position,
        }),
      });
      
      const result = await response.json();
      if (result.status === 'success') {
        return result.data;
      } else {
        throw new Error(result.error || '分析失败');
      }
    } catch (error) {
      console.error('人物位置分析失败:', error);
      // 尝试使用模拟数据
      return this.getMockPersonAnalysis(position);
    }
  },

  /**
   * 获取模拟人物位置分析数据
   * @param {Array<number>} position - 人物位置 [x, y, z]
   */
  async getMockPersonAnalysis(position = [0, 0, 0]) {
    try {
      const response = await fetch(`${API_BASE_URL}/mock_person`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ position }),
      });
      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('获取模拟人物分析失败:', error);
      // 如果API请求失败，返回一个默认的模拟数据
      return {
        subject_position: position,
        visible_cameras: {
          "0": {
            distance: 5.0,
            shot_type: "中景",
            position: [0, 0, 5],
            direction: [0, 0, -1]
          }
        },
        camera_count: 1
      };
    }
  },

  /**
   * 获取模拟场景数据（开发测试用）
   */
  async getMockScene() {
    try {
      const response = await fetch(`${API_BASE_URL}/mock_scene`);
      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('获取模拟场景失败:', error);
      // 如果API请求失败，返回一个默认的模拟数据
      return this.getDefaultMockData();
    }
  },

  /**
   * 获取场景中所有检测到的人物
   * @param {string} plyFile - 点云文件路径
   * @param {string} cameraJson - 相机数据文件路径
   */
  async detectAllPersons(plyFile, cameraJson) {
    try {
      const response = await fetch(`${API_BASE_URL}/detect_persons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ply_file: plyFile,
          camera_json: cameraJson,
        }),
      });
      
      const result = await response.json();
      if (result.status === 'success') {
        return result.data;
      } else {
        throw new Error(result.error || '人物检测失败');
      }
    } catch (error) {
      console.error('获取人物数据失败:', error);
      // 返回模拟的人物数据
      return this.getMockPersonsData();
    }
  },
  
  /**
   * 获取模拟的多个人物数据
   */
  getMockPersonsData() {
    return {
      persons: [
        {
          id: 1,
          position: [2, 0, 3],
          label: "人物1",
          confidence: 0.95
        },
        {
          id: 2,
          position: [-2, 0, 1],
          label: "人物2",
          confidence: 0.88
        },
        {
          id: 3,
          position: [0, 0, -2],
          label: "人物3",
          confidence: 0.92
        }
      ]
    };
  },

  /**
   * 获取结构的实时位置（多结构跟踪）
   * @param {string} plyFile - 点云文件路径
   * @param {string} cameraJson - 相机数据文件路径
   * @param {number} structureId - 结构ID
   */
  async getStructurePosition(plyFile, cameraJson, structureId) {
    try {
      const response = await fetch(`${API_BASE_URL}/track_structure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ply_file: plyFile,
          camera_json: cameraJson,
          structure_id: structureId
        }),
      });
      
      const result = await response.json();
      if (result.status === 'success') {
        return result.data.position;
      } else {
        throw new Error(result.error || '获取结构位置失败');
      }
    } catch (error) {
      console.error('获取结构位置失败:', error);
      // 返回模拟的移动位置
      return this.getMockStructureMovement(structureId);
    }
  },
  
  /**
   * 模拟结构移动
   * @param {number} structureId - 结构ID
   * @param {Array<number>} currentPosition - 当前位置 [x, y, z]
   */
  getMockStructureMovement(structureId, currentPosition = null) {
    // 如果没有提供当前位置，从默认场景数据中查找
    if (!currentPosition) {
      const defaultData = this.getDefaultMockData();
      const structure = defaultData.structures.find(s => s.id === structureId);
      
      if (structure) {
        currentPosition = structure.center;
      } else {
        // 如果找不到，使用默认位置
        currentPosition = [0, 0, 0];
      }
    }
    
    // 模拟小范围随机移动
    return [
      currentPosition[0] + (Math.random() - 0.5) * 0.2,
      currentPosition[1] + (Math.random() - 0.5) * 0.05, // Y轴移动较小
      currentPosition[2] + (Math.random() - 0.5) * 0.2
    ];
  },
  
  /**
   * 批量获取多个结构的位置（多结构跟踪性能优化）
   * @param {string} plyFile - 点云文件路径
   * @param {string} cameraJson - 相机数据文件路径
   * @param {Array<number>} structureIds - 结构ID数组
   */
  async getMultipleStructurePositions(plyFile, cameraJson, structureIds) {
    try {
      const response = await fetch(`${API_BASE_URL}/track_multiple_structures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ply_file: plyFile,
          camera_json: cameraJson,
          structure_ids: structureIds
        }),
      });
      
      const result = await response.json();
      if (result.status === 'success') {
        return result.data.positions; // {structureId: [x,y,z], ...}
      } else {
        throw new Error(result.error || '获取多结构位置失败');
      }
    } catch (error) {
      console.error('获取多结构位置失败:', error);
      
      // 返回模拟的多结构位置
      const mockPositions = {};
      for (const id of structureIds) {
        mockPositions[id] = this.getMockStructureMovement(id);
      }
      return mockPositions;
    }
  },

  /**
   * 获取默认的模拟数据（前端使用的备用数据）
   */
  getDefaultMockData() {
    return {
      cameras: {
        "0": {
          position: [0, 0, 5],
          direction: [0, 0, -1],
          label: "正面平视中景",
          visible_structures: [0, 1, 2]
        },
        "1": {
          position: [5, 0, 0],
          direction: [-1, 0, 0],
          label: "右侧平视中景",
          visible_structures: [1, 3]
        },
        "2": {
          position: [0, 0, -5],
          direction: [0, 0, 1],
          label: "后方平视全景",
          visible_structures: [2, 3, 4]
        },
        "3": {
          position: [-5, 0, 0],
          direction: [1, 0, 0],
          label: "左侧平视特写",
          visible_structures: [0, 4]
        }
      },
      structures: [
        {
          id: 0,
          center: [-2, 0, 2],
          point_count: 1000,
          sample_points: [[-2, 0, 2], [-2.1, 0.1, 2.1], [-1.9, -0.1, 1.9]]
        },
        {
          id: 1,
          center: [2, 0, 2],
          point_count: 1200,
          sample_points: [[2, 0, 2], [2.1, 0.1, 2.1], [1.9, -0.1, 1.9]]
        },
        {
          id: 2,
          center: [0, 0, 3],
          point_count: 800,
          sample_points: [[0, 0, 3], [0.1, 0.1, 3.1], [-0.1, -0.1, 2.9]]
        },
        {
          id: 3,
          center: [2, 0, -2],
          point_count: 900,
          sample_points: [[2, 0, -2], [2.1, 0.1, -2.1], [1.9, -0.1, -1.9]]
        },
        {
          id: 4,
          center: [-2, 0, -2],
          point_count: 1100,
          sample_points: [[-2, 0, -2], [-2.1, 0.1, -2.1], [-1.9, -0.1, -1.9]]
        }
      ],
      structural_lines: [
        {
          id: 0,
          point: [0, 0, 0],
          direction: [1, 0, 0]
        },
        {
          id: 1,
          point: [0, 0, 0],
          direction: [0, 1, 0]
        },
        {
          id: 2,
          point: [0, 0, 0],
          direction: [0, 0, 1]
        }
      ]
    };
  },

  /**
   * 加载本地点云和相机文件（测试用）
   * @param {string} plyFilePath - 本地点云文件路径
   * @param {string} cameraJsonPath - 本地相机配置文件路径
   */
  async loadLocalTestData(plyFilePath, cameraJsonPath) {
    try {
      // 在真实环境中，应该通过后端API加载这些文件
      // 这里我们模拟API调用
      console.log(`加载本地测试文件:
       - 点云: ${plyFilePath}
       - 相机: ${cameraJsonPath}`);
      
      // 模拟API调用延迟
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 由于浏览器安全限制，无法直接访问本地文件
      // 在实际应用中，这里应该向后端发送请求
      // 为了测试，我们返回一个基于文件路径的模拟数据
      
      // 提取文件名作为场景标识
      const plyFileName = plyFilePath.split('\\').pop() || 'point_cloud.ply';
      const folderName = plyFilePath.includes('truck') ? 'truck' : 'unknown';
      
      // 创建基于模拟数据的场景
      const mockData = this.getDefaultMockData();
      
      // 添加一些特定于测试文件的信息
      mockData.metadata = {
        source: {
          ply_file: plyFilePath,
          camera_json: cameraJsonPath
        },
        scene_name: folderName,
        iteration: plyFilePath.includes('iteration_') 
          ? parseInt(plyFilePath.match(/iteration_(\d+)/)[1]) 
          : 7000
      };
      
      return mockData;
    } catch (error) {
      console.error('加载本地测试文件失败:', error);
      throw error;
    }
  },

  // 加载预定义的测试文件
  async loadPredefinedTestData() {
    try {
      const plyFile = "C:\\Users\\Reiny Gu\\Desktop\\VideoDirecting_MultiCamSceneEnhance\\gaussian-splatting\\output\\truck\\point_cloud\\iteration_7000\\point_cloud.ply";
      const cameraFile = "C:\\Users\\Reiny Gu\\Desktop\\VideoDirecting_MultiCamSceneEnhance\\gaussian-splatting\\output\\truck\\cameras.json";
      
      console.log("加载预定义测试文件:", { plyFile, cameraFile });
      
      // 模拟加载时间
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockCameras = this._getMockCameraData();
      const mockStructureLines = this._getMockStructureLines();
      const mockStructures = this._getMockStructures();
      
      // 获取点云数据
      const mockPointCloud = this._generateMockPointCloud(8000);
      
      return {
        plyFile,
        cameraFile,
        cameras: mockCameras,
        structuralLines: mockStructureLines,
        structures: mockStructures,
        point_cloud: mockPointCloud,
        success: true
      };
    } catch (error) {
      console.error("加载预定义测试文件失败:", error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  /**
   * 获取模拟相机数据（内部方法）
   * @private
   */
  _getMockCameraData() {
    return {
      "0": {
        position: [0, 0, 5],
        direction: [0, 0, -1],
        label: "正面平视 (中景)",
        visible_structures: [0, 1, 2]
      },
      "1": {
        position: [5, 0, 0],
        direction: [-1, 0, 0],
        label: "右侧平视 (近景)",
        visible_structures: [1, 3]
      },
      "2": {
        position: [0, 0, -5],
        direction: [0, 0, 1],
        label: "后方平视 (全景)",
        visible_structures: [2, 3, 4]
      },
      "3": {
        position: [-5, 0, 0],
        direction: [1, 0, 0],
        label: "左侧平视 (特写)",
        visible_structures: [0, 4]
      },
      "4": {
        position: [3, 3, 3],
        direction: [-0.577, -0.577, -0.577],
        label: "俯视45° (全景)",
        visible_structures: [0, 1, 2, 3, 4]
      },
      "5": {
        position: [-3, 3, -3],
        direction: [0.577, -0.577, 0.577],
        label: "左后方俯视 (中景)",
        visible_structures: [2, 4]
      }
    };
  },
  
  /**
   * 获取模拟结构线数据（内部方法）
   * @private
   */
  _getMockStructureLines() {
    return [
      {
        id: 0,
        point: [0, 0, 0],
        direction: [1, 0, 0],
        length: 10
      },
      {
        id: 1,
        point: [0, 0, 0],
        direction: [0, 1, 0],
        length: 10
      },
      {
        id: 2,
        point: [0, 0, 0],
        direction: [0, 0, 1],
        length: 10
      },
      {
        id: 3,
        point: [2, 0, 2],
        direction: [1, 0, 1],
        length: 5
      },
      {
        id: 4,
        point: [-2, 0, -2],
        direction: [-1, 0, -1],
        length: 5
      }
    ];
  },
  
  /**
   * 获取模拟结构数据（内部方法）
   * @private
   */
  _getMockStructures() {
    return [
      {
        id: 0,
        center: [2, 0, 2],
        point_count: 1000,
        sample_points: [
          [2, 0, 2], 
          [2.1, 0.1, 2.1], 
          [1.9, -0.1, 1.9]
        ]
      },
      {
        id: 1,
        center: [-2, 0, 2],
        point_count: 1200,
        sample_points: [
          [-2, 0, 2], 
          [-2.1, 0.1, 2.1], 
          [-1.9, -0.1, 1.9]
        ]
      }
    ];
  },

  /**
   * 获取简化的点云数据
   * @param {string} plyFile - PLY文件路径
   * @param {Object} options - 配置选项
   * @param {number} options.maxPoints - 最大点数
   */
  async getSimplifiedPointCloud(plyFile, options = {}) {
    try {
      const { maxPoints = 10000 } = options;
      
      console.log(`获取简化点云数据: ${plyFile}, 最大点数: ${maxPoints}`);
      
      // 在实际应用中，这里应该向后端请求简化的点云数据
      // 但为了测试，我们生成一些随机的点
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 模拟的点云数据
      const mockPointCloud = this._generateMockPointCloud(maxPoints);
      
      return {
        success: true,
        point_cloud: mockPointCloud
      };
    } catch (error) {
      console.error('获取简化点云失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  /**
   * 生成模拟的点云数据
   * @private
   * @param {number} pointCount - 点的数量
   * @returns {Object} 点云数据对象
   */
  _generateMockPointCloud(pointCount = 5000) {
    const points = [];
    const colors = [];
    
    // 生成一个盒子形状的点云
    const boxSize = 10; // 盒子尺寸
    const halfSize = boxSize / 2;
    
    // 生成点
    for (let i = 0; i < pointCount; i++) {
      // 随机生成点的位置
      const x = (Math.random() * boxSize - halfSize) * Math.random(); // 不均匀分布，集中在中心
      const y = (Math.random() * boxSize - halfSize) * Math.random();
      const z = (Math.random() * boxSize - halfSize) * Math.random();
      
      points.push([x, y, z]);
      
      // 根据位置生成颜色
      const r = (x + halfSize) / boxSize;
      const g = (y + halfSize) / boxSize;
      const b = (z + halfSize) / boxSize;
      
      colors.push([r, g, b]);
    }
    
    // 添加一些特征结构
    // 1. 中心矩形结构
    for (let i = 0; i < pointCount * 0.2; i++) {
      const x = (Math.random() * 4 - 2);
      const y = (Math.random() * 2);
      const z = (Math.random() * 4 - 2);
      
      points.push([x, y, z]);
      colors.push([0.7, 0.7, 0.7]); // 灰白色
    }
    
    // 2. 一些柱状结构
    for (let i = 0; i < 4; i++) {
      const centerX = (i % 2) * 4 - 2;
      const centerZ = Math.floor(i / 2) * 4 - 2;
      
      for (let j = 0; j < pointCount * 0.05; j++) {
        const x = centerX + (Math.random() - 0.5);
        const y = Math.random() * 3;
        const z = centerZ + (Math.random() - 0.5);
        
        points.push([x, y, z]);
        colors.push([0.3, 0.6, 0.9]); // 蓝色
      }
    }
    
    return {
      points,
      colors,
      count: points.length
    };
  }
}; 