#!/usr/bin/env python3
"""Ask the edit model for a detailed version of each terrain base. Raw results only: the
compositing that keeps them tileable is terrain_compose.py.
Usage: terrain_paint.py <bases_dir> <work> <name>..."""
import concurrent.futures, os, sys
import cairosvg
from PIL import Image
from falrun import run, data_uri
from repaint import MODEL, letterbox, spend, _cost

REF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ref_village.png")
HEAD = ("The FIRST image is the exact block to keep. The SECOND image is a scene that shows the "
        "art style to copy.\n")
TAIL = ("\nSTYLE: chunky low-poly voxel art, flat cel-shaded faces, clean and readable, no "
        "outlines, no photographic texture and no noise.\n"
        "CRITICAL: keep the exact silhouette, size, straight edges and 2:1 isometric camera of "
        "the first image. Do NOT mirror, flip or rotate it. Nothing may stick out past the "
        "block and nothing stands beside it.\n"
        "LIGHTING: the sun is on the UPPER RIGHT: the right face is brighter than the left.\n"
        "The background must be pure flat white, with no ground, no drop shadow and no "
        "gradient. Output a square 1:1 image.")
CUBE = ("Redraw the single terrain cube of the first image as a finished game tile that will "
        "be repeated thousands of times side by side, so its detail must be SUBTLE, small and "
        "evenly spread, with no big feature and nothing near the edges of the top. ")
WHAT = {
    "grass": CUBE + "It is a grass block. TOP: the same flat bright grass green, with a light "
             "scatter of tiny square tufts of slightly darker and slightly lighter green, flat "
             "on the surface. No flowers, no stones, no dirt. SIDES: a band of grass on top "
             "hanging over in small uneven square teeth, and under it olive-brown earth with a "
             "few faint horizontal layers, small embedded pebbles and thin roots.",
    "ground": CUBE + "It is a bare olive-brown earth block. TOP: the same flat earth colour "
              "with a few tiny flat pebbles, small cracks and slightly darker and lighter "
              "square patches. SIDES: earth with a few faint horizontal layers, small embedded "
              "pebbles and thin roots.",
    "sand": CUBE + "It is a beach sand block. TOP: the same flat pale yellow sand with faint "
            "wind ripples drawn as short soft lines, a few tiny shells and tiny pebbles. "
            "SIDES: a paler sand layer on top and darker packed sand below with faint "
            "horizontal layers and a few small embedded pebbles.",
    "earth": "Redraw the single terrain cube of the first image as a finished game tile. Its "
             "TOP is a trodden dirt road like the paths of the second image: warm orange-brown "
             "packed earth with slightly darker and lighter square patches, a few small flat "
             "grey cobblestones and pebbles pressed into it, and small cracks. Keep the middle "
             "busy and the detail small. SIDES: olive-brown earth with faint layers.",
}
STAIRS = ("Redraw the stone stairs block of the first image as a finished game asset: old "
          "Viking stone steps of weathered grey-brown stone blocks with chiselled edges, worn "
          "treads, a few small tufts of green moss in the joints and small cracks. Keep every "
          "step exactly where it is, with the same number of steps and the same sunken strip "
          "down the middle of the treads.")
for d in ("px", "py", "nx", "ny"):
    WHAT["stairs_" + d] = STAIRS


def paint(bases, work, name, n):
    stem = os.path.join(work, name)
    cairosvg.svg2png(url=os.path.join(bases, name + ".svg"), write_to=f"{stem}_base.png", output_width=1024)
    letterbox(Image.open(f"{stem}_base.png").convert("RGBA")).save(f"{stem}_in.png")
    files = run(MODEL, {"prompt": HEAD + WHAT[name] + TAIL,
                        "image_urls": [data_uri(f"{stem}_in.png"), data_uri(REF)],
                        "num_images": n, "output_format": "png", "aspect_ratio": "1:1"}, f"{stem}_v")
    spend(MODEL, len(files or []))
    return name, len(files or [])


if __name__ == "__main__":
    bases, work, names = sys.argv[1], sys.argv[2], sys.argv[3:]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        jobs = [pool.submit(paint, bases, work, n, 3 if n == "earth" else 2) for n in names]
        for f in concurrent.futures.as_completed(jobs):
            print("RESULT", *f.result(), flush=True)
    print(f"total spent this run: {_cost[0]:.2f} $")
