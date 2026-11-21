//! Game domain shared by native and WebAssembly clients.

#![forbid(unsafe_code)]

pub mod ai;
pub mod assets;
pub mod biomes;
pub mod camera;
pub mod det_math;
pub mod entities;
pub mod grid;
pub mod harvest;
pub mod inventory;
pub mod items;
pub mod lighting;
pub mod maker;
pub mod npc;
pub mod paths;
pub mod player;
pub mod projection;
pub mod scene_order;
pub mod services;
pub mod settlements;
pub mod simulation;
pub mod terrain;
pub mod testbed;
pub mod time;
pub mod water;
pub mod wind;
pub mod world;
