# player.py — the player character standing still, 1x1, one block (static, no animation): the
# voxel clay monkey of monkey.py in the walk sheet's standing pose, facing +x (the lit lower-right
# face), on the one-tile canvas (1024 x 853, viewBox 0 -341). The engine draws it only if the
# sheets cannot be loaded. No cast shadow: the engine projects shadows. Requires shapely (see
# iso_lib.py).
from player_walk import CELL_STYLE, draw_figure


def main():
    paths, _ = draw_figure(0.0, False, 0.0)
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="853" viewBox="0 -341 1024 853">\n'
           f'  <g {CELL_STYLE}>\n    ' + "\n    ".join(paths) + "\n  </g>\n</svg>\n")
    open("block.svg", "w").write(svg)
    print(f"ok block.svg, {len(paths)} paths")


if __name__ == "__main__":
    main()
