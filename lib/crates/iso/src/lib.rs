//! Game domain shared by native and WebAssembly clients.

#![forbid(unsafe_code)]

pub mod assets;
pub mod biomes;
pub mod camera;
pub mod entities;
pub mod grid;
pub mod lighting;
pub mod paths;
pub mod player;
pub mod projection;
pub mod scene_order;
pub mod services;
pub mod simulation;
pub mod terrain;
pub mod time;
pub mod water;
pub mod world;
