"""
Herb Garden Pot - Blender Python Script
Run via: Blender > Scripting tab > Open > Run Script

Creates:
  - A terracotta-style pot with tapered sides
  - A drainage hole at the bottom
  - A saucer/drainage plate beneath
  - Leaf and dot embossed decorations on the outside
"""

import bpy
import bmesh
import math
from mathutils import Vector

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for col in bpy.data.collections:
        bpy.data.collections.remove(col)


def make_material(name, color, roughness=0.8, metallic=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def assign_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def create_materials():
    terracotta = make_material("Terracotta", (0.72, 0.35, 0.18), roughness=0.9)
    saucer_mat = make_material("Saucer", (0.60, 0.28, 0.14), roughness=0.85)
    leaf_mat   = make_material("LeafDecor", (0.22, 0.55, 0.20), roughness=0.7)
    dot_mat    = make_material("DotDecor",  (0.95, 0.80, 0.30), roughness=0.6)
    return terracotta, saucer_mat, leaf_mat, dot_mat


# ---------------------------------------------------------------------------
# Pot body
# ---------------------------------------------------------------------------

def create_pot(terracotta_mat):
    """
    Lathe-style pot: wider at the top, narrower at the base, with a rim.
    A boolean cylinder punches the drainage hole through the bottom.
    """
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=64,
        radius=1.0,
        depth=1.4,
        location=(0, 0, 0.7),
    )
    pot = bpy.context.active_object
    pot.name = "HerbPot"

    bm = bmesh.new()
    bm.from_mesh(pot.data)

    # Scale each ring of vertices to give a tapered, slightly curved profile
    # Rings from bottom (z≈0) to top (z≈1.4)
    profile = {
        # z_local : x_scale
        0.0:  0.62,   # base
        0.07: 0.60,   # just above base (pinch)
        0.35: 0.75,
        0.65: 0.90,
        0.90: 1.00,   # widest
        1.05: 1.02,
        1.20: 0.98,   # slight in-curve
        1.40: 1.05,   # rim flare
    }

    z_min = min(v.co.z for v in bm.verts)
    z_max = max(v.co.z for v in bm.verts)
    z_range = z_max - z_min

    def lerp_scale(z_local):
        keys = sorted(profile.keys())
        for i in range(len(keys) - 1):
            z0, z1 = keys[i], keys[i + 1]
            if z0 <= z_local <= z1:
                t = (z_local - z0) / (z1 - z0)
                return profile[z0] * (1 - t) + profile[z1] * t
        return 1.0

    for v in bm.verts:
        z_local = (v.co.z - z_min) / z_range
        s = lerp_scale(z_local)
        v.co.x *= s
        v.co.y *= s

    bm.to_mesh(pot.data)
    bm.free()
    pot.data.update()

    assign_material(pot, terracotta_mat)

    # --- Drainage hole (boolean subtract) ---
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32, radius=0.08, depth=0.25, location=(0, 0, 0.05)
    )
    hole_cutter = bpy.context.active_object
    hole_cutter.name = "DrainageCutter"

    bool_mod = pot.modifiers.new(name="DrainageHole", type='BOOLEAN')
    bool_mod.operation = 'DIFFERENCE'
    bool_mod.object = hole_cutter

    bpy.context.view_layer.objects.active = pot
    bpy.ops.object.modifier_apply(modifier="DrainageHole")

    hole_cutter.select_set(True)
    bpy.ops.object.delete()

    return pot


# ---------------------------------------------------------------------------
# Drainage saucer
# ---------------------------------------------------------------------------

def create_saucer(saucer_mat):
    """Shallow dish that sits under the pot."""
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=64, radius=1.10, depth=0.10, location=(0, 0, -0.05)
    )
    saucer = bpy.context.active_object
    saucer.name = "DrainageSaucer"

    bm = bmesh.new()
    bm.from_mesh(saucer.data)

    z_min = min(v.co.z for v in bm.verts)
    z_max = max(v.co.z for v in bm.verts)

    for v in bm.verts:
        # Dish the top face inward
        if abs(v.co.z - z_max) < 0.01:
            r = math.sqrt(v.co.x**2 + v.co.y**2)
            v.co.z -= 0.04 * (1 - (r / 1.10) ** 2)
        # Narrow base ring
        if abs(v.co.z - z_min) < 0.01:
            v.co.x *= 0.88
            v.co.y *= 0.88

    bm.to_mesh(saucer.data)
    bm.free()
    saucer.data.update()

    assign_material(saucer, saucer_mat)
    return saucer


# ---------------------------------------------------------------------------
# Decorative leaf (flat emboss mesh)
# ---------------------------------------------------------------------------

def create_leaf(parent_radius, z_center, angle_deg, leaf_mat):
    """
    A simple oval leaf shape placed on the pot surface facing outward.
    """
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=1, location=(0, 0, 0), segments=12, ring_count=8
    )
    leaf = bpy.context.active_object
    leaf.name = "LeafDecor"

    # Flatten into a leaf oval
    leaf.scale = (0.10, 0.055, 0.012)
    bpy.ops.object.transform_apply(scale=True)

    # Position on pot surface
    angle_rad = math.radians(angle_deg)
    x = parent_radius * math.cos(angle_rad)
    y = parent_radius * math.sin(angle_rad)
    leaf.location = (x, y, z_center)

    # Orient leaf to face outward radially
    leaf.rotation_euler = (
        math.radians(90),
        0,
        angle_rad + math.radians(90),
    )

    assign_material(leaf, leaf_mat)
    return leaf


# ---------------------------------------------------------------------------
# Decorative dot (small raised circle)
# ---------------------------------------------------------------------------

def create_dot(parent_radius, z_height, angle_deg, dot_mat):
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=0.035, location=(0, 0, 0), segments=10, ring_count=6
    )
    dot = bpy.context.active_object
    dot.name = "DotDecor"

    angle_rad = math.radians(angle_deg)
    x = parent_radius * math.cos(angle_rad)
    y = parent_radius * math.sin(angle_rad)
    dot.location = (x, y, z_height)

    assign_material(dot, dot_mat)
    return dot


# ---------------------------------------------------------------------------
# Assemble decorations
# ---------------------------------------------------------------------------

def create_decorations(leaf_mat, dot_mat):
    decoration_objects = []

    # --- Three bands of leaves at different heights ---
    leaf_configs = [
        # (z_center, angles, radius)
        (0.55, range(0, 360, 45),  0.92),   # mid band
        (0.85, range(22, 360, 60), 0.99),   # upper band
        (0.30, range(10, 360, 72), 0.78),   # lower band
    ]
    for z, angles, r in leaf_configs:
        for angle in angles:
            decoration_objects.append(create_leaf(r, z, angle, leaf_mat))

    # --- Dot clusters between leaf bands ---
    dot_configs = [
        (0.45, range(22, 360, 45), 0.95),
        (0.70, range(0,  360, 60), 0.99),
    ]
    for z, angles, r in dot_configs:
        for angle in angles:
            decoration_objects.append(create_dot(r, z, angle, dot_mat))

    return decoration_objects


# ---------------------------------------------------------------------------
# Soil surface (flat dark circle inside pot)
# ---------------------------------------------------------------------------

def create_soil():
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=48, radius=0.88, depth=0.04, location=(0, 0, 1.36)
    )
    soil = bpy.context.active_object
    soil.name = "Soil"
    soil_mat = make_material("Soil", (0.15, 0.09, 0.05), roughness=1.0)
    assign_material(soil, soil_mat)
    return soil


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    clear_scene()

    terracotta_mat, saucer_mat, leaf_mat, dot_mat = create_materials()

    pot    = create_pot(terracotta_mat)
    saucer = create_saucer(saucer_mat)
    decors = create_decorations(leaf_mat, dot_mat)
    soil   = create_soil()

    # Parent everything to pot for easy movement
    all_children = [saucer, soil] + decors
    for obj in all_children:
        obj.select_set(True)
    pot.select_set(True)
    bpy.context.view_layer.objects.active = pot
    bpy.ops.object.parent_set(type='OBJECT', keep_transform=True)

    # Nice viewport framing
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.scene.cursor.location = (0, 0, 0.7)

    # Add a sun lamp for quick preview
    bpy.ops.object.light_add(type='SUN', location=(3, -3, 5))
    sun = bpy.context.active_object
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(45), 0, math.radians(45))

    # Camera
    bpy.ops.object.camera_add(location=(3.5, -3.5, 2.5))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(65), 0, math.radians(45))
    bpy.context.scene.camera = cam

    print("Herb pot created successfully!")
    print("  - Terracotta pot with tapered profile and rim")
    print("  - Drainage hole at bottom center")
    print("  - Saucer / drainage plate underneath")
    print("  - Leaf emboss decorations (green) in 3 bands")
    print("  - Dot accent decorations (gold) between bands")
    print("  - Soil surface layer inside pot")


main()
