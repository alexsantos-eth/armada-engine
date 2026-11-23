//! Nine-slice: an exported panel stretched to any size with its corners kept whole. Pure; the
//! HUD draws each (source, destination) pair as a texture part.

use macroquad::math::Rect;

use super::skin::Piece;

/// The (source in image pixels, destination on screen) pairs that draw `piece` around a shape
/// at `shape` (screen pixels, without the room around it). A piece with no slice is one pair;
/// otherwise nine, the corners at their exported size over `scale`, shrunk if the shape is
/// smaller than two of them.
pub(crate) fn nine_slice(piece: &Piece, scale: f32, shape: Rect) -> Vec<(Rect, Rect)> {
    let room = piece.pad / scale;
    let dest = Rect::new(
        shape.x - room,
        shape.y - room,
        shape.w + 2.0 * room,
        shape.h + 2.0 * room,
    );
    if piece.slice <= 0.0 {
        return vec![(Rect::new(0.0, 0.0, piece.width, piece.height), dest)];
    }
    let border = piece.pad + piece.slice;
    let screen_border = border / scale;
    let squeeze = (dest.w / (2.0 * screen_border))
        .min(dest.h / (2.0 * screen_border))
        .min(1.0);
    let sb = screen_border * squeeze;
    let source_cols = [0.0, border, piece.width - border, piece.width];
    let source_rows = [0.0, border, piece.height - border, piece.height];
    let dest_cols = [dest.x, dest.x + sb, dest.x + dest.w - sb, dest.x + dest.w];
    let dest_rows = [dest.y, dest.y + sb, dest.y + dest.h - sb, dest.y + dest.h];
    let mut parts = Vec::with_capacity(9);
    for row in 0..3 {
        for col in 0..3 {
            parts.push((
                Rect::new(
                    source_cols[col],
                    source_rows[row],
                    source_cols[col + 1] - source_cols[col],
                    source_rows[row + 1] - source_rows[row],
                ),
                Rect::new(
                    dest_cols[col],
                    dest_rows[row],
                    dest_cols[col + 1] - dest_cols[col],
                    dest_rows[row + 1] - dest_rows[row],
                ),
            ));
        }
    }
    parts
}

#[cfg(test)]
#[path = "slice.test.rs"]
mod tests;
