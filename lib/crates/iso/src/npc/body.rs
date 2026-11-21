//! The body a character bumps the player with: a square that goes wherever the character goes,
//! as tall as the character, and the ground that adds those bodies to the world's own.

use super::crowd::Npcs;
use super::look::npc_look;
use super::wander::Npc;
use crate::grid::{ChunkCoord, WorldCoord};
use crate::player::{PlayerGround, PlayerObstacle};
use crate::projection::GridPoint;
use crate::terrain::TerrainColumn;

/// Where a character's body is right now and how big it is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NpcBody {
    /// The point of the grid its square is centred on: where its feet are this tick.
    pub centre: GridPoint,
    /// Side of the square, in blocks.
    pub side: f64,
    /// Level of its feet.
    pub elevation: f64,
    /// How tall it is, in blocks.
    pub height: f64,
}

impl Npc {
    /// Its body this tick: a square centred on its feet, scaled by its look, that follows it
    /// through every step, climb and drop.
    pub fn body(&self) -> NpcBody {
        let pose = self.pose();
        let scale = npc_look(self.kind, self.id).scale;
        let (side, height) = self.kind.body_size();
        NpcBody {
            centre: GridPoint {
                x: pose.x,
                y: pose.y,
            },
            side: side * scale,
            elevation: pose.elevation + pose.height,
            height: height * scale,
        }
    }
}

impl NpcBody {
    /// Whether its square reaches into `cell`.
    pub fn covers(&self, cell: WorldCoord) -> bool {
        let half = self.side / 2.0;
        let reaches = |centre: f64, at: i32| {
            let at = f64::from(at);
            centre + half > at - 0.5 && centre - half < at + 0.5
        };
        reaches(self.centre.x, cell.x) && reaches(self.centre.y, cell.y)
    }

    /// It as something the player bumps into.
    pub fn obstacle(&self) -> PlayerObstacle {
        PlayerObstacle {
            walkable: false,
            height: Some(self.height),
            elevation: Some(self.elevation),
            collision_at: Some(self.side),
            centre: Some(self.centre),
        }
    }
}

impl Npcs {
    /// The bodies that reach into `cell`, as the player bumps into them.
    pub fn obstacles_at(&self, cell: WorldCoord) -> impl Iterator<Item = PlayerObstacle> + '_ {
        self.iter()
            .map(Npc::body)
            .filter(move |body| body.covers(cell))
            .map(|body| body.obstacle())
    }
}

/// `ground` with the characters standing on it: the player bumps into their bodies wherever
/// they are this tick. The characters themselves wander on the bare ground, which is how they
/// keep out of each other's way (by the cells they hold) without blocking themselves.
pub struct NpcGround<'a, G> {
    pub ground: G,
    pub npcs: &'a Npcs,
}

impl<G: PlayerGround> PlayerGround for NpcGround<'_, G> {
    fn column_at(&self, x: i32, y: i32) -> Option<TerrainColumn> {
        self.ground.column_at(x, y)
    }

    fn occupancy_at(&self, x: i32, y: i32) -> Vec<PlayerObstacle> {
        let mut found = self.ground.occupancy_at(x, y);
        found.extend(self.npcs.obstacles_at(WorldCoord { x, y }));
        found
    }

    fn chunk_has(&self, coord: ChunkCoord) -> bool {
        self.ground.chunk_has(coord)
    }

    fn load_around(&mut self, point: GridPoint) {
        self.ground.load_around(point);
    }
}

#[cfg(test)]
#[path = "body.test.rs"]
mod tests;
