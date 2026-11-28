import bpy, bmesh, math, sys
import numpy as np
SRC="/mnt/project-files/merchant-npc/hunyuan/tanuki-hunyuan.glb"
OUT=sys.argv[sys.argv.index("--")+1]
FAT=float(sys.argv[sys.argv.index("--")+2]) if len(sys.argv)>sys.argv.index("--")+2 else 0.55
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
body=bpy.data.objects["material"]
bpy.ops.object.select_all(action="DESELECT"); body.select_set(True); bpy.context.view_layer.objects.active=body
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
me=body.data
n=len(me.vertices)
co=np.empty(n*3,dtype=np.float32); me.vertices.foreach_get("co",co); co=co.reshape(-1,3)
x,y,z=co[:,0],co[:,1],co[:,2]
# a mild, uniform fattening of the whole model: a little deeper (front to back), a touch wider
DEPTH=float(sys.argv[sys.argv.index("--")+2]) if len(sys.argv)>sys.argv.index("--")+2 else 1.14
WIDTH=1.04
cy=(y.min()+y.max())/2
co[:,1]=cy+(y-cy)*DEPTH
co[:,0]=x*WIDTH
me.vertices.foreach_set("co",co.ravel()); me.update()
bpy.ops.export_scene.gltf(filepath=OUT,export_format="GLB")
print("saved",OUT)
