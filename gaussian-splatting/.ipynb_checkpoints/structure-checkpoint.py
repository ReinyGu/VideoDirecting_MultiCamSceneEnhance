import open3d as o3d
import numpy as np
import matplotlib.pyplot as plt
from plyfile import PlyData
import json
from sklearn.decomposition import PCA

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
        direction = -rotation[2]  # 取旋转矩阵第三行的负向，表示“看向哪里”
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


# 主流程
if __name__ == "__main__":
    ply_file = "output/figure060/point_cloud/iteration_7000/point_cloud.ply"

    pcd = load_3dgs_pointcloud(ply_file)
    print(f"加载的点云包含 {len(pcd.points)} 个点")

    structures = extract_structures_dbscan(pcd, eps=0.1, min_points=100)
    structure_centers = compute_structure_centers(structures)
    #visualize_structures(structures)
    camera_data = load_camera_poses("output/figure060/cameras.json")
    visible_map = compute_visible_structures(camera_data, structure_centers, angle_threshold_deg=180)
    main_axis = estimate_main_axis(structure_centers)
    for cam_id in sorted(visible_map.keys()):
        cam = camera_data[cam_id]
        visible = visible_map[cam_id]
        label = classify_combined_view(cam, visible, structure_centers, main_axis)
        print(f"相机 {cam_id} → {label}，看到了结构簇：{visible}")

    # # ======================== 可视化相机和结构中心 ========================
    # # 相机朝向线
    # cam_meshes = []
    # for cam in camera_data.values():
    #     pos = np.array(cam["position"])
    #     dir = np.array(cam["direction"])
    #     line = o3d.geometry.LineSet()
    #     line.points = o3d.utility.Vector3dVector([pos, pos + dir * 0.5])
    #     line.lines = o3d.utility.Vector2iVector([[0, 1]])
    #     line.colors = o3d.utility.Vector3dVector([[1, 0, 0]])  # 红色
    #     cam_meshes.append(line)

    # # 结构中心点
    # center_pcd = o3d.geometry.PointCloud()
    # center_pcd.points = o3d.utility.Vector3dVector(structure_centers)
    # center_pcd.paint_uniform_color([0, 1, 0])  # 绿色

    # # 可视化
    # o3d.visualization.draw_geometries([center_pcd] + cam_meshes)