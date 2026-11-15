import sys, os
from PIL import Image
names=sys.argv[2:]; C=380
sheet=Image.new('RGB',(C*4,C*len(names)),(238,238,232))
for r,n in enumerate(names):
    for c,f in enumerate([f'work/{n}_base.png']+[f'work/{n}_placed{i}.png' for i in range(3)]):
        if not os.path.exists(f): continue
        im=Image.open(f).convert('RGBA'); im.thumbnail((C-10,C-10))
        sheet.paste(im,(c*C+(C-im.width)//2,r*C+(C-im.height)//2),im)
sheet.save(sys.argv[1])
