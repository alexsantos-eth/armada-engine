//! Everybody alive right now: born with their chunk, stepped together, gone with their chunk.

use std::collections::HashSet;

use super::wander::{Npc, step_npc};
use crate::grid::{ChunkCoord, WorldCoord, to_chunk_coord};
use crate::player::PlayerGround;

/// The characters of the chunks that are live, in the order of their ids. They are not saved:
/// a chunk that comes back gives birth to the same characters, at home again.
#[derive(Clone, Debug, Default)]
pub struct Npcs {
    list: Vec<Npc>,
    chunks: HashSet<ChunkCoord>,
}

impl Npcs {
    /// Matches the crowd to the chunks in `live`: the characters at home in a chunk that left
    /// are dropped, and `spawn` gives birth to those of a chunk that arrived. Returns whether
    /// anybody was born or dropped.
    pub fn sync(
        &mut self,
        live: &[ChunkCoord],
        mut spawn: impl FnMut(ChunkCoord) -> Vec<Npc>,
    ) -> bool {
        let wanted: HashSet<ChunkCoord> = live.iter().copied().collect();
        let before = self.list.len();
        let mut changed = false;
        if self.chunks.iter().any(|chunk| !wanted.contains(chunk)) {
            self.chunks.retain(|chunk| wanted.contains(chunk));
            self.list
                .retain(|npc| wanted.contains(&to_chunk_coord(npc.home)));
            changed = self.list.len() != before;
        }
        for &chunk in live {
            if !self.chunks.insert(chunk) {
                continue;
            }
            let born = spawn(chunk);
            changed |= !born.is_empty();
            self.list.extend(born);
        }
        if changed {
            self.list.sort_by_key(|npc| npc.id);
        }
        changed
    }

    /// Steps everybody `ticks` ticks, in id order. Nobody walks into the cell of `player` nor
    /// into a cell another character holds.
    pub fn step<G: PlayerGround>(&mut self, ground: &G, player: WorldCoord, ticks: u32) {
        for _ in 0..ticks {
            for index in 0..self.list.len() {
                let mut npc = self.list[index];
                let others = &self.list;
                step_npc(&mut npc, ground, |cell| {
                    cell == player
                        || others
                            .iter()
                            .enumerate()
                            .any(|(other, held)| other != index && held.claims(cell))
                });
                self.list[index] = npc;
            }
        }
    }

    /// Everybody, in id order.
    pub fn iter(&self) -> impl Iterator<Item = &Npc> {
        self.list.iter()
    }

    /// How many characters are alive.
    pub fn len(&self) -> usize {
        self.list.len()
    }

    /// Whether nobody is alive.
    pub fn is_empty(&self) -> bool {
        self.list.is_empty()
    }
}

#[cfg(test)]
#[path = "crowd.test.rs"]
mod tests;
