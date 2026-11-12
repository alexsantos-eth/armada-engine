//! Tests for the ambient particles: when they spawn, where they go and how they leave.

use super::*;
use iso::terrain::TerrainMaterial;

/// A flat, generated world over grass at elevation two.
fn env(phase: BakePhase, surface: TerrainMaterial) -> SpawnEnv<'static> {
    let height_at: &'static dyn Fn(i32, i32) -> Option<f64> =
        Box::leak(Box::new(|_x, _y| Some(2.0)));
    let surface_at: &'static dyn Fn(i32, i32) -> Option<TerrainMaterial> =
        Box::leak(Box::new(move |_x, _y| Some(surface)));
    let wind_at: &'static dyn Fn(i32, i32) -> f64 = Box::leak(Box::new(|_x, _y| 4.0));
    SpawnEnv {
        center_x: 8.0,
        center_y: 8.0,
        phase,
        time_ms: 0.0,
        height_at,
        surface_at,
        wind_at,
    }
}

/// Runs `seconds` of frames at 16 ms, returning the particle system afterwards.
fn run(particles: &mut AmbientParticles, seconds: f64, env: &SpawnEnv<'static>) {
    let frames = (seconds * 1000.0 / 16.0).ceil() as i32;
    for _ in 0..frames {
        particles.update(16.0, env);
    }
}

#[test]
fn a_new_swarm_is_empty() {
    let particles = AmbientParticles::new(7);
    assert_eq!(particles.live(), 0);
}

#[test]
fn pollen_spawns_in_day_and_stays_off_the_water() {
    let mut day = AmbientParticles::new(7);
    run(&mut day, 2.0, &env(BakePhase::Day, TerrainMaterial::Grass));
    assert!(day.live() > 0, "a bright day over grass grows motes");
    assert!(
        day.particles.iter().all(|p| p.kind == AmbientKind::Pollen),
        "and in the day they are pollen"
    );

    let mut on_water = AmbientParticles::new(7);
    run(
        &mut on_water,
        2.0,
        &env(BakePhase::Day, TerrainMaterial::Water),
    );
    assert_eq!(on_water.live(), 0, "no motes over open water");
}

#[test]
fn fireflies_belong_to_the_night_and_the_grass() {
    let mut night = AmbientParticles::new(7);
    run(
        &mut night,
        2.0,
        &env(BakePhase::Night, TerrainMaterial::Grass),
    );
    assert!(night.live() > 0, "a dark night over grass grows fireflies");
    assert!(
        night
            .particles
            .iter()
            .all(|p| p.kind == AmbientKind::Firefly),
        "and nothing else flies at night"
    );

    let mut day = AmbientParticles::new(7);
    run(&mut day, 2.0, &env(BakePhase::Day, TerrainMaterial::Grass));
    assert!(
        day.particles.iter().all(|p| p.kind != AmbientKind::Firefly),
        "no fireflies in the daylight"
    );

    let mut over_water = AmbientParticles::new(7);
    run(
        &mut over_water,
        2.0,
        &env(BakePhase::Night, TerrainMaterial::Water),
    );
    assert_eq!(over_water.live(), 0, "and none over the water");
}

#[test]
fn the_pool_never_grows_past_its_cap() {
    let mut particles = AmbientParticles::new(7);
    for index in 0..MAX_PARTICLES {
        particles.particles.push(Particle::pollen(
            8.0,
            8.0,
            2.0,
            (0.0, 0.0),
            0.5,
            index as f64,
            60_000.0,
        ));
    }
    run(
        &mut particles,
        2.0,
        &env(BakePhase::Day, TerrainMaterial::Grass),
    );
    assert_eq!(
        particles.live(),
        MAX_PARTICLES,
        "a full pool spawns nothing more"
    );
}

#[test]
fn a_long_day_keeps_a_good_share_of_the_pool_in_the_air() {
    let mut particles = AmbientParticles::new(7);
    run(
        &mut particles,
        60.0,
        &env(BakePhase::Day, TerrainMaterial::Grass),
    );
    assert!(
        particles.live() >= 60,
        "motes hang in the air all day: {}",
        particles.live()
    );
}

#[test]
fn a_particle_ends_without_lingering() {
    let mut particles = AmbientParticles::new(7);
    run(
        &mut particles,
        1.0,
        &env(BakePhase::Day, TerrainMaterial::Grass),
    );
    assert!(particles.live() > 0);
    let still = env(BakePhase::Night, TerrainMaterial::Water);
    run(&mut particles, 15.0, &still);
    assert_eq!(
        particles.live(),
        0,
        "everything faded once nothing more spawns"
    );
}

#[test]
fn fade_is_zero_at_both_ends_and_full_in_the_middle() {
    let life = 5000.0;
    assert_eq!(fade(0.0, life), 0.0);
    assert_eq!(fade(life, life), 0.0);
    assert_eq!(fade(life / 2.0, life), 1.0);
    assert!(fade(100.0, life) > 0.0 && fade(100.0, life) < 1.0);
    assert!(fade(life - 100.0, life) > 0.0 && fade(life - 100.0, life) < 1.0);
}

#[test]
fn the_firefly_pulse_stays_within_its_bounds() {
    for step in 0..200 {
        let age = f64::from(step) * 40.0;
        let pulse = firefly_pulse(age, 0.37);
        assert!((0.1..=1.0).contains(&pulse), "pulse {pulse} out of bounds");
    }
}

#[test]
fn the_wind_pushes_a_mote_along() {
    let mut particle = Particle::pollen(4.0, 4.0, 2.0, (0.3, 0.2), 0.5, 0.25, 9000.0);
    let before = particle.height;
    drift(&mut particle, 1000.0);
    assert!(particle.x > 4.0, "a mote travels downwind: {}", particle.x);
    assert!(particle.y > 4.0, "and across it: {}", particle.y);
    assert!(particle.height < before, "and it sinks as it drifts");
}

#[test]
fn the_same_seed_grows_the_same_swarm() {
    let grassy = env(BakePhase::Day, TerrainMaterial::Grass);
    let mut first = AmbientParticles::new(42);
    let mut second = AmbientParticles::new(42);
    run(&mut first, 3.0, &grassy);
    run(&mut second, 3.0, &grassy);
    assert_eq!(first.particles.len(), second.particles.len());
    for (a, b) in first.particles.iter().zip(&second.particles) {
        assert_eq!(a.x.to_bits(), b.x.to_bits());
        assert_eq!(a.y.to_bits(), b.y.to_bits());
        assert_eq!(a.height.to_bits(), b.height.to_bits());
    }
}

#[test]
fn collect_queues_one_voxel_per_particle() {
    let projection = ProjectionConfig {
        tile_width: 280.0,
        tile_height: 140.0,
        elevation_step: Some(160.0),
        origin_x: 640.0,
        origin_y: 300.0,
    };
    let mut particles = AmbientParticles::new(7);
    run(
        &mut particles,
        2.0,
        &env(BakePhase::Night, TerrainMaterial::Grass),
    );

    let mut draws = Vec::new();
    particles.collect(projection, &mut draws);
    assert_eq!(draws.len(), particles.live(), "one chunky voxel each");
    for draw in &draws {
        assert!(
            matches!(draw.kind, crate::assets::sprites::DrawKind::Voxel { .. }),
            "ambient particles draw as voxels"
        );
    }
}
