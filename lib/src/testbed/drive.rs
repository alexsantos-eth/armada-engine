//! Carrying a scripted frame out: the world it changes, the player it moves and the shots it
//! writes.
//!
//! Everything decided lives in `iso::testbed` and in [`crate::testbed::run`]; this file is the
//! glue that reaches into the game, the screen and the disk, so it has no decisions of its own
//! and is looked at through a real run (`scripts/run-scene.sh`), by the FILE_STRUCTURE
//! exception for GPU and IO-bound code.

use std::path::{Path, PathBuf};

use iso::camera::CameraFocus;
use iso::grid::to_chunk_coord;
use iso::player::physics::{create_player, get_player_render_position};
use iso::projection::GridPoint;
use iso::services::NormalizedInput;
use iso::testbed::{
    Scene, SceneEdit, ScriptFrame, apply_edit, entities_in, player_of, refusal_note,
};
use macroquad::prelude::*;

use crate::game::Game;
use crate::game::ground::ChunkGround;
use crate::testbed::run::{ScriptRun, phase_name, shots_asked, summary};
use crate::testbed::scene_file::{REPORT_FILE, shot_path};

/// Opens the run `scene` describes: pins its light, frames its camera, builds what it asks for
/// and puts the player where it wants it.
pub(crate) fn begin(game: &mut Game, scene: &Scene, out: PathBuf) {
    let mut run = ScriptRun::new(scene, out);
    if let Some(phase) = scene.phase {
        game.phase_override = Some(phase.bake());
    }
    for edit in &scene.edits {
        take_edit(game, &mut run, edit);
    }
    if let Some(at) = scene.player {
        place_player(game, at);
    }
    println!(
        "scene: {} edit(s), {} step(s), shots to write: {}",
        scene.edits.len(),
        scene.steps.len(),
        shots_asked(scene).join(", ")
    );
    game.script = Some(run);
}

/// The frame the script asks for, carried out: the world changed, the player placed, and the
/// input the player is given this frame. `None` ends the process, with the report written.
pub(crate) fn advance(game: &mut Game) -> Option<(NormalizedInput, Vec<String>)> {
    let mut run = game.script.take()?;
    let frame = run.frame(game.lit);
    carry_out(game, &mut run, &frame);
    if frame.done {
        finish(game, &run);
        return None;
    }
    let shots = frame.shots.clone();
    game.script = Some(run);
    Some((frame.input, shots))
}

/// Everything a frame changes before the world is stepped.
fn carry_out(game: &mut Game, run: &mut ScriptRun, frame: &ScriptFrame) {
    if let Some(phase) = frame.phase {
        game.phase_override = Some(phase);
    }
    for edit in &frame.edits {
        take_edit(game, run, edit);
    }
    if let Some(at) = frame.teleport {
        place_player(game, at);
    }
}

/// What stands on a cell, by the blueprint it was built from.
fn standing_on(game: &Game, at: [i32; 2]) -> Option<String> {
    let [x, y] = at;
    let cell = iso::grid::WorldCoord { x, y };
    game.manager
        .entities_chunk(to_chunk_coord(cell))?
        .iter()
        .find(|entity| iso::entities::get_entity_footprint_for(entity).contains(&cell))
        .map(|entity| entity.type_().to_owned())
}

/// Applies one edit, and tells the report what it managed to change.
fn take_edit(game: &mut Game, run: &mut ScriptRun, edit: &SceneEdit) {
    let dressing = game.terrain_look.dressing_mut();
    match apply_edit(&mut game.manager, dressing, edit) {
        Ok(iso::maker::MakerStroke::Nothing) => {
            let at = edit.at();
            let column = game.manager.column_at(at[0], at[1]);
            run.note(refusal_note(at, column, standing_on(game, at).as_deref()));
        }
        Ok(_) => {
            let [x, y] = edit.at();
            if let Some(shadows) = game.shadows.as_mut() {
                shadows.forget(to_chunk_coord(iso::grid::WorldCoord { x, y }));
            }
        }
        Err(reason) => run.note(reason),
    }
}

/// Puts the player on the centre of a cell, with the camera already framing it so the next
/// frame is not caught mid-pan.
fn place_player(game: &mut Game, at: [i32; 2]) {
    let [x, y] = at;
    let ground = ChunkGround {
        manager: &game.manager,
    };
    game.player = create_player(
        &ground,
        GridPoint {
            x: f64::from(x) + 0.5,
            y: f64::from(y) + 0.5,
        },
    );
    let placed = get_player_render_position(&game.player, 1.0);
    game.camera.x = placed.x;
    game.camera.y = placed.y;
    game.camera_focus = CameraFocus::new(&placed);
    game.drawn_at = (placed.x, placed.y);
}

/// Writes the shots this frame asked for, now that the frame is on screen.
pub(crate) fn write_shots(game: &mut Game, names: &[String]) {
    if names.is_empty() {
        return;
    }
    let Some(mut run) = game.script.take() else {
        return;
    };
    for name in names {
        match shot_path(run.out(), name).map(|path| write_png(&path)) {
            Some(Ok(())) => run.wrote(name),
            Some(Err(reason)) => run.note(reason),
            None => run.note(format!("{name} is not a shot name")),
        }
    }
    game.script = Some(run);
}

/// Writes what is on screen to `path`.
fn write_png(path: &Path) -> Result<(), String> {
    if let Some(directory) = path.parent() {
        std::fs::create_dir_all(directory)
            .map_err(|err| format!("could not make {}: {err}", directory.display()))?;
    }
    get_screen_data().export_png(&path.to_string_lossy());
    println!("shot: {}", path.display());
    Ok(())
}

/// Writes the report of a finished run and says in one line what happened.
fn finish(game: &Game, run: &ScriptRun) {
    let phase = game
        .phase_override
        .unwrap_or_else(|| iso::lighting::phase_at(game.clock.tick));
    let mut report = run.report(
        Some(player_of(
            game.player.x,
            game.player.y,
            game.player.elevation,
        )),
        entities_in(&game.manager, &game.shown),
        phase,
    );
    report.sounds = game
        .audio
        .events
        .iter()
        .map(|event| format!("{event:?}"))
        .collect();
    report.ambience = [
        iso::services::AmbientLoop::Wind,
        iso::services::AmbientLoop::Geyser,
    ]
    .into_iter()
    .map(|bed| (format!("{bed:?}"), game.audio.ambient_level(bed)))
    .filter(|(_, level)| *level > 0.0)
    .collect();
    let path = run.out().join(REPORT_FILE);
    match serde_json::to_string_pretty(&report) {
        Ok(json) => write_report(&path, &json),
        Err(err) => eprintln!("warning: could not write the report: {err}"),
    }
    println!("{}", summary(&report));
    println!("phase: {}", phase_name(phase));
}

/// Writes the report, warning rather than failing when it cannot.
fn write_report(path: &Path, json: &str) {
    if let Some(directory) = path.parent()
        && let Err(err) = std::fs::create_dir_all(directory)
    {
        eprintln!("warning: could not make {}: {err}", directory.display());
        return;
    }
    match std::fs::write(path, json.as_bytes()) {
        Ok(()) => println!("report: {}", path.display()),
        Err(err) => eprintln!(
            "warning: could not write the report at {}: {err}",
            path.display()
        ),
    }
}
