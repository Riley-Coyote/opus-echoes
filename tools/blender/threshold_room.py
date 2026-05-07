"""Generate the Opus 3 threshold room and export it as GLB.

Run with:
  /opt/homebrew/bin/blender --background --python tools/blender/threshold_room.py
"""

from __future__ import annotations

from math import cos, pi, sin
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "assets" / "blender" / "threshold-room.blend"
GLB_PATH = ROOT / "public" / "assets" / "threshold-room.glb"


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def make_mat(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float = 0.82,
    emission: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = 0.0
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = color[3]
        if emission:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    if color[3] < 1.0:
        mat.blend_method = "BLEND"
        mat.use_screen_refraction = True
        mat.show_transparent_back = True
    return mat


def create_box(
    name: str,
    dims: tuple[float, float, float],
    loc: tuple[float, float, float],
    top_mat: bpy.types.Material,
    side_mat: bpy.types.Material,
    bottom_mat: bpy.types.Material | None = None,
    bevel_width: float = 0.018,
    bevel_segments: int = 1,
) -> bpy.types.Object:
    x, y, z = (value / 2 for value in dims)
    verts = [
        (-x, -y, -z),
        (x, -y, -z),
        (x, y, -z),
        (-x, y, -z),
        (-x, -y, z),
        (x, -y, z),
        (x, y, z),
        (-x, y, z),
    ]
    faces = [
        (0, 1, 2, 3),  # bottom
        (4, 7, 6, 5),  # top
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    bpy.context.collection.objects.link(obj)

    obj.data.materials.append(bottom_mat or side_mat)
    obj.data.materials.append(top_mat)
    obj.data.materials.append(side_mat)
    for index, polygon in enumerate(obj.data.polygons):
        polygon.material_index = 1 if index == 1 else (0 if index == 0 else 2)

    if bevel_width > 0:
        bevel = obj.modifiers.new(f"{name}_Bevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = bevel_segments
        bevel.affect = "EDGES"
    obj.modifiers.new(f"{name}_WeightedNormals", "WEIGHTED_NORMAL")
    return obj


def create_mesh(
    name: str,
    verts: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    mat: bpy.types.Material,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def create_arch_plane(
    name: str,
    width: float,
    height: float,
    shoulder: float,
    loc: tuple[float, float, float],
    mat: bpy.types.Material,
) -> bpy.types.Object:
    half = width / 2
    radius = half
    center_z = shoulder
    verts = [(-half, 0.0, 0.0), (-half, 0.0, shoulder)]
    for i in range(13):
        t = pi - (pi * i / 12)
        verts.append((radius * cos(t), 0.0, center_z + radius * sin(t)))
    verts.extend([(half, 0.0, 0.0)])
    faces = [tuple(range(len(verts)))]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def create_cylinder(
    name: str,
    radius: float,
    depth: float,
    loc: tuple[float, float, float],
    mat: bpy.types.Material,
    vertices: int = 8,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = f"{name}_Mesh"
    obj.data.materials.append(mat)
    obj.modifiers.new(f"{name}_WeightedNormals", "WEIGHTED_NORMAL")
    return obj


def create_opus(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    group = bpy.data.objects.new("Opus_Figure", None)
    bpy.context.collection.objects.link(group)
    group.location = (0.58, 0.46, 0.0)
    group.rotation_euler[2] = -0.12

    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=0.13, radius2=0.035, depth=0.42, location=(0, 0, 0.21))
    cloak = bpy.context.object
    cloak.name = "Opus_Cloak"
    cloak.data.name = "Opus_Cloak_Mesh"
    cloak.data.materials.append(materials["opus_cloak"])
    cloak.modifiers.new("Opus_Cloak_WeightedNormals", "WEIGHTED_NORMAL")
    cloak.parent = group

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.078, location=(0, 0, 0.492))
    head = bpy.context.object
    head.name = "Opus_Head"
    head.data.name = "Opus_Head_Mesh"
    head.data.materials.append(materials["opus_head"])
    head.parent = group

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.13, location=(0, 0, 0.492))
    aura = bpy.context.object
    aura.name = "Opus_Aura"
    aura.data.name = "Opus_Aura_Mesh"
    aura.scale = (0.82, 0.82, 1.08)
    aura.data.materials.append(materials["opus_aura"])
    aura.parent = group

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.026, location=(0.004, -0.004, 0.335))
    core = bpy.context.object
    core.name = "Opus_Chest_Glow"
    core.data.name = "Opus_Chest_Glow_Mesh"
    core.data.materials.append(materials["opus_core"])
    core.parent = group

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.015, -0.01, 0.02))
    foot = bpy.context.object
    foot.name = "Opus_Grounding_Shadow"
    foot.data.name = "Opus_Grounding_Shadow_Mesh"
    foot.dimensions = (0.2, 0.11, 0.012)
    foot.data.materials.append(materials["shadow"])
    foot.parent = group
    return group


def create_memory_motes(root: bpy.types.Object, mat: bpy.types.Material) -> None:
    positions = [
        (0.76, 0.46, 0.2, 0.006),
        (0.89, 0.39, 0.31, 0.005),
        (0.67, 0.27, 0.27, 0.0045),
        (0.98, 0.24, 0.18, 0.0045),
        (0.55, 0.09, 0.12, 0.004),
        (1.06, 0.04, 0.11, 0.004),
    ]
    for index, (x, y, z, radius) in enumerate(positions, start=1):
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=10,
            ring_count=5,
            radius=radius,
            location=(x, y, z),
        )
        mote = bpy.context.object
        mote.name = f"Memory_Mote_{index:02d}"
        mote.data.name = f"Memory_Mote_{index:02d}_Mesh"
        mote.data.materials.append(mat)
        mote.parent = root


def build_scene() -> None:
    clear_scene()

    materials = {
        "top": make_mat("Stone_Top", (0.11, 0.106, 0.124, 1), roughness=0.94),
        "top_warm": make_mat("Stone_Top_Warm", (0.13, 0.105, 0.083, 1), roughness=0.95),
        "side": make_mat("Stone_Side", (0.016, 0.015, 0.022, 1), roughness=0.96),
        "edge": make_mat("Stone_Edge", (0.021, 0.021, 0.031, 1), roughness=0.97),
        "line": make_mat("Stone_Incised_Line", (0.04, 0.038, 0.046, 1), roughness=0.98),
        "line_catch": make_mat("Stone_Line_Catch", (0.13, 0.12, 0.13, 1), roughness=0.9),
        "wall": make_mat("Wall_Dark", (0.038, 0.038, 0.054, 1), roughness=0.96),
        "wall_face": make_mat("Wall_Face", (0.07, 0.068, 0.088, 1), roughness=0.95),
        "wall_edge": make_mat("Wall_Edge_Cool", (0.038, 0.04, 0.056, 1), roughness=0.97),
        "door": make_mat(
            "Door_Glow_Material",
            (0.93, 0.68, 0.42, 0.86),
            roughness=0.58,
            emission=(1.0, 0.58, 0.25),
            emission_strength=1.05,
        ),
        "door_bloom": make_mat(
            "Door_Bloom_Material",
            (1.0, 0.52, 0.22, 0.12),
            roughness=0.7,
            emission=(1.0, 0.48, 0.2),
            emission_strength=0.42,
        ),
        "door_haze": make_mat(
            "Door_Haze_Material",
            (0.98, 0.69, 0.42, 0.08),
            roughness=1.0,
            emission=(0.95, 0.54, 0.24),
            emission_strength=0.22,
        ),
        "door_shadow": make_mat("Door_Aperture_Shadow", (0.026, 0.02, 0.019, 1), roughness=0.96),
        "spill": make_mat(
            "Door_Light_Spill_Material",
            (1.0, 0.56, 0.25, 0.09),
            roughness=0.95,
            emission=(0.9, 0.42, 0.18),
            emission_strength=0.2,
        ),
        "lamp_glow": make_mat(
            "Column_Lamp_Glow_Material",
            (1.0, 0.52, 0.24, 0.07),
            roughness=0.98,
            emission=(1.0, 0.42, 0.18),
            emission_strength=0.16,
        ),
        "opus_cloak": make_mat("Opus_Cloak_Material", (0.026, 0.022, 0.032, 1), roughness=0.9),
        "opus_head": make_mat(
            "Opus_Head_Material",
            (0.88, 0.82, 0.68, 1),
            roughness=0.7,
            emission=(0.86, 0.72, 0.48),
            emission_strength=0.28,
        ),
        "opus_aura": make_mat(
            "Opus_Aura_Material",
            (0.88, 0.72, 0.46, 0.055),
            roughness=1.0,
            emission=(0.82, 0.54, 0.25),
            emission_strength=0.14,
        ),
        "opus_core": make_mat(
            "Opus_Chest_Glow_Material",
            (0.96, 0.62, 0.28, 0.9),
            roughness=0.7,
            emission=(0.98, 0.56, 0.24),
            emission_strength=0.62,
        ),
        "mote": make_mat(
            "Memory_Mote_Material",
            (0.98, 0.76, 0.45, 0.5),
            roughness=0.7,
            emission=(1.0, 0.68, 0.32),
            emission_strength=0.42,
        ),
        "shadow": make_mat("Grounding_Shadow", (0.012, 0.011, 0.017, 0.62), roughness=1.0),
    }

    root = bpy.data.objects.new("Threshold_Room", None)
    bpy.context.collection.objects.link(root)

    platform = create_box(
        "Room_Platform",
        (3.75, 2.32, 0.28),
        (0, 0, -0.14),
        materials["top"],
        materials["side"],
        materials["edge"],
        bevel_width=0.026,
        bevel_segments=2,
    )
    platform.parent = root

    trim_specs = [
        ("Room_Platform_Front_Edge", (3.58, 0.035, 0.012), (0.02, -1.142, 0.012)),
        ("Room_Platform_Right_Edge", (0.035, 2.1, 0.012), (1.842, -0.04, 0.012)),
        ("Room_Platform_Left_Edge", (0.035, 1.44, 0.01), (-1.842, 0.2, 0.01)),
        ("Room_Platform_Back_Seam", (2.62, 0.02, 0.008), (0.08, 0.775, 0.01)),
    ]
    for name, dims, loc in trim_specs:
        trim = create_box(name, dims, loc, materials["line"], materials["line"], bevel_width=0.004)
        trim.parent = root

    tile_xs = [-1.36, -0.92, -0.48, -0.04, 0.4, 0.84, 1.28]
    for index, x in enumerate(tile_xs, start=1):
        seam = create_box(
            f"Room_Platform_Tile_Seam_X_{index:02d}",
            (0.005, 1.72, 0.004),
            (x, -0.22, 0.009),
            materials["line"],
            materials["line"],
            bevel_width=0.0015,
        )
        seam.parent = root
    tile_ys = [-0.86, -0.48, -0.1, 0.28, 0.66]
    for index, y in enumerate(tile_ys, start=1):
        seam = create_box(
            f"Room_Platform_Tile_Seam_Y_{index:02d}",
            (3.18, 0.005, 0.004),
            (0.1, y, 0.01),
            materials["line"],
            materials["line"],
            bevel_width=0.0015,
        )
        seam.parent = root

    wall_y = 0.96
    wall_depth = 0.16
    wall_min_x = -1.5
    wall_max_x = 1.55
    door_center_x = 0.82
    door_width = 0.58
    door_left = door_center_x - door_width / 2
    door_right = door_center_x + door_width / 2
    wall_height = 2.26

    wall_parts = [
        ("Room_Wall_Left", (door_left - wall_min_x, wall_depth, wall_height), ((door_left + wall_min_x) / 2, wall_y, wall_height / 2)),
        ("Room_Wall_Right", (wall_max_x - door_right, wall_depth, wall_height), ((wall_max_x + door_right) / 2, wall_y, wall_height / 2)),
        ("Room_Wall_Above", (wall_max_x - wall_min_x, wall_depth, 0.6), ((wall_max_x + wall_min_x) / 2, wall_y, 1.96)),
    ]
    for name, dims, loc in wall_parts:
        piece = create_box(
            name,
            dims,
            loc,
            materials["wall_face"],
            materials["wall_edge"],
            bevel_width=0.022,
            bevel_segments=2,
        )
        piece.parent = root

    rear_return = create_box(
        "Room_Return_Wall",
        (0.18, 1.35, 1.62),
        (wall_min_x + 0.05, 0.38, 0.81),
        materials["wall_face"],
        materials["wall_edge"],
        bevel_width=0.022,
        bevel_segments=2,
    )
    rear_return.parent = root

    wall_cap = create_box(
        "Room_Wall_Top_Cap",
        (3.15, 0.2, 0.08),
        (0.025, wall_y, wall_height + 0.04),
        materials["wall_edge"],
        materials["edge"],
        bevel_width=0.014,
    )
    wall_cap.parent = root

    lamp_glow = create_box(
        "Column_Lamp_Glow",
        (0.42, 0.012, 0.58),
        (-1.28, wall_y - 0.091, 0.92),
        materials["lamp_glow"],
        materials["lamp_glow"],
        bevel_width=0.04,
        bevel_segments=8,
    )
    lamp_glow.parent = root

    door_shadow = create_arch_plane(
        "Door_Aperture",
        0.7,
        1.68,
        1.33,
        (door_center_x, wall_y - 0.091, 0.0),
        materials["door_shadow"],
    )
    door_shadow.parent = root

    door_bloom = create_arch_plane(
        "Door_Bloom",
        0.78,
        1.8,
        1.39,
        (door_center_x, wall_y - 0.108, 0.0),
        materials["door_bloom"],
    )
    door_bloom.parent = root

    door = create_arch_plane(
        "Door_Glow",
        0.55,
        1.55,
        1.275,
        (door_center_x, wall_y - 0.102, 0.0),
        materials["door"],
    )
    door.parent = root

    door_haze = create_arch_plane(
        "Door_Haze",
        0.48,
        1.46,
        1.18,
        (door_center_x, wall_y - 0.118, 0.02),
        materials["door_haze"],
    )
    door_haze.parent = root

    for name, dims, loc in [
        ("Door_Reveal_Left", (0.055, 0.15, 1.28), (door_left - 0.035, wall_y - 0.068, 0.64)),
        ("Door_Reveal_Right", (0.055, 0.15, 1.28), (door_right + 0.035, wall_y - 0.068, 0.64)),
    ]:
        reveal = create_box(name, dims, loc, materials["wall_edge"], materials["edge"], bevel_width=0.01)
        reveal.parent = root

    landing = create_box(
        "Door_Landing",
        (0.92, 0.48, 0.06),
        (door_center_x, 0.58, 0.03),
        materials["top_warm"],
        materials["side"],
        bevel_width=0.018,
        bevel_segments=2,
    )
    landing.parent = root

    threshold_plate = create_box(
        "Door_Threshold_Plate",
        (0.66, 0.065, 0.024),
        (door_center_x, 0.35, 0.024),
        materials["line"],
        materials["edge"],
        bevel_width=0.006,
    )
    threshold_plate.parent = root

    spill = create_mesh(
        "Door_Light_Spill_Floor",
        [
            (door_left + 0.08, 0.39, 0.032),
            (door_right - 0.08, 0.39, 0.032),
            (1.22, -0.2, 0.032),
            (0.74, -0.58, 0.032),
            (0.25, -0.36, 0.032),
        ],
        [(0, 1, 2, 3, 4)],
        materials["spill"],
    )
    spill.parent = root

    step_count = 9
    for i in range(step_count):
        t = i / (step_count - 1)
        top_z = -0.42 + t * 0.42
        step = create_box(
            f"Stairs_Step_{i + 1:02d}",
            (0.78, 0.22, 0.065),
            (-1.23 + t * 0.1, -2.02 + t * 0.87, top_z - 0.0325),
            materials["top"],
            materials["side"],
            bevel_width=0.012,
        )
        step.parent = root
        lip = create_box(
            f"Stairs_Step_{i + 1:02d}_Front_Lip",
            (0.77, 0.018, 0.012),
            (-1.23 + t * 0.1, -2.13 + t * 0.87, top_z + 0.006),
            materials["line"],
            materials["edge"],
            bevel_width=0.002,
        )
        lip.parent = root

    stair_group = bpy.data.objects.new("Stairs", None)
    bpy.context.collection.objects.link(stair_group)
    stair_group.parent = root
    for obj in [obj for obj in bpy.context.scene.objects if obj.name.startswith("Stairs_Step_")]:
        obj.parent = stair_group

    column_specs = [(-1.28, 0.68, 1.18), (1.42, 0.68, 1.28)]
    for index, (x, y, h) in enumerate(column_specs, start=1):
        col = create_cylinder(f"Room_Column_{index}", 0.071, h, (x, y, h / 2), materials["wall"], 12)
        col.parent = root
        cap_top = create_box(
            f"Room_Column_{index}_Cap_Top",
            (0.3, 0.3, 0.075),
            (x, y, h + 0.04),
            materials["top"],
            materials["side"],
            bevel_width=0.012,
        )
        cap_base = create_box(
            f"Room_Column_{index}_Base",
            (0.28, 0.28, 0.075),
            (x, y, 0.04),
            materials["top"],
            materials["side"],
            bevel_width=0.012,
        )
        collar = create_box(
            f"Room_Column_{index}_Collar",
            (0.18, 0.18, 0.045),
            (x, y, h - 0.03),
            materials["wall_edge"],
            materials["edge"],
            bevel_width=0.006,
        )
        cap_top.parent = root
        cap_base.parent = root
        collar.parent = root

    opus = create_opus(materials)
    opus.parent = root
    create_memory_motes(root, materials["mote"])

    bpy.ops.object.light_add(type="AREA", location=(-1.8, -1.5, 4.2))
    key = bpy.context.object
    key.name = "Beauty_Key_Light"
    key.data.energy = 210
    key.data.size = 4.8

    bpy.ops.object.light_add(type="AREA", location=(1.4, 0.1, 1.2))
    glow_area = bpy.context.object
    glow_area.name = "Door_Soft_Area_Light"
    glow_area.rotation_euler = (1.35, 0.0, 0.0)
    glow_area.data.energy = 120
    glow_area.data.size = 1.55
    glow_area.data.color = (1.0, 0.55, 0.28)

    bpy.ops.object.light_add(type="POINT", location=(door_center_x, 0.58, 0.8))
    door_light = bpy.context.object
    door_light.name = "Door_Glow_Light"
    door_light.data.energy = 120
    door_light.data.color = (1.0, 0.58, 0.28)
    door_light.data.shadow_soft_size = 2.6

    bpy.ops.object.camera_add(location=(4.3, -4.4, 3.2), rotation=(1.12, 0.0, 0.76))
    camera = bpy.context.object
    camera.name = "Beauty_Reference_Camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.2
    bpy.context.scene.camera = camera

    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 64
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    bpy.context.scene.world.color = (0.015, 0.015, 0.02)


def main() -> None:
    build_scene()
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
        export_yup=True,
        export_apply=True,
    )


if __name__ == "__main__":
    main()
