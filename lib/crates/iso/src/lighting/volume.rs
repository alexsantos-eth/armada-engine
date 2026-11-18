//! An entity's solid shape, as the ground bake casts it: columns of its footprint and the
//! heights each one is solid between, read off the voxel model the sprite was rendered from.
//!
//! The cut-out a sprite leaves on screen mixes depth with height and has no idea which side of
//! the entity a branch stands on, so a shadow laid from it slides off the entity that casts it
//! (see `lighting/mod.md`). A volume knows where every column stands on the ground, so its
//! shadow lands where the sun would put it.

use super::shadow::{ShadowProjection, lift_reach};

/// One column of a volume: a square of ground and up to two runs of solid height over it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VolumeColumn {
    /// Centre of the column's square, in world tiles from the centre of the anchor cell.
    pub x: f64,
    pub y: f64,
    /// Solid runs, `(low, high)` in blocks above the entity's own ground; `len` of them used.
    pub runs: [(f64, f64); 2],
    pub len: u8,
}

impl VolumeColumn {
    pub fn runs(&self) -> &[(f64, f64)] {
        &self.runs[..usize::from(self.len)]
    }
}

/// The solid shape of one entity's artwork.
#[derive(Clone, Debug, PartialEq)]
pub struct ShadowVolume {
    /// Side of every column's square, in world tiles.
    pub column: f64,
    pub columns: Vec<VolumeColumn>,
    /// The box the columns' squares cover: `(min_x, min_y, max_x, max_y)` from the anchor cell's
    /// centre, in world tiles.
    pub bounds: (f64, f64, f64, f64),
    /// The highest solid point, in blocks.
    pub top: f64,
}

impl ShadowVolume {
    pub fn new(column: f64, columns: Vec<VolumeColumn>) -> Self {
        let half = column / 2.0;
        let (mut bounds, mut top) = (
            (
                f64::INFINITY,
                f64::INFINITY,
                f64::NEG_INFINITY,
                f64::NEG_INFINITY,
            ),
            0.0_f64,
        );
        for c in &columns {
            bounds = (
                bounds.0.min(c.x - half),
                bounds.1.min(c.y - half),
                bounds.2.max(c.x + half),
                bounds.3.max(c.y + half),
            );
            top = c.runs().iter().fold(top, |top, run| top.max(run.1));
        }
        Self {
            column,
            columns,
            bounds,
            top,
        }
    }

    /// The box, in world tiles, that this volume's shadow can cover when it stands on `foot`
    /// and the ground it falls on lies at most `deepest` blocks below that foot.
    ///
    /// Every solid point above the receiving ground reaches somewhere between the column it
    /// stands on and the top's reach, so the box is the footprint swept that far down the light.
    pub fn shadow_box(
        &self,
        foot: (f64, f64),
        deepest: f64,
        light: &ShadowProjection,
        metrics: (f64, f64),
    ) -> (f64, f64, f64, f64) {
        let (tile_width, box_height) = metrics;
        let far = lift_reach(light, self.top + deepest, tile_width, box_height).max(0.0);
        let (dx, dy) = (far * light.dir_x, far * light.dir_y);
        let (bx0, by0, bx1, by1) = self.bounds;
        (
            foot.0 + bx0 + dx.min(0.0),
            foot.1 + by0 + dy.min(0.0),
            foot.0 + bx1 + dx.max(0.0),
            foot.1 + by1 + dy.max(0.0),
        )
    }
}

/// Reads the shadow volumes `artifacts/vox/clay/vox_shadow.py` writes, keyed by the sprite's
/// source path as the entity catalogue names it.
///
/// The model's axes are not the world's: model `x` runs down-right on screen, which is world
/// `−y`, model `y` runs down-left, world `−x`, and the anchor cell is the model's last tile
/// along each axis (`grove_x` stands on its anchor and the cell at `+x`, which is the model's
/// first tile along `y`).
pub fn parse_shadow_volumes(bytes: &[u8]) -> Result<Vec<(String, ShadowVolume)>, String> {
    let mut read = Reader { bytes, at: 0 };
    if read.take(4)? != b"ASVL" {
        return Err("not a shadow volume file".into());
    }
    let version = read.u16()?;
    if version != 1 {
        return Err(format!(
            "shadow volume version {version}, this build reads 1"
        ));
    }
    let per_column = f64::from(read.u16()?);
    let per_tile = f64::from(read.u16()?);
    let per_block = f64::from(read.u16()?);
    if per_column <= 0.0 || per_tile <= 0.0 || per_block <= 0.0 {
        return Err("a shadow volume measure is zero".into());
    }
    let entries = read.u32()?;
    let mut out = Vec::with_capacity(entries as usize);
    for _ in 0..entries {
        let length = usize::from(read.u16()?);
        let source = std::str::from_utf8(read.take(length)?)
            .map_err(|_| "a shadow volume name is not UTF-8".to_string())?
            .to_string();
        let tiles_x = f64::from(read.u8()?);
        let tiles_y = f64::from(read.u8()?);
        let count = read.u32()?;
        let anchor_x = per_tile * (tiles_x - 0.5);
        let anchor_y = per_tile * (tiles_y - 0.5);
        let mut columns = Vec::with_capacity(count as usize);
        for _ in 0..count {
            let model_x = (f64::from(read.u8()?) + 0.5) * per_column;
            let model_y = (f64::from(read.u8()?) + 0.5) * per_column;
            let len = read.u8()?;
            let mut runs = [(0.0, 0.0); 2];
            for index in 0..usize::from(len) {
                let low = f64::from(read.u8()?) / per_block;
                let high = (f64::from(read.u8()?) + 1.0) / per_block;
                if let Some(run) = runs.get_mut(index) {
                    *run = (low, high);
                } else {
                    return Err(format!("{source}: a column has more than two runs"));
                }
            }
            columns.push(VolumeColumn {
                x: -(model_y - anchor_y) / per_tile,
                y: -(model_x - anchor_x) / per_tile,
                runs,
                len,
            });
        }
        out.push((source, ShadowVolume::new(per_column / per_tile, columns)));
    }
    Ok(out)
}

struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, count: usize) -> Result<&'a [u8], String> {
        let end = self.at + count;
        let slice = self
            .bytes
            .get(self.at..end)
            .ok_or_else(|| "the shadow volume file ends early".to_string())?;
        self.at = end;
        Ok(slice)
    }

    fn u8(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }

    fn u16(&mut self) -> Result<u16, String> {
        let b = self.take(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    fn u32(&mut self) -> Result<u32, String> {
        let b = self.take(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }
}

#[cfg(test)]
#[path = "volume.test.rs"]
mod tests;
