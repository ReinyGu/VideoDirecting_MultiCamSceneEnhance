from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os
import json
from structure import analyze_scene, analyze_person_in_scene

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 数据目录配置
DATA_DIR = os.environ.get('DATA_DIR', '../../gaussian-splatting/output')
UPLOAD_FOLDER = os.path.join(DATA_DIR, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({"status": "ok", "message": "服务正常运行"})

@app.route('/api/analyze', methods=['POST'])
def analyze():
    """
    分析场景结构
    需要提供：
    - ply_file: 点云文件路径
    - camera_json: 相机数据文件路径
    """
    try:
        data = request.json
        ply_file = data.get('ply_file')
        camera_json = data.get('camera_json')
        
        # 验证文件存在
        if not os.path.exists(ply_file):
            return jsonify({"error": f"点云文件不存在: {ply_file}"}), 400
        if not os.path.exists(camera_json):
            return jsonify({"error": f"相机数据文件不存在: {camera_json}"}), 400
        
        # 执行场景分析
        result = analyze_scene(ply_file, camera_json)
        
        # 保存分析结果到文件
        output_file = os.path.join(DATA_DIR, 'analysis_result.json')
        with open(output_file, 'w') as f:
            json.dump(result, f, indent=2)
        
        return jsonify({"status": "success", "data": result})
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/analyze_person', methods=['POST'])
def analyze_person():
    """
    分析人物在场景中的位置和相机可见性
    需要提供：
    - ply_file: 点云文件路径
    - camera_json: 相机数据文件路径
    - position: 人物位置 [x, y, z]
    """
    try:
        data = request.json
        ply_file = data.get('ply_file')
        camera_json = data.get('camera_json')
        position = data.get('position')
        
        # 验证参数
        if not ply_file or not camera_json or not position:
            return jsonify({"error": "缺少必要参数"}), 400
            
        if not os.path.exists(ply_file):
            return jsonify({"error": f"点云文件不存在: {ply_file}"}), 400
        if not os.path.exists(camera_json):
            return jsonify({"error": f"相机数据文件不存在: {camera_json}"}), 400
        
        # 执行人物位置分析
        result = analyze_person_in_scene(ply_file, camera_json, position)
        
        return jsonify({"status": "success", "data": result})
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/scenes', methods=['GET'])
def list_scenes():
    """列出可用的场景"""
    try:
        # 遍历数据目录，查找所有包含点云和相机数据的场景
        scenes = []
        for root, dirs, files in os.walk(DATA_DIR):
            ply_files = [f for f in files if f.endswith('.ply')]
            json_files = [f for f in files if f.endswith('.json')]
            
            if ply_files and json_files:
                scene_name = os.path.basename(root)
                scenes.append({
                    "name": scene_name,
                    "path": root,
                    "ply_files": ply_files,
                    "json_files": json_files
                })
            # 特别处理点云子文件夹
            elif 'point_cloud' in dirs:
                for pc_root, pc_dirs, pc_files in os.walk(os.path.join(root, 'point_cloud')):
                    pc_ply_files = [f for f in pc_files if f.endswith('.ply')]
                    if pc_ply_files:
                        # 查找当前场景目录中的相机JSON文件
                        scene_json_files = []
                        for r, d, scene_files in os.walk(root):
                            if r == root:  # 只在场景根目录查找JSON
                                scene_json_files = [f for f in scene_files if f.endswith('.json')]
                        
                        if scene_json_files:  # 只有同时有PLY和JSON才添加
                            sub_scene_name = f"{os.path.basename(root)}/{os.path.basename(pc_root)}"
                            scenes.append({
                                "name": sub_scene_name,
                                "path": pc_root,
                                "ply_files": pc_ply_files,
                                "json_files": scene_json_files,
                                "json_dir": root  # 记录JSON文件所在目录
                            })
        
        return jsonify({"status": "success", "data": scenes})
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/results/<path:filename>', methods=['GET'])
def get_result(filename):
    """获取分析结果文件"""
    return send_from_directory(DATA_DIR, filename)

@app.route('/api/mock_scene', methods=['GET'])
def get_mock_scene():
    """提供模拟场景数据"""
    # 创建模拟数据用于前端测试
    mock_data = {
        "cameras": {
            "0": {
                "position": [0, 0, 5],
                "direction": [0, 0, -1],
                "label": "正面平视中景",
                "visible_structures": [0, 1, 2]
            },
            "1": {
                "position": [5, 0, 0],
                "direction": [-1, 0, 0],
                "label": "右侧平视中景",
                "visible_structures": [1, 3]
            },
            "2": {
                "position": [0, 0, -5],
                "direction": [0, 0, 1],
                "label": "后方平视全景",
                "visible_structures": [2, 3, 4]
            },
            "3": {
                "position": [-5, 0, 0],
                "direction": [1, 0, 0],
                "label": "左侧平视特写",
                "visible_structures": [0, 4]
            }
        },
        "structures": [
            {
                "id": 0,
                "center": [-2, 0, 2],
                "point_count": 1000,
                "sample_points": [[-2, 0, 2], [-2.1, 0.1, 2.1], [-1.9, -0.1, 1.9]],
                "sample_colors": [[0.8, 0.2, 0.2], [0.8, 0.3, 0.2], [0.7, 0.2, 0.3]]
            },
            {
                "id": 1,
                "center": [2, 0, 2],
                "point_count": 1200,
                "sample_points": [[2, 0, 2], [2.1, 0.1, 2.1], [1.9, -0.1, 1.9]],
                "sample_colors": [[0.2, 0.8, 0.2], [0.3, 0.8, 0.2], [0.2, 0.7, 0.3]]
            },
            {
                "id": 2,
                "center": [0, 0, 3],
                "point_count": 800,
                "sample_points": [[0, 0, 3], [0.1, 0.1, 3.1], [-0.1, -0.1, 2.9]],
                "sample_colors": [[0.2, 0.2, 0.8], [0.3, 0.2, 0.8], [0.2, 0.3, 0.7]]
            },
            {
                "id": 3,
                "center": [2, 0, -2],
                "point_count": 900,
                "sample_points": [[2, 0, -2], [2.1, 0.1, -2.1], [1.9, -0.1, -1.9]],
                "sample_colors": [[0.8, 0.8, 0.2], [0.8, 0.7, 0.3], [0.7, 0.8, 0.2]]
            },
            {
                "id": 4,
                "center": [-2, 0, -2],
                "point_count": 1100,
                "sample_points": [[-2, 0, -2], [-2.1, 0.1, -2.1], [-1.9, -0.1, -1.9]],
                "sample_colors": [[0.8, 0.2, 0.8], [0.7, 0.3, 0.8], [0.8, 0.2, 0.7]]
            }
        ],
        "structural_lines": [
            {
                "id": 0,
                "point": [0, 0, 0],
                "direction": [1, 0, 0]
            },
            {
                "id": 1,
                "point": [0, 0, 0],
                "direction": [0, 1, 0]
            },
            {
                "id": 2,
                "point": [0, 0, 0],
                "direction": [0, 0, 1]
            }
        ]
    }
    
    return jsonify({"status": "success", "data": mock_data})

@app.route('/api/mock_person', methods=['POST'])
def get_mock_person_analysis():
    """提供模拟人物位置分析"""
    try:
        data = request.json
        position = data.get('position', [0, 0, 0])
        
        # 创建模拟相机可见性数据
        mock_data = {
            "subject_position": position,
            "visible_cameras": {
                "0": {
                    "distance": 5.0,
                    "shot_type": "中景",
                    "position": [0, 0, 5],
                    "direction": [0, 0, -1]
                },
                "3": {
                    "distance": 7.5,
                    "shot_type": "全景",
                    "position": [-5, 0, 0],
                    "direction": [1, 0, 0]
                }
            },
            "camera_count": 2
        }
        
        return jsonify({"status": "success", "data": mock_data})
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)