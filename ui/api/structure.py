import open3d as o3d
import numpy as np
import matplotlib.pyplot as plt
from plyfile import PlyData
import json
from sklearn.decomposition import PCA
import math
import os
import copy



# 从3DGS训练结果输出的点云文件中加载点和颜色
def load_3dgs_pointcloud(ply_file):
    plydata = PlyData.read(ply_file)

    points = []
    colors = []

    for v in plydata['vertex']:
        # 位置
        x, y, z = v['x'], v['y'], v['z']
        points.append([x, y, z])

        # 颜色：使用 f_dc_0/1/2（原始是线性空间，可能要 gamma 矫正）
        r, g, b = v['f_dc_0'], v['f_dc_1'], v['f_dc_2']
        rgb = np.clip([r, g, b], 0, 1)
        colors.append(rgb)

    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(np.array(points))
    pcd.colors = o3d.utility.Vector3dVector(np.array(colors))
    return pcd

# DBSCAN 聚类结构提取
def extract_structures_dbscan(pcd, eps=0.05, min_points=30):
    labels = np.array(pcd.cluster_dbscan(eps=eps, min_points=min_points, print_progress=True))
    max_label = labels.max()
    print(f"共检测到 {max_label + 1} 个结构")

    structures = []
    for i in range(max_label + 1):
        structure_points = np.asarray(pcd.points)[labels == i]
        structure_colors = np.asarray(pcd.colors)[labels == i]

        structure = o3d.geometry.PointCloud()
        structure.points = o3d.utility.Vector3dVector(structure_points)
        structure.colors = o3d.utility.Vector3dVector(structure_colors)

        structures.append(structure)

    return structures

# 可视化所有提取的结构
def visualize_structures(structures):
    vis_list = []
    colors = plt.cm.get_cmap("tab20")(np.linspace(0, 1, len(structures)))
    for structure, color in zip(structures, colors):
        structure.paint_uniform_color(color[:3])
        vis_list.append(structure)

    o3d.visualization.draw_geometries(vis_list)

# 为每个结构计算结构中心
def compute_structure_centers(structures):
    centers = []
    for s in structures:
        pts = np.asarray(s.points)
        center = np.mean(pts, axis=0)
        centers.append(center)
    return np.array(centers)

# ===== 新增：结构线提取功能 =====

# 从点云中提取主要平面
def extract_planes(pcd, max_planes=5, distance_threshold=0.05, min_points=500):
    """提取点云中的主要平面"""
    planes = []
    # remaining_points = pcd.clone()
    remaining_points = copy.deepcopy(pcd)
    
    for _ in range(max_planes):
        if len(np.asarray(remaining_points.points)) < min_points:
            break
            
        # 使用RANSAC提取平面
        try:
            plane_model, inliers = remaining_points.segment_plane(
                distance_threshold=distance_threshold, 
                ransac_n=3, 
                num_iterations=1000)
            
            if len(inliers) < min_points:
                break
                
            # 提取平面点云
            plane_cloud = remaining_points.select_by_index(inliers)
            planes.append((plane_model, plane_cloud))
            
            # 移除已找到的平面点
            remaining_points = remaining_points.select_by_index(inliers, invert=True)
            
        except Exception as e:
            print(f"提取平面过程中出错: {e}")
            break
            
    return planes

# 计算两个平面的交线
def compute_plane_intersection(plane1, plane2):
    """计算两个平面的交线"""
    # 平面方程: ax + by + cz + d = 0
    a1, b1, c1, d1 = plane1
    a2, b2, c2, d2 = plane2
    
    # 交线方向向量(法向量的叉积)
    line_dir = np.cross([a1, b1, c1], [a2, b2, c2])
    
    # 检查平面是否近似平行
    if np.linalg.norm(line_dir) < 1e-6:
        return None
        
    # 归一化方向向量
    line_dir = line_dir / np.linalg.norm(line_dir)
    
    # 求交线上的一点
    # 使用线性代数求解
    A = np.array([
        [a1, b1, c1],
        [a2, b2, c2],
        line_dir
    ])
    b = np.array([-d1, -d2, 0])
    
    try:
        point_on_line = np.linalg.solve(A, b)
        return (point_on_line, line_dir)
    except np.linalg.LinAlgError:
        return None

# 提取场景中的结构线
def extract_structural_lines(pcd):
    """提取场景中的主要结构线"""
    # 提取主要平面
    planes = extract_planes(pcd)
    print(f"提取到 {len(planes)} 个主要平面")
    
    # 计算平面交线
    lines = []
    for i in range(len(planes)):
        for j in range(i+1, len(planes)):
            plane1_model, _ = planes[i]
            plane2_model, _ = planes[j]
            
            line = compute_plane_intersection(plane1_model, plane2_model)
            if line is not None:
                lines.append(line)
    
    print(f"生成了 {len(lines)} 条结构线")
    return lines, planes

# 可视化结构线
def visualize_structural_lines(pcd, lines, line_length=5.0):
    """可视化点云和结构线"""
    line_sets = []
    
    # 创建线段用于可视化
    for point, direction in lines:
        line_set = o3d.geometry.LineSet()
        
        # 生成交线上的两个点
        p1 = point - direction * line_length
        p2 = point + direction * line_length
        
        points = [p1, p2]
        line_set.points = o3d.utility.Vector3dVector(points)
        line_set.lines = o3d.utility.Vector2iVector([[0, 1]])
        
        # 给每条线随机颜色
        color = np.random.rand(3).tolist()
        line_set.colors = o3d.utility.Vector3dVector([color])
        
        line_sets.append(line_set)
    
    # 可视化
    o3d.visualization.draw_geometries([pcd] + line_sets)

# 加载相机位姿
def load_camera_poses(json_path):
    import json
    with open(json_path, 'r') as f:
        data = json.load(f)  # data 是一个列表

    cameras = {}

    for entry in data:
        cam_id = entry['id']
        position = np.array(entry['position'])
        rotation = np.array(entry['rotation'])
        direction = -rotation[2]  # 取旋转矩阵第三行的负向，表示"看向哪里"
        direction = direction / np.linalg.norm(direction)

        cameras[cam_id] = {
            "position": position,
            "rotation": rotation,
            "direction": direction,
            "img_name": entry.get("img_name", ""),
            "fx": entry.get("fx", None),
            "fy": entry.get("fy", None)
        }

    return cameras

# 计算相机可见的结构簇
def compute_visible_structures(camera_data, structure_centers, angle_threshold_deg=30):
    visible_map = {}  # cam_id -> [visible_structure_ids]

    angle_threshold_rad = np.radians(angle_threshold_deg)

    for cam_id, cam in camera_data.items():
        cam_pos = np.array(cam["position"])
        cam_dir = np.array(cam["direction"])
        visible_structures = []

        for i, struct_center in enumerate(structure_centers):
            vec_to_structure = struct_center - cam_pos
            vec_to_structure /= np.linalg.norm(vec_to_structure)

            cos_theta = np.dot(cam_dir, vec_to_structure)
            angle = np.arccos(np.clip(cos_theta, -1.0, 1.0))

            if angle < angle_threshold_rad:
                visible_structures.append(i)

        visible_map[cam_id] = visible_structures

    return visible_map

# 估计主轴
def estimate_main_axis(structure_centers):
    pca = PCA(n_components=3)
    pca.fit(structure_centers)
    main_axis = pca.components_[0]  # 第一主成分方向
    return main_axis

def classify_combined_view(cam, visible_structures, structure_centers, main_axis):
    if not visible_structures:
        return "无视角"

    # ===== 水平方向（左/右/前/后） =====
    cam_dir = np.array(cam["direction"])
    cam_2d = np.array([cam_dir[0], cam_dir[2]])
    main_2d = np.array([main_axis[0], main_axis[2]])
    cam_2d /= np.linalg.norm(cam_2d)
    main_2d /= np.linalg.norm(main_2d)

    dot = np.dot(cam_2d, main_2d)
    cross = np.cross(main_2d, cam_2d)
    angle_h = np.arccos(np.clip(dot, -1.0, 1.0)) * 180 / np.pi

    if angle_h < 30:
        horizontal = "正面"
    elif angle_h > 150:
        horizontal = "后方"
    elif cross > 0:
        horizontal = "左侧"
    else:
        horizontal = "右侧"

    # ===== 垂直方向（俯视/仰视/平视） =====
    cam_y_dir = cam_dir[1]
    if cam_y_dir < -0.4:
        vertical = "俯视"
    elif cam_y_dir > 0.4:
        vertical = "仰视"
    else:
        vertical = "平视"

    # ===== 视角范围（特写/中景/全景） =====
    centers = [structure_centers[i] for i in visible_structures]
    avg_center = np.mean(centers, axis=0)
    dist = np.linalg.norm(np.array(cam["position"]) - avg_center)

    if dist < 1.5 and len(visible_structures) < 10:
        scale = "特写"
    elif dist > 4.0 and len(visible_structures) > 20:
        scale = "全景"
    else:
        scale = "中景"

    return f"{horizontal}{vertical}{scale}"

# ===== 新增：人物跟踪与相机分析功能 =====

# 射线与线段相交检测
def ray_line_segment_intersection(ray_origin, ray_dir, line_p1, line_p2, epsilon=1e-6):
    """检测射线与线段是否相交（使用更直观的方法）"""
    # 确保所有输入都是NumPy数组
    ray_origin = np.array(ray_origin, dtype=np.float64)
    ray_dir = np.array(ray_dir, dtype=np.float64) 
    line_p1 = np.array(line_p1, dtype=np.float64)
    line_p2 = np.array(line_p2, dtype=np.float64)
    
    # 计算线段的方向向量和长度
    line_vec = line_p2 - line_p1
    line_length = np.linalg.norm(line_vec)
    
    if line_length < epsilon:
        return False  # 线段太短
    
    # 归一化方向向量
    ray_dir_norm = ray_dir / np.linalg.norm(ray_dir)
    line_vec_norm = line_vec / line_length
    
    # 计算叉积来确定是否平行
    cross_prod = np.cross(ray_dir_norm, line_vec_norm)
    cross_mag = np.linalg.norm(cross_prod)
    
    if cross_mag < epsilon:
        # 射线和线段几乎平行
        return False
    
    # 我们现在使用向量公式来计算交点
    # 参考: https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection
    
    # 构建平面并求射线与平面的交点
    # 使用线段和叉积构建一个平面
    plane_normal = cross_prod / cross_mag
    
    # 计算从ray_origin到线段起点的向量
    w = line_p1 - ray_origin
    
    # 计算denom = dot(plane_normal, ray_dir)
    denom = np.dot(plane_normal, ray_dir_norm)
    
    if abs(denom) < epsilon:
        return False  # 射线与平面平行
    
    # 计算射线参数t
    t = np.dot(plane_normal, w) / denom
    
    if t < 0:
        return False  # 交点在射线反方向
    
    # 计算交点
    intersection = ray_origin + t * ray_dir_norm
    
    # 检查交点是否在线段上
    # 计算交点到线段起点的向量
    w = intersection - line_p1
    
    # 计算投影长度
    proj_length = np.dot(w, line_vec_norm)
    
    # 交点必须在线段上
    return 0 <= proj_length <= line_length

# 检查相机是否能看到主体
def check_camera_visibility(camera, subject_position, structural_lines, max_distance=10.0):
    """检查相机是否能看到指定位置的主体（增强版本）"""
    try:
        # 转换为NumPy数组并确保类型正确
        cam_pos = np.array(camera["position"], dtype=np.float64)
        cam_dir = np.array(camera["direction"], dtype=np.float64)
        subject_pos = np.array(subject_position, dtype=np.float64)
        
        # 计算相机到主体的向量
        to_subject = subject_pos - cam_pos
        distance = np.linalg.norm(to_subject)
        
        if distance > max_distance:
            return False, distance, "超出最大距离"
        
        # 归一化
        to_subject_norm = to_subject / distance
        cam_dir_norm = cam_dir / np.linalg.norm(cam_dir)
        
        # 检查主体是否在相机前方(视场内)
        dot_product = np.dot(cam_dir_norm, to_subject_norm)
        if dot_product <= 0:
            return False, distance, "在相机后方"
        
        # 检查视线是否被结构线阻挡
        for line_data in structural_lines:
            point, direction = line_data
            point = np.array(point, dtype=np.float64)
            direction = np.array(direction, dtype=np.float64)
            
            # 生成线段的两个端点
            line_length = max_distance * 2  # 足够长的线段
            line_p1 = point - direction * (line_length / 2)
            line_p2 = point + direction * (line_length / 2)
            
            # 使用改进的相交检测函数
            if ray_line_segment_intersection(cam_pos, to_subject, line_p1, line_p2, epsilon=1e-5):
                return False, distance, "被结构线阻挡"
        
        # 确定拍摄类型
        shot_type = "中景"
        if distance < 2.0:
            shot_type = "特写"
        elif distance > 7.0:
            shot_type = "全景"
        
        return True, distance, shot_type
        
    except Exception as e:
        # 如果发生任何错误，记录下来并返回不可见
        print(f"相机可见性检查出错: {e}")
        return False, 0.0, f"检查出错: {str(e)}"

# 分析主体位置与相机可见性
def analyze_subject_visibility(subject_position, cameras, structural_lines):
    """分析哪些相机可以看到主体及其拍摄方式"""
    visible_cameras = {}
    
    for cam_id, camera in cameras.items():
        is_visible, distance, note = check_camera_visibility(
            camera, subject_position, structural_lines)
        
        if is_visible:
            visible_cameras[cam_id] = {
                "distance": float(distance),
                "shot_type": note,
                "position": camera["position"].tolist(),
                "direction": camera["direction"].tolist()
            }
    
    # 按距离排序
    sorted_cameras = sorted(
        visible_cameras.items(), 
        key=lambda x: x[1]["distance"]
    )
    
    result = {
        "subject_position": subject_position.tolist(),
        "visible_cameras": {k: v for k, v in sorted_cameras},
        "camera_count": len(sorted_cameras)
    }
    
    return result

# 主函数
def analyze_scene(ply_file, camera_json):
    """分析场景并提取结构"""
    # 加载点云
    pcd = load_3dgs_pointcloud(ply_file)
    print(f"加载的点云包含 {len(pcd.points)} 个点")
    
    # 提取场景结构
    structures = extract_structures_dbscan(pcd, eps=0.1, min_points=100)
    structure_centers = compute_structure_centers(structures)
    
    # 提取结构线
    structural_lines, planes = extract_structural_lines(pcd)
    
    # 加载相机数据
    camera_data = load_camera_poses(camera_json)
    visible_map = compute_visible_structures(camera_data, structure_centers, angle_threshold_deg=180)
    main_axis = estimate_main_axis(structure_centers)
    
    # 生成结果
    result = {
        "cameras": {},
        "structures": [],
        "structural_lines": []
    }
    
    # 添加相机信息
    for cam_id in sorted(visible_map.keys()):
        cam = camera_data[cam_id]
        visible = visible_map[cam_id]
        label = classify_combined_view(cam, visible, structure_centers, main_axis)
        result["cameras"][cam_id] = {
            "position": cam["position"].tolist(),
            "direction": cam["direction"].tolist(),
            "label": label,
            "visible_structures": visible
        }
    
    # 添加结构信息
    for i, structure in enumerate(structures):
        points = np.asarray(structure.points).tolist()
        colors = np.asarray(structure.colors).tolist()
        center = structure_centers[i].tolist()
        
        result["structures"].append({
            "id": i,
            "center": center,
            "point_count": len(points),
            # 为避免数据过大，仅保存少量点用于可视化
            "sample_points": points[:100] if len(points) > 100 else points,
            "sample_colors": colors[:100] if len(colors) > 100 else colors
        })
    
    # 添加结构线信息
    for i, line in enumerate(structural_lines):
        point, direction = line
        result["structural_lines"].append({
            "id": i,
            "point": point.tolist(),
            "direction": direction.tolist()
        })
    
    return result

# 创建用于分析人物位置的API函数
def analyze_person_in_scene(ply_file, camera_json, person_position):
    """分析场景中人物位置与相机的关系"""
    # 加载点云和相机
    pcd = load_3dgs_pointcloud(ply_file)
    camera_data = load_camera_poses(camera_json)
    
    # 提取结构线
    structural_lines, _ = extract_structural_lines(pcd)
    
    # 分析人物可见性
    person_pos = np.array(person_position)
    visibility_result = analyze_subject_visibility(person_pos, camera_data, structural_lines)
    
    return visibility_result

# 如果被直接执行
if __name__ == "__main__":
    # ply_file = "..\..\gaussian-splatting\output\truck\point_cloud\iteration_7000\point_cloud.ply"
    # camera_json = "..\..\gaussian-splatting\output\truck\cameras.json"

    ply_file = r"..\..\gaussian-splatting\output\truck\point_cloud\iteration_7000\point_cloud.ply"
    camera_json = r"..\..\gaussian-splatting\output\truck\cameras.json"
    
    
    # 分析场景
    scene_analysis = analyze_scene(ply_file, camera_json)
    print(f"场景分析完成：检测到 {len(scene_analysis['cameras'])} 个相机")
    print(f"提取了 {len(scene_analysis['structural_lines'])} 条结构线")
    
    # 模拟人物位置分析
    person_position = [0, 0, 0]  # 场景中心
    person_analysis = analyze_person_in_scene(ply_file, camera_json, person_position)
    print(f"人物位置分析：可见相机数量 {person_analysis['camera_count']}")
    
    # 可以在这里添加可视化代码
    # visualize_structural_lines(pcd, structural_lines)